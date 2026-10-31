import wasm from "../engine/pkg/nexo.wasm";
import { createPlanner } from "./planner.mjs";
import { createHandler } from "./http.mjs";
export const handle = createHandler(createPlanner(wasm));
