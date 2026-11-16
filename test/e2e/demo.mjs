// 공개 시연판 시험 (M1-9). 구운 시연판(web/dist-demo)을 파일 서버로 열고, 서버 없이 도는지 본다.
//   npm run build:demo && node test/e2e/demo.mjs
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../..", import.meta.url));
const dir = join(root, "web", "dist-demo");
const out = join(root, "test", "e2e", "out");
if (!existsSync(join(dir, "index.html"))) {
  console.error("시연판이 없음. npm run build:demo 먼저");
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};
// 클라우드플레어 페이지처럼: 있는 파일은 그대로, 없는 주소는 index.html
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(
    /^(\.\.[/\\])+/,
    "",
  );
  let file = join(dir, path);
  if (!existsSync(file) || path === "/") file = join(dir, "index.html");
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;

let pass = 0;
let fail = 0;
const ok = (cond, name) => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "통과" : "실패"}  [demo] ${name}`);
};
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if (await fn()) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

const browser = await chromium.launch();
try {
  for (const [w, h, label] of [
    [1440, 900, "pc"],
    [390, 844, "phone"],
  ]) {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const api = [];
    p.on("request", (r) => r.url().includes("/v1/") && api.push(r.url()));
    await p.goto(base);
    ok(
      await until(async () => (await p.locator(".hero h2").count()) === 1),
      `${label}: 출입증 없이 바로 오늘 화면`,
    );
    ok(
      await until(async () =>
        (await p.locator(".demo-banner").textContent()).includes("예시 자료"),
      ),
      `${label}: 시연판 띠`,
    );
    const pick = p.getByRole("button", { name: /고르기/ }).first();
    ok(await until(async () => (await pick.count()) === 1), `${label}: 내가 정할 것에 예시 질문`);
    await pick.click();
    await p
      .getByRole("button", { name: /\(추천\)/ })
      .first()
      .click();
    ok(
      await until(async () => (await p.locator(".detail").textContent()).includes("고른 답")),
      `${label}: 고르면 답이 남음`,
    );
    // 폰에서는 상세가 화면을 덮으므로 뒤로 가기로 닫는다
    await p.goBack();
    await until(async () => (await p.locator(".detail").count()) === 0);
    await p.locator(".usage summary").click();
    ok(
      await until(async () => (await p.locator(".usage li").count()) === 7),
      `${label}: 최근 7일 일곱 줄`,
    );
    await p
      .screenshot({ path: join(out, `demo-${label}.png`), fullPage: true, timeout: 15000 })
      .catch(() => {});
    const before = await p.getByRole("button", { name: /고르기/ }).count();
    await p.reload();
    await p.waitForSelector(".hero");
    ok(
      await until(async () => (await p.getByRole("button", { name: /고르기/ }).count()) > before),
      `${label}: 새로 고치면 처음 자료로`,
    );
    ok(api.length === 0, `${label}: 바깥 서버로 나가는 요청 없음`);
    ok(errors.length === 0, `${label}: 화면 오류 없음 ${errors.slice(0, 2).join(" | ")}`);
    await p.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\n시연판 ${pass + fail}건 중 ${pass}건 통과`);
process.exit(fail === 0 ? 0 : 1);
