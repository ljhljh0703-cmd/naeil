import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db/connection.js";
import { type DbState, RESTART_EXIT_CODE, selfCheckAction } from "./health.js";
import { loadEnv, WEB_DIR } from "./paths.js";
import { checkNode } from "./runtime.js";

// 알려진 보안 구멍이 있는 Node 로는 켜지 않는다. 급할 때만 NAEIL_ALLOW_OLD_NODE=1 로 넘긴다.
const node = checkNode();
if (!node.ok) {
  console.error(`켜지 않음: ${node.reason}`);
  if (process.env.NAEIL_ALLOW_OLD_NODE !== "1") process.exit(1);
}

// .env 는 켠 폴더가 아닌 저장소 뿌리에서 읽는다 (자동 실행은 아무 폴더에서나 켠다)
loadEnv();
const config = loadConfig();
let checkDb: (() => DbState) | null = null;
const db = openDb(config.dbPath);
const app = buildApp({
  onDbChecker: (c) => {
    checkDb = c;
  },
  logger: true,
  db,
  dbPath: config.dbPath,
  webDir: WEB_DIR,
});

app.log.info({ db: config.dbPath }, "자료 파일");
for (const note of config.notes) app.log.warn(note);
if (!existsSync(join(WEB_DIR, "index.html"))) {
  app.log.warn(`화면 파일이 없음 (${WEB_DIR}). npm run build 를 먼저 하세요. API 는 그대로 열림`);
}

// 켜 둔 채 자료 파일을 살핀다. 0 이면 끔. 기본 30초.
const every = Number(process.env.NAEIL_SELF_CHECK_SECONDS ?? 30);
let lastState: DbState = "ok";
if (every > 0) {
  setInterval(() => {
    const state = checkDb?.() ?? "ok";
    if (state !== lastState) {
      if (state === "ok") app.log.info("자료 파일 다시 정상");
      else app.log.error({ db: config.dbPath, state }, "자료 파일 이상");
      lastState = state;
    }
    if (selfCheckAction(state) === "restart") {
      app.log.warn("자료 파일이 다른 파일로 바뀌어 끕니다. 자동 실행이 다시 켜면 새 파일을 엽니다");
      shutdown(RESTART_EXIT_CODE);
    }
  }, every * 1000).unref();
}

// 자동 실행이 끌 때(SIGTERM) 하던 요청을 마치고 자료 파일을 닫는다
let closing = false;
function shutdown(code: number) {
  if (closing) return;
  closing = true;
  app
    .close()
    .then(() => db.close())
    .finally(() => process.exit(code));
}
for (const sig of ["SIGTERM", "SIGINT"] as const) process.once(sig, () => shutdown(0));

app.listen({ host: config.host, port: config.port }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
