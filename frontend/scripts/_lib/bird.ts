import { spawn } from "node:child_process";

export async function birdJson<T>(args: string[]): Promise<T> {
  const child = spawn("bird", args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  child.stdout.on("data", (c) => stdoutChunks.push(Buffer.from(c)));
  child.stderr.on("data", (c) => stderrChunks.push(Buffer.from(c)));

  const code: number = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (c) => resolve(c ?? 0));
  });

  const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
  const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

  if (code !== 0) {
    throw new Error(`bird failed (code=${code}): ${stderr || stdout || "(no output)"}`);
  }

  try {
    return JSON.parse(stdout) as T;
  } catch {
    const snippet = stdout.slice(0, 800);
    throw new Error(`bird returned non-JSON: ${snippet}`);
  }
}

