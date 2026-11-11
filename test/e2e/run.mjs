// 브라우저 흐름 시험. 구운 판(dist)을 흐름마다 새 빈 자료로 켜고, 실제 브라우저로 눌러 본다.
//   npm run e2e            (= 굽기 + 이 파일)
//   node test/e2e/run.mjs basics board   (흐름 골라 돌리기, 굽기는 먼저)
// 캡처와 결과는 test/e2e/out/ (저장소에 올리지 않음). 출입증은 시험 자료 안에서만 만들고 화면에 찍지 않는다.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../..", import.meta.url));
const out = join(root, "test", "e2e", "out");
const entry = join(root, "dist", "server.js");
const keyCli = join(root, "dist", "cli", "key.js");
if (!existsSync(entry) || !existsSync(join(root, "web", "dist", "index.html"))) {
  console.error("구운 판이 없음. npm run build 먼저 (npm run e2e 는 알아서 굽는다)");
  process.exit(1);
}

const ALL = ["basics", "board", "panel"];
const pick = process.argv.slice(2);
const flows = pick.length > 0 ? pick : ALL;

const freePort = () =>
  new Promise((ok, fail) => {
    const s = createServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

async function startServer(name) {
  const work = mkdtempSync(join(tmpdir(), `naeil-e2e-${name}-`));
  const port = await freePort();
  const env = {
    ...process.env,
    NAEIL_HOST: "127.0.0.1",
    NAEIL_PORT: String(port),
    NAEIL_DB: join(work, "naeil.db"),
    NAEIL_SELF_CHECK_SECONDS: "0",
  };
  // 시험용 출입증 (시험 자료 안에서만)
  const k = spawnSync(process.execPath, [keyCli, "new", "e2e"], {
    cwd: work,
    env,
    encoding: "utf8",
  });
  const key = k.stdout.match(/nk_[A-Za-z0-9_-]+/)?.[0];
  if (!key) throw new Error(`시험용 출입증을 못 만듦 (${k.status})`);
  const child = spawn(process.execPath, [entry], {
    cwd: work,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((r) => child.once("exit", r));
    }
    rmSync(work, { recursive: true, force: true });
  };
  return { base, key, stop, log: () => log };
}

// 흐름에 넘기는 도구들
function tools(base, key, name, results) {
  const ok = (cond, what) => {
    results.push({ flow: name, ok: !!cond, what });
    console.log(`${cond ? "통과" : "실패"}  [${name}] ${what}`);
  };
  const api = async (method, path, body, headers = {}) => {
    const res = await fetch(new URL(path, base), {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        ...(body ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return {
      status: res.status,
      etag: res.headers.get("etag"),
      json: text ? JSON.parse(text) : null,
    };
  };
  // 조건이 참이 될 때까지 기다림 (고정 대기 대신)
  const until = async (fn, ms = 4000) => {
    const end = Date.now() + ms;
    for (;;) {
      try {
        if (await fn()) return true;
      } catch {}
      if (Date.now() > end) return false;
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  return { ok, api, until, base, key, out };
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const results = [];
let crashed = false;
try {
  for (const name of flows) {
    const flow = await import(`./flows/${name}.mjs`);
    const srv = await startServer(name);
    const t = tools(srv.base, srv.key, name, results);
    const errors = [];
    const page = async ({ width = 1440, height = 900, scheme = "light", storage = {} } = {}) => {
      const ctx = await browser.newContext({
        viewport: { width, height },
        locale: "ko-KR",
        timezoneId: "Asia/Seoul",
        colorScheme: scheme,
      });
      await ctx.addInitScript(
        ([k, s]) => {
          if (!localStorage.getItem("naeil.key")) localStorage.setItem("naeil.key", k);
          for (const [a, b] of Object.entries(s))
            if (!localStorage.getItem(a)) localStorage.setItem(a, b);
        },
        [srv.key, storage],
      );
      const p = await ctx.newPage();
      p.on("pageerror", (e) => errors.push(String(e)));
      return { ctx, p };
    };
    try {
      if (flow.fixture) await flow.fixture(t);
      await flow.run({ ...t, page, browser });
      t.ok(errors.length === 0, `화면 오류 없음 ${errors.join(" | ")}`);
    } catch (err) {
      crashed = true;
      t.ok(false, `흐름이 끝까지 가지 못함: ${err.message.split("\n")[0]}`);
      console.error(srv.log().slice(-1500));
    } finally {
      await srv.stop();
    }
  }
} finally {
  await browser.close();
}

writeFileSync(join(out, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
const failed = results.filter((r) => !r.ok);
console.log(`\n브라우저 흐름 ${results.length}건 중 ${results.length - failed.length}건 통과`);
if (failed.length > 0 || crashed || results.length === 0) process.exit(1);
