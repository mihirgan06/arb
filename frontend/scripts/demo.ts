import { spawn, type ChildProcess } from "node:child_process";

function spawnPnpm(args: string[]): ChildProcess {
  const pnpmExecPath = process.env.npm_execpath;
  if (pnpmExecPath) {
    return spawn(process.execPath, [pnpmExecPath, ...args], {
      stdio: "inherit",
      env: process.env,
    });
  }

  const cmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  return spawn(cmd, args, { stdio: "inherit", env: process.env });
}

function killBestEffort(child: ChildProcess) {
  if (child.exitCode != null) return;
  try {
    child.kill("SIGINT");
  } catch {
    try {
      child.kill();
    } catch {
      // ignore
    }
  }
}

async function main() {
  console.log("[demo] starting UI + worker…");
  console.log("- UI:     pnpm dev");
  console.log("- Worker: pnpm worker");

  const ui = spawnPnpm(["run", "dev"]);
  const worker = spawnPnpm(["run", "worker"]);

  let exiting = false;
  const exit = (code: number) => {
    if (exiting) return;
    exiting = true;
    killBestEffort(ui);
    killBestEffort(worker);
    process.exit(code);
  };

  ui.on("exit", (code) => exit(code ?? 0));
  worker.on("exit", (code) => exit(code ?? 0));

  process.on("SIGINT", () => exit(0));
  process.on("SIGTERM", () => exit(0));
}

void main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[demo] error: ${msg}`);
  process.exitCode = 1;
});
