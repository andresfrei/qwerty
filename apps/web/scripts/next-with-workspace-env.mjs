import { spawn } from "node:child_process";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const appDirectory = fileURLToPath(new URL("../", import.meta.url));
const rootEnvironment = fileURLToPath(new URL("../../../.env.local", import.meta.url));
let environmentReady = true;
try {
  // Programmatic loading keeps the dotenv CLI flag out of Next's fork options.
  // Existing process variables keep priority; Next still loads app-local defaults.
  loadEnvFile(rootEnvironment);
} catch (error) {
  if (error.code === "ENOENT") {
    process.stderr.write("../../.env.local not found. Continuing without it.\n");
  } else {
    process.stderr.write("Unable to load workspace environment configuration.\n");
    process.exitCode = 1;
    environmentReady = false;
  }
}

if (environmentReady) {
  const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
  const child = spawn(process.execPath, [next, ...process.argv.slice(2)], {
    cwd: appDirectory,
    env: process.env,
    stdio: "inherit",
  });
  const handlers = new Map(["SIGINT", "SIGTERM"].map((signal) => [signal, () => child.kill(signal)]));
  for (const [signal, handler] of handlers) process.on(signal, handler);
  const removeHandlers = () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  };
  child.once("error", () => {
    removeHandlers();
    process.stderr.write("Unable to start Next.js.\n");
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    removeHandlers();
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
}
