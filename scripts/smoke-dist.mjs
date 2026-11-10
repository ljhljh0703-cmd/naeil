// 구운 판(dist) 연기 시험: 「배포한 그대로 켜지고, 자동 실행과 맞물려 움직이는가」만 본다.
// 저장소 밖 빈 폴더에서 켜고, 자료 파일도 그 폴더에 따로 둔다. 실제 작업판 자료는 건드리지 않는다.
//   npm run smoke   (= 굽기 + 이 파일)
//   배포 스크립트(scripts/macos/deploy.sh)도 새 판을 바꿔 끼우기 전에 이 파일을 그 판 안에서 돌린다.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, renameSync, rmSync, unlinkSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const entry = join(root, "dist", "server.js");
if (!existsSync(entry)) {
  console.error(`구운 서버가 없음: ${entry} (npm run build 먼저)`);
  process.exit(1);
}

const freePort = () =>
  new Promise((ok, fail) => {
    const s = createServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const work = mkdtempSync(join(tmpdir(), "naeil-smoke-"));
const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });
const servers = [];

async function start(name, extraEnv = {}) {
  const port = await freePort();
  const dbPath = join(work, `${name}.db`);
  const env = {
    ...process.env,
    NAEIL_HOST: "127.0.0.1",
    NAEIL_PORT: String(port),
    NAEIL_DB: dbPath,
    NAEIL_SELF_CHECK_SECONDS: "0",
    ...extraEnv,
  };
  const child = spawn(process.execPath, [entry], { cwd: work, env, stdio: ["ignore", "pipe", "pipe"] });
  const s = { name, child, base: `http://127.0.0.1:${port}`, dbPath, log: "" };
  child.stdout.on("data", (d) => (s.log += d));
  child.stderr.on("data", (d) => (s.log += d));
  s.exited = new Promise((r) => child.once("exit", (code, signal) => r({ code, signal })));
  servers.push(s);
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) return { ...s, health: null };
    try {
      return { ...s, health: await fetch(`${s.base}/health`) };
    } catch {
      await wait(100);
    }
  }
  return { ...s, health: null };
}
const exitWithin = (s, ms) => Promise.race([s.exited, wait(ms).then(() => null)]);

try {
  // ── 1. 켜지고 기본이 도는가 ──
  const a = await start("basic");
  check("저장소 밖 폴더에서 켜짐", a.health !== null, a.health ? "" : `꺼짐 (종료 코드 ${a.child.exitCode})`);
  if (a.health) {
    const body = await a.health.json();
    check("상태 확인 200, 자료 읽힘", a.health.status === 200 && body.ok === true && body.checks?.db === "ok", JSON.stringify(body));
    check("화면 파일 있음", body.checks?.web === "ok", JSON.stringify(body.checks));
    const page = await fetch(`${a.base}/`);
    const html = await page.text();
    check("첫 주소가 화면을 엶", page.status === 200 && html.includes('id="root"'), `${page.status}`);
    const api = await fetch(`${a.base}/v1/projects`);
    const problem = await api.json();
    check("명세서를 읽어 출입증 검사가 돎 (401)", api.status === 401 && typeof problem.type === "string", `${api.status}`);
    check("자료 파일이 정한 자리에 생김", existsSync(a.dbPath), a.dbPath);
    a.child.kill("SIGTERM");
    const end = await exitWithin(a, 5000);
    // 자동 실행은 0 으로 끝나면 다시 켜지 않는다. 사람이 끈 것은 꺼진 채로
    check("끄라는 신호에 정상 종료(0), 자동 실행이 다시 켜지 않음", end?.code === 0, JSON.stringify(end));
  }

  // ── 2. 켜진 채 자료 파일이 백업본으로 바뀌면 스스로 꺼짐 ──
  const b = await start("replaced", { NAEIL_SELF_CHECK_SECONDS: "0.2" });
  if (b.health) {
    copyFileSync(b.dbPath, `${b.dbPath}.backup`);
    renameSync(`${b.dbPath}.backup`, b.dbPath);
    const end = await exitWithin(b, 5000);
    // 0 이 아닌 종료 → 자동 실행이 다시 켜서 새 파일을 연다
    check("자료 파일이 바뀌면 스스로 꺼짐(75), 자동 실행이 다시 켬", end?.code === 75, JSON.stringify(end));
  } else check("자료 파일 바뀜 시험용 서버가 켜짐", false);

  // ── 3. 켜진 채 자료 파일이 지워지면 끄지 않고 503 을 유지 ──
  const c = await start("missing", { NAEIL_SELF_CHECK_SECONDS: "0.2" });
  if (c.health) {
    for (const f of [c.dbPath, `${c.dbPath}-wal`, `${c.dbPath}-shm`]) if (existsSync(f)) unlinkSync(f);
    const end = await exitWithin(c, 1000);
    const res = await fetch(`${c.base}/health`).catch(() => null);
    const body = res ? await res.json() : null;
    // 다시 켜면 빈 자료 파일이 새로 생겨 「빈 작업판」이 정상처럼 보이므로 켜 둔 채 이상을 알린다
    check(
      "자료 파일이 지워지면 꺼지지 않고 503 missing (빈 작업판으로 갈아타지 않음)",
      end === null && res?.status === 503 && body?.checks?.db === "missing",
      `${res?.status} ${JSON.stringify(body)}`,
    );
    check("지운 자리에 빈 파일을 새로 만들지 않음", !existsSync(c.dbPath));
  } else check("자료 파일 지움 시험용 서버가 켜짐", false);
} finally {
  for (const s of servers) if (s.child.exitCode === null && s.child.signalCode === null) s.child.kill("SIGKILL");
  await Promise.all(servers.map((s) => s.exited));
  rmSync(work, { recursive: true, force: true });
}

for (const r of results) console.log(`${r.pass ? "통과" : "실패"}  ${r.name}${r.pass || !r.detail ? "" : `  (${r.detail})`}`);
if (results.length === 0 || results.some((r) => !r.pass)) {
  for (const s of servers) console.error(`\n[${s.name}] 서버 기록:\n${s.log.slice(-1500)}`);
  process.exit(1);
}
console.log(`\n구운 서버 연기 시험 ${results.length}건 통과`);
