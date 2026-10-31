const ref = (name) => ({ $ref: "#/components/schemas/" + name });
const json = (description, schema) => ({
  description,
  content: { "application/json": { schema } },
});
const errors = Object.fromEntries(
  [400, 403, 404, 409, 413, 415, 422, 500].map((s) => [
    s,
    {
      description:
        s === 409
          ? "Ciclo: blocked_tasks inclui tarefas no ciclo e descendentes bloqueados."
          : "Erro estruturado.",
      content: { "application/problem+json": { schema: ref("Problem") } },
    },
  ]),
);
const requestBody = {
  required: true,
  content: { "application/json": { schema: ref("PlanInput") } },
};
const summaryKeys = [
  "tasks",
  "dependencies",
  "workers",
  "total_work",
  "critical_duration",
  "lower_bound",
  "makespan",
  "idle_capacity",
];
const schemas = {
  TaskInput: {
    type: "object",
    additionalProperties: false,
    required: ["id", "duration"],
    properties: {
      id: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,31}$" },
      label: { type: "string", minLength: 1, maxLength: 80 },
      duration: { type: "integer", minimum: 1, maximum: 86400 },
      depends_on: {
        type: "array",
        maxItems: 64,
        uniqueItems: true,
        items: { type: "string" },
        default: [],
      },
    },
  },
  PlanInput: {
    type: "object",
    additionalProperties: false,
    required: ["tasks"],
    properties: {
      workers: { type: "integer", minimum: 1, maximum: 8, default: 2 },
      tasks: {
        type: "array",
        minItems: 1,
        maxItems: 64,
        items: ref("TaskInput"),
      },
    },
  },
  Summary: {
    type: "object",
    required: [...summaryKeys, "utilization", "meets_lower_bound"],
    properties: {
      ...Object.fromEntries(
        summaryKeys.map((k) => [k, { type: "integer", minimum: 0 }]),
      ),
      utilization: { type: "number", minimum: 0, maximum: 1 },
      meets_lower_bound: {
        type: "boolean",
        description:
          "Atinge max(caminho crítico, ceil(trabalho/workers)). Limite inferior pode não ser alcançável.",
      },
    },
  },
  TaskResult: {
    type: "object",
    required: [
      "id",
      "label",
      "duration",
      "depends_on",
      "earliest_start",
      "earliest_finish",
      "latest_start",
      "latest_finish",
      "slack",
      "critical",
      "topological_rank",
      "start",
      "finish",
      "worker",
    ],
    properties: {
      id: { type: "string" },
      label: { type: "string" },
      duration: { type: "integer" },
      depends_on: { type: "array", items: { type: "string" } },
      ...Object.fromEntries(
        [
          "earliest_start",
          "earliest_finish",
          "latest_start",
          "latest_finish",
          "slack",
          "topological_rank",
          "start",
          "finish",
        ].map((k) => [k, { type: "integer", minimum: 0 }]),
      ),
      critical: {
        type: "boolean",
        description: "Folga zero no CPM sem limite de trabalhadores.",
      },
      worker: { type: "integer", minimum: 1, maximum: 8 },
    },
  },
  Plan: {
    type: "object",
    required: [
      "engine",
      "version",
      "unit",
      "summary",
      "critical_path",
      "topological_order",
      "tasks",
      "scheduling",
    ],
    properties: {
      engine: { type: "string", enum: ["rust-wasm"] },
      version: { type: "string" },
      unit: { type: "string", enum: ["time_units"] },
      summary: ref("Summary"),
      critical_path: {
        type: "array",
        items: { type: "string" },
        description:
          "Um caminho crítico. Empates são determinísticos por ID ASCII.",
      },
      topological_order: { type: "array", items: { type: "string" } },
      tasks: { type: "array", items: ref("TaskResult") },
      scheduling: { type: "object", additionalProperties: { type: "string" } },
    },
  },
  Comparison: {
    type: "object",
    required: ["engine", "unit", "selected_workers", "comparisons", "note"],
    properties: {
      engine: { type: "string" },
      unit: { type: "string" },
      selected_workers: { type: "integer" },
      comparisons: { type: "array", items: ref("Summary") },
      note: { type: "string" },
    },
  },
  Problem: {
    type: "object",
    required: ["type", "title", "status", "code", "request_id"],
    properties: {
      type: { type: "string" },
      title: { type: "string" },
      status: { type: "integer" },
      code: { type: "string" },
      request_id: { type: "string", format: "uuid" },
      details: {
        type: "object",
        properties: {
          blocked_tasks: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};
export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Nexo API",
    version: "1.0.0",
    description:
      "Planejamento real com Rust/WebAssembly no servidor. Unidades de tempo abstratas, início em zero, tarefas não preemptivas e trabalhadores idênticos. Caminho crítico/folgas ignoram limite de trabalhadores; cronograma usa maior caminho restante primeiro e desempate por ID. Não executa jobs nem serviços externos. Sem armazenamento ou login. Limites: 32 KiB JSON, 64 tarefas, 256 dependências e 8 trabalhadores.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/api/health": {
      get: {
        operationId: "health",
        summary: "Executar um plano mínimo no motor para verificar saúde",
        responses: {
          200: json("Motor disponível", {
            type: "object",
            properties: {
              status: { type: "string" },
              engine: { type: "string" },
              engine_check: { type: "boolean" },
              version: { type: "string" },
              storage: { type: "string" },
            },
          }),
          ...errors,
        },
      },
    },
    "/api/v1/examples": {
      get: {
        operationId: "examples",
        summary: "Três planos sintéticos, incluindo um ciclo inválido",
        responses: {
          200: json("Exemplos", {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    request: ref("PlanInput"),
                  },
                },
              },
            },
          }),
          ...errors,
        },
      },
    },
    "/api/v1/plan": {
      post: {
        operationId: "plan",
        summary: "Calcular CPM e cronograma limitado por trabalhadores",
        requestBody,
        responses: { 200: json("Plano calculado", ref("Plan")), ...errors },
      },
    },
    "/api/v1/compare": {
      post: {
        operationId: "compare",
        summary: "Comparar cenários de 1 até workers trabalhadores",
        description:
          "Mesmo contrato de /plan. Máximo de 8 simulações. A heurística não garante monotonicidade ou otimalidade global.",
        requestBody,
        responses: { 200: json("Comparação", ref("Comparison")), ...errors },
      },
    },
  },
  components: { schemas },
};
