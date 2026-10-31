import { InputError } from "./planner.mjs";
import { examples } from "./examples.mjs";
import { openapi } from "./openapi.mjs";
async function read(request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new InputError(
      415,
      "unsupported_media_type",
      "Use application/json.",
    );
  if (
    request.headers.has("content-encoding") &&
    request.headers.get("content-encoding") !== "identity"
  )
    throw new InputError(
      415,
      "unsupported_encoding",
      "Não envie corpo comprimido.",
    );
  const reader = request.body?.getReader();
  if (!reader) throw new InputError(400, "invalid_json", "Envie JSON.");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        throw new InputError(
          413,
          "body_too_large",
          "Limite de 32 KiB por requisição.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new InputError(400, "invalid_json", "JSON ou UTF-8 inválido.");
  }
}
export function createHandler(plan) {
  return async (request) => {
    const requestId = crypto.randomUUID();
    let response;
    try {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin)
        throw new InputError(403, "origin_denied", "Origem não autorizada.");
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path === "/api/health") {
        const check = plan({
          workers: 1,
          tasks: [{ id: "health", duration: 1 }],
        });
        response = Response.json({
          status: "ok",
          engine: check.engine,
          engine_check: check.summary.makespan === 1,
          version: "1.0.0",
          storage: "none",
        });
      } else if (request.method === "GET" && path === "/api/v1/examples")
        response = Response.json({
          items: Object.entries(examples).map(([id, e]) => ({ id, ...e })),
        });
      else if (request.method === "GET" && path === "/api/openapi.json")
        response = Response.json(openapi);
      else if (request.method === "POST" && path === "/api/v1/plan")
        response = Response.json(plan(await read(request)));
      else if (request.method === "POST" && path === "/api/v1/compare") {
        const input = await read(request),
          selected = plan(input);
        const comparisons = Array.from(
          { length: selected.summary.workers },
          (_, i) => plan({ ...input, workers: i + 1 }).summary,
        );
        response = Response.json({
          engine: "rust-wasm",
          unit: "time_units",
          selected_workers: selected.summary.workers,
          comparisons,
          note: "Simulations from 1 to requested workers, using the same deterministic heuristic. No monotonicity or optimality guarantee.",
        });
      } else throw new InputError(404, "not_found", "Endpoint não encontrado.");
    } catch (error) {
      const known = error instanceof InputError,
        status = known ? error.status : 500,
        code = known ? error.code : "internal_error";
      response = new Response(
        JSON.stringify({
          type: "urn:nexo:error:" + code,
          title: known ? error.message : "Falha ao processar o plano.",
          status,
          code,
          request_id: requestId,
          ...(known && error.details ? { details: error.details } : {}),
        }),
        { status, headers: { "Content-Type": "application/problem+json" } },
      );
    }
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Request-Id", requestId);
    return new Response(response.body, { status: response.status, headers });
  };
}
