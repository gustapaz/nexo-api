import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
const local = path.join(
  homedir(),
  ".cargo",
  "bin",
  process.platform === "win32" ? "cargo.exe" : "cargo",
);
const cargo = existsSync(local) ? local : "cargo";
const result = spawnSync(
  cargo,
  [
    "build",
    "--manifest-path",
    "engine/Cargo.toml",
    "--locked",
    "--release",
    "--target",
    "wasm32-unknown-unknown",
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
mkdirSync("engine/pkg", { recursive: true });
copyFileSync(
  "engine/target/wasm32-unknown-unknown/release/nexo_engine.wasm",
  "engine/pkg/nexo.wasm",
);
console.log("Rust engine compiled to engine/pkg/nexo.wasm");
