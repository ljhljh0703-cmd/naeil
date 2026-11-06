// 구운 판(dist) 연기 시험: 「배포한 그대로 켜지는가」만 본다.
// 저장소 밖 빈 폴더에서 켜고, 자료 파일도 그 폴더에 따로 둔다. 실제 작업판 자료는 건드리지 않는다.
//   npm run smoke   (= 굽기 + 이 파일)
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
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

const work = mkdtempSync(join(tmpdir(), "naeil-smoke-"));
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, NAEIL_HOST: "127.0.0.1", NAEIL_PORT: String(port), NAEIL_DB: join(work, "smoke.db") };
const child = spawn(process.execPath, [entry], { cwd: work, env, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
child.stdout.on("data", (d) => (log += d));
child.stderr.on("data", (d) => (log += d));

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

async function waitHealth() {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) return null;
    try {
      const res = await fetch(`${base}/health`);
      return res;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return null;
}

try {
  const health = await waitHealth();
  check("저장소 밖 폴더에서 켜짐", health !== null, health ? "" : `꺼짐 (종료 코드 ${child.exitCode})`);
  if (health) {
    const body = await health.json();
    check("상태 확인 200, 자료 읽힘", health.status === 200 && body.ok === true && body.checks?.db === "ok", JSON.stringify(body));
    check("화면 파일 있음", body.checks?.web === "ok", JSON.stringify(body.checks));
    const page = await fetch(`${base}/`);
    const html = await page.text();
    check("첫 주소가 화면을 엶", page.status === 200 && html.includes('id="root"'), `${page.status}`);
    const api = await fetch(`${base}/v1/projects`);
    const problem = await api.json();
    check("명세서를 읽어 출입증 검사가 돎 (401)", api.status === 401 && typeof problem.type === "string", `${api.status}`);
    check("자료 파일이 정한 자리에 생김", existsSync(env.NAEIL_DB), env.NAEIL_DB);
  }
} finally {
  child.kill("SIGTERM");
  await new Promise((r) => (child.exitCode !== null ? r() : child.once("exit", r)));
  rmSync(work, { recursive: true, force: true });
}

for (const r of results) console.log(`${r.pass ? "통과" : "실패"}  ${r.name}${r.pass || !r.detail ? "" : `  (${r.detail})`}`);
if (results.length === 0 || results.some((r) => !r.pass)) {
  console.error("\n서버 기록:\n" + log.slice(-2000));
  process.exit(1);
}
console.log(`\n구운 서버 연기 시험 ${results.length}건 통과`);
