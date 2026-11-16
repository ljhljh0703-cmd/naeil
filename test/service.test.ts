// 윈도우 실행기(scripts/service.mjs): 다시 켜기, 같이 끝나기, 매일 백업. 리눅스에서도 같은 코드로 돈다.
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SERVICE = join(__dirname, "..", "scripts", "service.mjs");
const homes: string[] = [];
const procs: ChildProcess[] = [];

// 가짜 서버: 켜질 때마다 runs.txt 에 한 줄. FAKE_PLAN 의 n번째 글자대로 움직인다
//   e = 75 로 끝남, z = 0 으로 끝남, w = 입력 통로가 닫힐 때까지 기다렸다가 0
const FAKE_SERVER = `
const fs = require("node:fs");
fs.appendFileSync("runs.txt", process.env.NAEIL_DB + " " + process.env.NAEIL_SUPERVISED + "\\n");
const n = fs.readFileSync("runs.txt", "utf8").trim().split("\\n").length;
const step = (process.env.FAKE_PLAN || "w")[n - 1] || "w";
if (step === "e") process.exit(75);
if (step === "z") process.exit(0);
process.stdin.on("end", () => { fs.appendFileSync("closed.txt", "x"); process.exit(0); });
process.stdin.resume();
`;

function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), "naeil-svc-"));
  homes.push(home);
  mkdirSync(join(home, "current", "dist", "cli"), { recursive: true });
  writeFileSync(join(home, "current", "package.json"), '{"type":"commonjs"}');
  writeFileSync(join(home, "current", "dist", "server.js"), FAKE_SERVER);
  writeFileSync(
    join(home, "current", "dist", "cli", "backup.js"),
    'require("node:fs").writeFileSync("backup-ran.txt", process.argv[2] + " " + process.env.NAEIL_DB); process.exit(Number(process.env.FAKE_BACKUP_CODE || 0));',
  );
  // PowerShell 이 쓴 것처럼 머리표(BOM)를 붙여 둔다
  writeFileSync(
    join(home, "service.json"),
    `﻿${JSON.stringify({ port: 3999, db: join(home, "naeil.db"), logDir: join(home, "logs"), restartDelayMs: 100 })}`,
  );
  return home;
}

function run(mode: string, home: string, env: Record<string, string> = {}) {
  const p = spawn(process.execPath, [SERVICE, mode, home], {
    env: { ...process.env, ...env },
    stdio: "ignore",
  });
  procs.push(p);
  const exited = new Promise<number | null>((r) => p.once("exit", (code) => r(code)));
  return { p, exited };
}

async function until(fn: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  const safe = () => {
    try {
      return fn();
    } catch {
      return false; // 아직 안 써진 파일 등은 조금 뒤 다시
    }
  };
  while (!safe()) {
    if (Date.now() > end) throw new Error("시간 안에 안 됨");
    await new Promise((r) => setTimeout(r, 25));
  }
}

const runs = (home: string) => {
  const f = join(home, "current", "runs.txt");
  return existsSync(f) ? readFileSync(f, "utf8").trim().split("\n") : [];
};
const closed = (home: string) => existsSync(join(home, "current", "closed.txt"));
const state = (home: string) =>
  JSON.parse(readFileSync(join(home, "logs", "service-state.json"), "utf8"));

afterEach(async () => {
  // 실행기를 정상으로 끄고(서버도 같이 끝남) 끝날 때까지 기다린 뒤 지운다.
  // 먼저 지우면 끝나는 중인 가짜 서버가 파일을 써서 폴더 지우기가 실패한다 (11-15 자동 검사에서 한 번 남)
  await Promise.all(
    procs.splice(0).map(
      (p) =>
        new Promise<void>((resolve) => {
          if (p.exitCode !== null || p.signalCode !== null) return resolve();
          const t = setTimeout(() => p.kill("SIGKILL"), 5000);
          p.once("exit", () => {
            clearTimeout(t);
            resolve();
          });
          p.kill("SIGTERM");
        }),
    ),
  );
  for (const h of homes.splice(0))
    rmSync(h, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe("윈도우 실행기", () => {
  it("서버가 0 아닌 코드(75)로 끝나면 다시 켜고, 설정의 자료 자리를 넘긴다", async () => {
    const home = makeHome();
    run("server", home, { FAKE_PLAN: "ew" });
    await until(() => runs(home).length === 2);
    expect(runs(home)[0]).toBe(`${join(home, "naeil.db")} 1`);
    await until(() => state(home).runs === 2 && state(home).pid !== null);
    expect(state(home).lastExit.code).toBe(75);
    expect(readFileSync(join(home, "logs", "service.log"), "utf8")).toContain("다시 켬");
  });

  it("서버가 0 으로 끝나면 다시 켜지 않고 실행기도 끝남", async () => {
    const home = makeHome();
    const { exited } = run("server", home, { FAKE_PLAN: "z" });
    expect(await exited).toBe(0);
    expect(runs(home)).toHaveLength(1);
  });

  it("실행기가 강제로 꺼져도(윈도우 작업 멈춤과 같음) 서버가 입력 통로로 알아채고 끝남", async () => {
    const home = makeHome();
    const { p } = run("server", home, { FAKE_PLAN: "w" });
    await until(() => runs(home).length === 1);
    await until(() => state(home).pid !== null);
    const pid = state(home).pid as number;
    p.kill("SIGKILL");
    await until(() => closed(home));
    await until(() => {
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        return true;
      }
    });
  });

  it("끄라는 신호를 받으면 서버를 정상으로 끄고 0", async () => {
    const home = makeHome();
    const { p, exited } = run("server", home, { FAKE_PLAN: "w" });
    await until(() => runs(home).length === 1);
    await until(() => state(home).pid !== null);
    p.kill("SIGTERM");
    expect(await exited).toBe(0);
    expect(closed(home)).toBe(true);
  });

  it("매일 백업은 backup run 을 한 번 돌리고 그 종료 코드를 그대로 돌려줌", async () => {
    const home = makeHome();
    expect(await run("backup", home).exited).toBe(0);
    expect(readFileSync(join(home, "current", "backup-ran.txt"), "utf8")).toBe(
      `run ${join(home, "naeil.db")}`,
    );
    expect(await run("backup", home, { FAKE_BACKUP_CODE: "3" }).exited).toBe(3);
    expect(readFileSync(join(home, "logs", "backup.log"), "utf8")).toContain("코드 3");
  });

  it("쓰는 법이 틀리면 2", async () => {
    expect(await run("nope", makeHome()).exited).toBe(2);
  });
});
