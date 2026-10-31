import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createPlanner } from "../server/planner.mjs";
import { createHandler } from "../server/http.mjs";
import { examples } from "../server/examples.mjs";
const handle = createHandler(
  createPlanner(
    new WebAssembly.Module(
      readFileSync(new URL("../engine/pkg/nexo.wasm", import.meta.url)),
    ),
  ),
);
let server, base;
before(async () => {
  server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const response = await handle(
      new Request(new URL(req.url, base), {
        method: req.method,
        headers: req.headers,
        ...(["GET", "HEAD"].includes(req.method)
          ? {}
          : { body: Buffer.concat(chunks) }),
      }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + server.address().port;
});
after(() => new Promise((resolve) => server.close(resolve)));
const post = (body, path = "/api/v1/plan", headers = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
test("real HTTP executes WASM and comparison scenarios", async () => {
  const r = await post(examples.bottleneck.request);
  assert.equal(r.status, 200);
  const result = await r.json();
  assert.equal(result.engine, "rust-wasm");
  assert.equal(result.summary.makespan, 12);
  const c = await (
    await post(examples.bottleneck.request, "/api/v1/compare")
  ).json();
  assert.deepEqual(
    c.comparisons.map((s) => s.makespan),
    [19, 12],
  );
});
test("health executes the engine and examples/OpenAPI load", async () => {
  const h = await (await fetch(base + "/api/health")).json();
  assert.equal(h.engine_check, true);
  assert.equal(h.engine, "rust-wasm");
  assert.equal(
    (await (await fetch(base + "/api/v1/examples")).json()).items.length,
    3,
  );
  assert.ok(
    (await (await fetch(base + "/api/openapi.json")).json()).paths[
      "/api/v1/plan"
    ],
  );
});
test("cycle produces 409 with blocked resources and no stack", async () => {
  const r = await post(examples.cycle.request);
  assert.equal(r.status, 409);
  const b = await r.json();
  assert.deepEqual(b.details.blocked_tasks, ["a", "b", "c"]);
  assert.equal(b.stack, undefined);
  assert.equal(r.headers.get("x-request-id"), b.request_id);
});
test("JSON, media, origin and unknown route errors", async () => {
  for (const [r, status] of [
    [await post("{"), 400],
    [await post({}, "/api/v1/plan", { "content-type": "text/plain" }), 415],
    [
      await post(examples.release.request, "/api/v1/plan", {
        origin: "https://other.example",
      }),
      403,
    ],
    [await fetch(base + "/missing"), 404],
    [await post({}), 422],
  ]) {
    assert.equal(r.status, status);
    assert.match(r.headers.get("content-type"), /problem\+json/);
    assert.equal((await r.json()).status, status);
  }
});
test("actual bytes limited without Content-Length", async () => {
  const r = await handle(
    new Request("https://nexo.test/api/v1/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: " ".repeat(32769),
    }),
  );
  assert.equal(r.status, 413);
});
test("invalid UTF8 rejected, compressed body not accepted", async () => {
  const r = await handle(
    new Request("https://nexo.test/api/v1/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array([255]),
    }),
  );
  assert.equal(r.status, 400);
  assert.equal(
    (await post("{}", "/api/v1/plan", { "content-encoding": "gzip" })).status,
    415,
  );
});
test("same origin and security headers", async () => {
  const r = await post(examples.release.request, "/api/v1/plan", {
    origin: base,
  });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("access-control-allow-origin"), null);
});
test("parallel requests have isolated WASM memory and deterministic outputs", async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      post(examples.release.request).then((r) => r.json()),
    ),
  );
  assert.ok(results.every((r) => r.summary.makespan === 15));
  assert.ok(
    results.every((r) => JSON.stringify(r) === JSON.stringify(results[0])),
  );
});
