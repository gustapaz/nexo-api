export class InputError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const fail = (code, message) => {
  throw new InputError(422, code, message);
};
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export function validate(input) {
  if (
    !object(input) ||
    Object.keys(input).some((k) => !["tasks", "workers"].includes(k))
  )
    fail("invalid_plan", "Envie tasks e workers, sem propriedades extras.");
  const workers = input.workers ?? 2;
  if (!Number.isInteger(workers) || workers < 1 || workers > 8)
    fail("invalid_workers", "workers deve ser inteiro entre 1 e 8.");
  if (
    !Array.isArray(input.tasks) ||
    input.tasks.length < 1 ||
    input.tasks.length > 64
  )
    fail("invalid_tasks", "Defina entre 1 e 64 tarefas.");
  const ids = new Set();
  let edgeCount = 0;
  const tasks = input.tasks
    .map((task) => {
      if (
        !object(task) ||
        Object.keys(task).some(
          (k) => !["id", "label", "duration", "depends_on"].includes(k),
        )
      )
        fail(
          "invalid_task",
          "Tarefa inválida ou com propriedade desconhecida.",
        );
      if (
        typeof task.id !== "string" ||
        !/^[a-z][a-z0-9_-]{0,31}$/.test(task.id) ||
        ids.has(task.id)
      )
        fail(
          "invalid_id",
          "IDs devem ser únicos: letras minúsculas, números, hífen e underscore.",
        );
      ids.add(task.id);
      if (
        !Number.isInteger(task.duration) ||
        task.duration < 1 ||
        task.duration > 86400
      )
        fail(
          "invalid_duration",
          "duration deve ser inteiro entre 1 e 86400 unidades de tempo.",
        );
      if (
        task.label !== undefined &&
        (typeof task.label !== "string" ||
          !task.label.trim() ||
          task.label.length > 80)
      )
        fail("invalid_label", "label deve conter de 1 a 80 caracteres.");
      const deps = task.depends_on ?? [];
      if (
        !Array.isArray(deps) ||
        deps.length > 64 ||
        deps.some((d) => typeof d !== "string") ||
        new Set(deps).size !== deps.length
      )
        fail(
          "invalid_dependencies",
          "Dependências devem ser uma lista de IDs únicos.",
        );
      edgeCount += deps.length;
      return {
        id: task.id,
        label: task.label ?? task.id,
        duration: task.duration,
        depends_on: [...deps].sort(),
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (edgeCount > 256) fail("too_many_edges", "Limite de 256 dependências.");
  if (tasks.some((t) => t.depends_on.some((id) => !ids.has(id))))
    fail(
      "unknown_dependency",
      "Uma dependência referencia uma tarefa inexistente.",
    );
  return { tasks, workers, edgeCount };
}
export function createPlanner(module) {
  return function plan(input) {
    const { tasks, workers, edgeCount } = validate(input),
      n = tasks.length;
    const instance = new WebAssembly.Instance(module, {}),
      e = instance.exports;
    const data = new Uint32Array(1 + n + n * n);
    data[0] = n;
    tasks.forEach((task, i) => {
      data[1 + i] = task.duration;
      task.depends_on.forEach((id) => {
        data[1 + n + tasks.findIndex((t) => t.id === id) * n + i] = 1;
      });
    });
    const ptr = e.alloc(data.length);
    let outPtr = 0,
      outLength = 0;
    try {
      new Uint32Array(e.memory.buffer, ptr, data.length).set(data);
      outPtr = e.solve(ptr, data.length, workers);
      const status = new Uint32Array(e.memory.buffer, outPtr, 1)[0];
      outLength = status === 2 ? 4 : 4 + 10 * n;
      const output = Array.from(
        new Uint32Array(e.memory.buffer, outPtr, outLength),
      );
      if (status === 1)
        throw new InputError(
          409,
          "dependency_cycle",
          "O grafo contém um ciclo; não existe plano executável.",
          {
            blocked_tasks: tasks
              .filter((_, i) => output[4 + 10 * i] === 1)
              .map((t) => t.id),
          },
        );
      if (status !== 0) throw new Error("Engine rejected trusted ABI input");
      const result = tasks.map((task, i) => {
        const row = output.slice(4 + 10 * i, 4 + 10 * (i + 1));
        return {
          ...task,
          earliest_start: row[0],
          earliest_finish: row[1],
          latest_start: row[2],
          latest_finish: row[3],
          slack: row[4],
          critical: row[4] === 0,
          topological_rank: row[5],
          start: row[6],
          finish: row[7],
          worker: row[8] + 1,
        };
      });
      const path = [];
      let current = output[3];
      while (current) {
        path.push(tasks[current - 1].id);
        current = output[4 + 10 * (current - 1) + 9];
      }
      const makespan = output[1],
        work = tasks.reduce((sum, t) => sum + t.duration, 0),
        lower = Math.max(output[2], Math.ceil(work / workers));
      return {
        engine: "rust-wasm",
        version: "1.0.0",
        unit: "time_units",
        summary: {
          tasks: n,
          dependencies: edgeCount,
          workers,
          total_work: work,
          critical_duration: output[2],
          lower_bound: lower,
          makespan,
          idle_capacity: makespan * workers - work,
          utilization: Number((work / (makespan * workers)).toFixed(4)),
          meets_lower_bound: makespan === lower,
        },
        critical_path: path.reverse(),
        topological_order: [...result]
          .sort((a, b) => a.topological_rank - b.topological_rank)
          .map((t) => t.id),
        tasks: result,
        scheduling: {
          algorithm: "highest_bottom_level_first",
          tie_break: "ASCII task ID; lowest available worker ID",
          guarantee:
            "Valid deterministic schedule; global optimality is not guaranteed. CPM ignores worker limits.",
        },
      };
    } finally {
      e.dealloc(ptr, data.length);
      if (outPtr) e.dealloc(outPtr, outLength);
    }
  };
}
