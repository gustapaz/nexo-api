import assert from "node:assert/strict";
import { examples } from "../server/examples.mjs";
const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base))
  throw new Error("Use npm run smoke -- URL");
const post = (path, input) =>
  fetch(new URL(path, base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
const h = await fetch(new URL("/api/health", base));
assert.equal(h.status, 200);
const health = await h.json();
assert.equal(health.engine, "rust-wasm");
assert.equal(health.engine_check, true);
const r = await post("/api/v1/plan", examples.release.request);
assert.equal(r.status, 200);
const plan = await r.json();
assert.equal(plan.summary.makespan, 15);
assert.deepEqual(plan.critical_path, ["assets", "build", "review", "deploy"]);
for (const task of plan.tasks)
  for (const dep of task.depends_on)
    assert.ok(task.start >= plan.tasks.find((t) => t.id === dep).finish);
const c = await post("/api/v1/compare", examples.bottleneck.request);
assert.equal(c.status, 200);
assert.deepEqual(
  (await c.json()).comparisons.map((s) => s.makespan),
  [19, 12],
);
const cycle = await post("/api/v1/plan", examples.cycle.request);
assert.equal(cycle.status, 409);
assert.equal((await cycle.json()).code, "dependency_cycle");
const invalid = await post("/api/v1/plan", {
  tasks: [{ id: "bad", duration: 0 }],
});
assert.equal(invalid.status, 422);
const parallel = await Promise.all(
  Array.from({ length: 4 }, () =>
    post("/api/v1/plan", examples.release.request).then((r) => r.json()),
  ),
);
assert.ok(parallel.every((p) => p.summary.makespan === 15));
console.log(
  JSON.stringify(
    {
      ok: true,
      base: new URL(base).origin,
      checks: [
        "health executes Rust/WASM",
        "critical path",
        "valid schedule",
        "worker comparison",
        "cycle diagnosis",
        "validation",
        "parallel isolation",
      ],
    },
    null,
    2,
  ),
);
