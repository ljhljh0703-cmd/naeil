import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { createServer as createTcpServer, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { waitForHealth } from "../scripts/wait-health.mjs";

const children: ChildProcess[] = [];
const closers: Array<() => Promise<void>> = [];
function child() {
  const p = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  children.push(p);
  return p;
}
async function freePort() {
  const s = createTcpServer();
  s.listen(0, "127.0.0.1");
  await once(s, "listening");
  const address = s.address();
  if (!address || typeof address === "string") throw new Error("missing port");
  const port = address.port;
  await new Promise<void>((resolve) => s.close(() => resolve()));
  return port;
}
afterEach(async () => {
  for (const p of children.splice(0)) {
    if (p.pid && p.exitCode === null && p.signalCode === null) {
      const exited = once(p, "exit");
      p.kill("SIGKILL");
      await exited;
    }
  }
  for (const close of closers.splice(0)) await close();
});

describe("배포 서버 시작 확인", () => {
  it("처음 연결 거절 뒤 늦게 열린 서버의 실제 응답을 확인한다", async () => {
    const port = await freePort();
    const s = createServer((_, res) => res.end("ready"));
    closers.push(
      () =>
        new Promise((resolve) => {
          s.closeAllConnections();
          s.close(() => resolve());
        }),
    );
    const timer = setTimeout(() => s.listen(port, "127.0.0.1"), 200);
    try {
      const result = await waitForHealth(`http://127.0.0.1:${port}/health`, child(), {
        timeoutMs: 3000,
        pollIntervalMs: 20,
      });
      expect(result.health?.status).toBe(200);
      expect(await result.health?.text()).toBe("ready");
      expect(result.elapsedMs).toBeGreaterThanOrEqual(150);
    } finally {
      clearTimeout(timer);
    }
  });

  it("계속 연결되지 않으면 정해진 전체 시간 안에 실패한다", async () => {
    const port = await freePort();
    const result = await waitForHealth(`http://127.0.0.1:${port}/health`, child(), {
      timeoutMs: 250,
      pollIntervalMs: 20,
    });
    expect(result.health).toBeNull();
    expect(result.detail).toContain("준비 대기 250ms 초과");
    expect(result.elapsedMs).toBeLessThan(1500);
  });

  it("연결만 받고 응답하지 않는 서버도 요청별 제한으로 끝낸다", async () => {
    const sockets = new Set<Socket>();
    const s = createTcpServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    s.listen(0, "127.0.0.1");
    await once(s, "listening");
    const address = s.address();
    if (!address || typeof address === "string") throw new Error("missing port");
    closers.push(
      () =>
        new Promise((resolve) => {
          for (const socket of sockets) socket.destroy();
          s.close(() => resolve());
        }),
    );
    const result = await waitForHealth(`http://127.0.0.1:${address.port}/health`, child(), {
      timeoutMs: 300,
      requestTimeoutMs: 80,
      pollIntervalMs: 10,
    });
    expect(result.health).toBeNull();
    expect(result.detail).toContain("TimeoutError");
    expect(result.elapsedMs).toBeLessThan(1500);
  });

  it("종료한 자식은 기다리거나 정상 시작으로 오인하지 않는다", async () => {
    const p = spawn(process.execPath, ["-e", "process.exit(7)"], { stdio: "ignore" });
    await once(p, "exit");
    const result = await waitForHealth("http://127.0.0.1:1/health", p);
    expect(result.health).toBeNull();
    expect(result.detail).toContain("프로세스 종료: 코드 7");
    expect(result.elapsedMs).toBeLessThan(200);
  });

  it("프로세스 생성 오류도 실패로 반환한다", async () => {
    const p = spawn("naeil-nonexistent-test-executable-20261116", [], { stdio: "ignore" });
    const result = await waitForHealth("http://127.0.0.1:1/health", p, {
      timeoutMs: 1000,
      pollIntervalMs: 10,
    });
    expect(result.health).toBeNull();
    expect(result.detail).toContain("프로세스 시작 오류");
  });

  it("503 응답을 숨기지 않고 호출자의 내용 검증으로 전달한다", async () => {
    const s = createServer((_, res) => {
      res.statusCode = 503;
      res.end("unhealthy");
    });
    s.listen(0, "127.0.0.1");
    await once(s, "listening");
    const address = s.address();
    if (!address || typeof address === "string") throw new Error("missing port");
    closers.push(
      () =>
        new Promise((resolve) => {
          s.closeAllConnections();
          s.close(() => resolve());
        }),
    );
    const result = await waitForHealth(`http://127.0.0.1:${address.port}/health`, child());
    expect(result.health?.status).toBe(503);
    await result.health?.body?.cancel();
  });
});
