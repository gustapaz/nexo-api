import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPlanner } from "../server/planner.mjs";
import { examples } from "../server/examples.mjs";
const module = new WebAssembly.Module(
  readFileSync(new URL("../engine/pkg/nexo.wasm", import.meta.url)),
);
const plan = createPlanner(module);
const task = (id, duration, depends_on = []) => ({ id, duration, depends_on });
function invariants(result) {
  const byId = new Map(result.tasks.map((t) => [t.id, t]));
  for (const t of result.tasks) {
    assert.equal(t.finish - t.start, t.duration);
    assert.ok(t.start >= t.earliest_start);
    assert.equal(t.earliest_finish - t.earliest_start, t.duration);
    assert.equal(t.latest_start - t.earliest_start, t.slack);
    assert.equal(t.latest_finish - t.latest_start, t.duration);
    assert.ok(t.worker >= 1 && t.worker <= result.summary.workers);
    for (const dep of t.depends_on) {
      assert.ok(t.start >= byId.get(dep).finish);
      assert.ok(t.topological_rank > byId.get(dep).topological_rank);
    }
  }
  for (let w = 1; w <= result.summary.workers; w++) {
    const tasks = result.tasks
      .filter((t) => t.worker === w)
      .sort((a, b) => a.start - b.start);
    for (let i = 1; i < tasks.length; i++)
      assert.ok(tasks[i].start >= tasks[i - 1].finish);
  }
  assert.equal(
    Math.max(...result.tasks.map((t) => t.finish)),
    result.summary.makespan,
  );
  assert.ok(result.summary.makespan >= result.summary.lower_bound);
  assert.equal(
    result.critical_path.reduce((sum, id) => sum + byId.get(id).duration, 0),
    result.summary.critical_duration,
  );
  for (let i = 1; i < result.critical_path.length; i++)
    assert.ok(
      byId
        .get(result.critical_path[i])
        .depends_on.includes(result.critical_path[i - 1]),
    );
}
test("binary is a real dependency-free Rust WASM module", () => {
  assert.deepEqual(WebAssembly.Module.imports(module), []);
  for (const name of ["alloc", "dealloc", "solve", "memory"])
    assert.ok(WebAssembly.Module.exports(module).some((e) => e.name === name));
});
test("release path, slack and worker schedule", () => {
  const r = plan(examples.release.request);
  assert.equal(r.summary.critical_duration, 15);
  assert.equal(r.summary.makespan, 15);
  assert.deepEqual(r.critical_path, ["assets", "build", "review", "deploy"]);
  assert.equal(r.tasks.find((t) => t.id === "tests").slack, 2);
  invariants(r);
});
test("worker contention increases duration beyond critical path", () => {
  const r = plan(examples.bottleneck.request);
  assert.equal(r.summary.critical_duration, 10);
  assert.equal(r.summary.makespan, 12);
  invariants(r);
});
test("one worker consumes exactly total work", () => {
  const r = plan({ ...examples.release.request, workers: 1 });
  assert.equal(r.summary.makespan, r.summary.total_work);
  invariants(r);
});
test("independent tasks with enough workers finish at maximum duration", () => {
  const r = plan({
    workers: 8,
    tasks: [task("a", 2), task("b", 8), task("c", 5)],
  });
  assert.equal(r.summary.makespan, 8);
  invariants(r);
});
test("diamond graph, multiple critical branches and deterministic path", () => {
  const r = plan({
    workers: 2,
    tasks: [
      task("a", 1),
      task("b", 2, ["a"]),
      task("c", 2, ["a"]),
      task("d", 1, ["b", "c"]),
    ],
  });
  assert.deepEqual(r.critical_path, ["a", "b", "d"]);
  assert.ok(r.tasks.every((t) => t.critical));
  assert.equal(r.summary.makespan, 4);
  invariants(r);
});
test("tie IDs use lexical order and lowest free worker", () => {
  const r = plan({
    workers: 2,
    tasks: [task("z", 2), task("b", 2), task("a", 2)],
  });
  assert.equal(r.tasks.find((t) => t.id === "a").worker, 1);
  assert.equal(r.tasks.find((t) => t.id === "b").worker, 2);
  assert.equal(r.tasks.find((t) => t.id === "z").start, 2);
});
test("permuting tasks and dependencies does not change output", () => {
  const input = structuredClone(examples.release.request),
    expected = plan(input);
  input.tasks.reverse().forEach((t) => t.depends_on?.reverse());
  assert.deepEqual(plan(input), expected);
});
test("input is not mutated", () => {
  const input = structuredClone(examples.release.request),
    before = structuredClone(input);
  plan(input);
  assert.deepEqual(input, before);
});
test("cycle and downstream blocked nodes exclude unrelated root", () => {
  assert.throws(
    () =>
      plan({
        tasks: [
          task("a", 1, ["b"]),
          task("b", 1, ["a"]),
          task("c", 1, ["b"]),
          task("free", 1),
        ],
      }),
    (e) =>
      e.status === 409 &&
      JSON.stringify(e.details.blocked_tasks) === '["a","b","c"]',
  );
});
test("self dependency is a cycle", () =>
  assert.throws(
    () => plan({ tasks: [task("a", 1, ["a"])] }),
    (e) => e.code === "dependency_cycle",
  ));
test("simultaneous completions release dependencies at same timestamp", () => {
  const r = plan({
    workers: 2,
    tasks: [task("a", 3), task("b", 3), task("c", 2, ["a", "b"])],
  });
  assert.equal(r.tasks.find((t) => t.id === "c").start, 3);
  invariants(r);
});
test("maximum supported graph and duration do not overflow", () => {
  const tasks = Array.from({ length: 64 }, (_, i) =>
    task(
      "t" + String(i).padStart(2, "0"),
      86400,
      i ? ["t" + String(i - 1).padStart(2, "0")] : [],
    ),
  );
  const r = plan({ workers: 8, tasks });
  assert.equal(r.summary.makespan, 64 * 86400);
  invariants(r);
});
let seed = 12345;
const random = (n) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % n;
};
test("100 seeded DAGs satisfy schedule invariants and recursive CPM oracle", () => {
  for (let round = 0; round < 100; round++) {
    const n = 1 + random(20),
      tasks = Array.from({ length: n }, (_, i) =>
        task("t" + String(i).padStart(2, "0"), 1 + random(30)),
      );
    for (let i = 0; i < n; i++)
      for (let j = 0; j < i; j++)
        if (random(5) === 0) tasks[i].depends_on.push(tasks[j].id);
    const r = plan({ workers: 1 + random(8), tasks });
    invariants(r);
    const memo = new Map();
    function end(id) {
      if (memo.has(id)) return memo.get(id);
      const t = tasks.find((t) => t.id === id),
        v = t.duration + Math.max(0, ...t.depends_on.map(end));
      memo.set(id, v);
      return v;
    }
    assert.equal(
      r.summary.critical_duration,
      Math.max(...tasks.map((t) => end(t.id))),
    );
  }
});
for (const input of [
  null,
  [],
  {},
  { tasks: [] },
  { tasks: [task("a", 0)] },
  { tasks: [task("a", 1.5)] },
  { tasks: [task("a", 86401)] },
  { workers: 0, tasks: [task("a", 1)] },
  { workers: 9, tasks: [task("a", 1)] },
  { tasks: [task("a", 1), task("a", 2)] },
  { tasks: [task("a", 1, ["missing"])] },
  { tasks: [task("a", 1, ["a", "a"])] },
  { tasks: [{ ...task("a", 1), label: "" }] },
  { tasks: [{ ...task("a", 1), surprise: true }] },
  { tasks: [task("__proto__", 1)] },
  { tasks: [task("a", 1)], surprise: true },
])
  test("invalid contract " + JSON.stringify(input), () =>
    assert.throws(
      () => plan(input),
      (e) => e.status === 422,
    ),
  );
test("more than 64 tasks and more than 256 edges rejected", () => {
  assert.throws(
    () =>
      plan({ tasks: Array.from({ length: 65 }, (_, i) => task("t" + i, 1)) }),
    (e) => e.status === 422,
  );
  const tasks = Array.from({ length: 24 }, (_, i) =>
    task(
      "t" + i,
      1,
      Array.from({ length: i }, (_, j) => "t" + j),
    ),
  );
  assert.throws(
    () => plan({ tasks }),
    (e) => e.code === "too_many_edges",
  );
});
test("Rust ABI also rejects malformed integer arrays", () => {
  const e = new WebAssembly.Instance(module, {}).exports;
  const data = new Uint32Array([1, 0, 0]),
    ptr = e.alloc(data.length);
  new Uint32Array(e.memory.buffer, ptr, data.length).set(data);
  const out = e.solve(ptr, data.length, 1);
  assert.equal(new Uint32Array(e.memory.buffer, out, 1)[0], 2);
  e.dealloc(ptr, data.length);
  e.dealloc(out, 4);
});
