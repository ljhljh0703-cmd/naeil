// 윈도우 상시 서버의 실행기. 작업 스케줄러가 이 파일을 부른다 (맥은 launchd 가 같은 일을 한다).
//   node service.mjs server <앱 폴더>   서버를 켜고, 0 이 아닌 코드로 끝나면 잠깐 뒤 다시 켠다. 0 이면 같이 끝난다
//   node service.mjs backup <앱 폴더>   매일 백업 한 번 (백업 + 복원 연습 + 오래된 것 정리)
// 설정은 <앱 폴더>/service.json (배포 스크립트가 씀): { port, db, logDir, restartDelayMs? }
// 서버는 <앱 폴더>/current 의 판으로 켠다. 판을 바꿔 끼운 뒤 다시 켜면 새 판이 뜬다.
//
// 왜 따로 두나
// - 작업 스케줄러는 환경 변수도, 화면 출력 기록도 다루지 못한다. 그래서 여기서 넘기고 파일에 남긴다
// - 작업 스케줄러의 「실패하면 다시 시작」은 1분 간격, 프로그램이 0 이 아닌 코드로 끝난 것을 늘 잡지도 않는다.
//   자료 파일이 바뀌면 서버가 75 로 끝나고 다시 켜져야 하는데(맥 launchd 와 같게), 그 일을 여기서 한다
// - 윈도우에는 끄라는 신호가 없어서, 이 실행기가 꺼지면 서버의 입력 통로가 닫히는 것으로 서버도 같이 끝낸다
import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const LOG_MAX = 10 * 1024 * 1024;

export function readServiceConfig(appHome) {
  const file = join(appHome, "service.json");
  // 윈도우 PowerShell 이 붙이는 머리표(BOM)가 있어도 읽는다
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  const c = JSON.parse(text);
  return {
    port: Number(c.port ?? 3700),
    db: c.db ?? join(appHome, "naeil.db"),
    logDir: c.logDir ?? join(appHome, "logs"),
    restartDelayMs: Number(c.restartDelayMs ?? 10_000),
  };
}

function logStream(file) {
  // 10MB 를 넘으면 하나만 옛것으로 돌려 둔다
  try {
    if (statSync(file).size > LOG_MAX) renameSync(file, `${file}.1`);
  } catch {}
  return (chunk) => appendFileSync(file, chunk);
}

function stamp(msg) {
  return `${new Date().toISOString()} ${msg}\n`;
}

function childEnv(cfg) {
  return {
    ...process.env,
    NAEIL_HOST: "127.0.0.1",
    NAEIL_PORT: String(cfg.port),
    NAEIL_DB: cfg.db,
  };
}

function saveState(cfg, state) {
  try {
    writeFileSync(join(cfg.logDir, "service-state.json"), `${JSON.stringify(state, null, 2)}\n`);
  } catch {}
}

export function runServer(appHome, { node = process.execPath } = {}) {
  const cfg = readServiceConfig(appHome);
  mkdirSync(cfg.logDir, { recursive: true });
  const out = logStream(join(cfg.logDir, "server.log"));
  const err = logStream(join(cfg.logDir, "server.err.log"));
  const svc = logStream(join(cfg.logDir, "service.log"));
  const entry = join(appHome, "current", "dist", "server.js");
  const state = { startedAt: new Date().toISOString(), runs: 0, lastExit: null, pid: null };
  let child = null;
  let stopping = false;
  let timer = null;

  const start = () => {
    timer = null;
    if (stopping) return;
    if (!existsSync(entry)) {
      svc(stamp(`판이 없음: ${entry}. ${cfg.restartDelayMs}ms 뒤 다시 봄`));
      timer = setTimeout(start, cfg.restartDelayMs);
      return;
    }
    state.runs += 1;
    child = spawn(node, [entry], {
      cwd: join(appHome, "current"),
      env: { ...childEnv(cfg), NAEIL_SUPERVISED: "1" },
      // 입력 통로는 이어 두기만 한다. 이 실행기가 어떻게 꺼지든 닫히고, 서버는 그걸 보고 끝난다
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    state.pid = child.pid ?? null;
    saveState(cfg, state);
    svc(stamp(`켬 (${state.runs}번째, pid ${child.pid})`));
    child.stdout.on("data", out);
    child.stderr.on("data", err);
    child.stdin.on("error", () => {});
    child.once("exit", (code, signal) => {
      child = null;
      state.lastExit = { code, signal, at: new Date().toISOString() };
      state.pid = null;
      saveState(cfg, state);
      if (stopping) {
        svc(stamp(`끔 (코드 ${code}, 신호 ${signal})`));
        process.exit(0);
      }
      if (code === 0) {
        // 사람이 끈 것. 다시 켜지 않는다 (맥 launchd 의 SuccessfulExit false 와 같게)
        svc(stamp("서버가 0 으로 끝남. 다시 켜지 않음"));
        process.exit(0);
      }
      svc(stamp(`서버가 끝남 (코드 ${code}, 신호 ${signal}). ${cfg.restartDelayMs}ms 뒤 다시 켬`));
      timer = setTimeout(start, cfg.restartDelayMs);
    });
  };

  const stop = () => {
    if (stopping) return;
    stopping = true;
    if (timer) clearTimeout(timer);
    if (!child) process.exit(0);
    child.stdin.end();
    // 10초 안에 안 끝나면 강제로
    setTimeout(() => child?.kill("SIGKILL"), 10_000).unref();
  };
  for (const sig of ["SIGTERM", "SIGINT", "SIGBREAK"]) process.on(sig, stop);
  start();
  return { stop, state };
}

export function runBackup(appHome, { node = process.execPath } = {}) {
  const cfg = readServiceConfig(appHome);
  mkdirSync(cfg.logDir, { recursive: true });
  const out = logStream(join(cfg.logDir, "backup.log"));
  const err = logStream(join(cfg.logDir, "backup.err.log"));
  const entry = join(appHome, "current", "dist", "cli", "backup.js");
  out(stamp("매일 백업 시작"));
  const child = spawn(node, [entry, "run"], {
    cwd: join(appHome, "current"),
    env: childEnv(cfg),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", out);
  child.stderr.on("data", err);
  child.once("exit", (code) => {
    out(stamp(`매일 백업 끝 (코드 ${code})`));
    process.exit(code ?? 1);
  });
}

const [mode, appHome] = process.argv.slice(2);
if (process.argv[1]?.endsWith("service.mjs")) {
  if (!appHome || !["server", "backup"].includes(mode)) {
    console.error("쓰는 법: node service.mjs <server|backup> <앱 폴더>");
    process.exit(2);
  }
  if (mode === "server") runServer(appHome);
  else runBackup(appHome);
}
