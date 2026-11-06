import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db/connection.js";
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
const app = buildApp({
  logger: true,
  db: openDb(config.dbPath),
  dbPath: config.dbPath,
  webDir: WEB_DIR,
});

app.log.info({ db: config.dbPath }, "자료 파일");
for (const note of config.notes) app.log.warn(note);
if (!existsSync(join(WEB_DIR, "index.html"))) {
  app.log.warn(`화면 파일이 없음 (${WEB_DIR}). npm run build 를 먼저 하세요. API 는 그대로 열림`);
}

app.listen({ host: config.host, port: config.port }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
