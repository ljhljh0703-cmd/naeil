import type { ChildProcess } from "node:child_process";

export function waitForHealth(
  url: string,
  child: ChildProcess,
  options?: { timeoutMs?: number; requestTimeoutMs?: number; pollIntervalMs?: number },
): Promise<{ health: Response | null; detail: string; elapsedMs: number }>;
