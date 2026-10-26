import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db/connection.js";
import { checkNode } from "./runtime.js";

// 알려진 보안 구멍이 있는 Node 로는 켜지 않는다. 급할 때만 NAEIL_ALLOW_OLD_NODE=1 로 넘긴다.
const node = checkNode();
if (!node.ok) {
  console.error(`켜지 않음: ${node.reason}`);
  if (process.env.NAEIL_ALLOW_OLD_NODE !== "1") process.exit(1);
}

const config = loadConfig();
const app = buildApp({
  logger: true,
  db: openDb(config.dbPath),
  webDir: new URL("../web/dist", import.meta.url).pathname,
});

app.listen({ host: config.host, port: config.port }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
