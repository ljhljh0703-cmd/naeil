// 가져오기 한 번 (M1-3). 윈도우 작업 스케줄러가 한 시간마다 부른다 (scripts/service.mjs import).
//   npm run import            설정 파일대로: 받는 폴더 처리 → 출처 가져오기 → 오늘 한 장 쓰기
// 설정: NAEIL_IMPORT_CONFIG 또는 자료 파일 옆 import.json
//   { "sources": [ { "type": "vault-json", "path": "...naeil-source.json", "project": "vault 유지보수" },
//                  { "type": "github", "repo": "owner/name" } ],
//     "inbox": "<vault>/wiki/projects/naeil-inbox", "todaySheet": "<vault>/wiki/projects/naeil-today.md" }
// 깃허브 토큰(비공개 저장소일 때만): NAEIL_GITHUB_TOKEN. 공개 저장소는 없어도 됨
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadConfig } from "../config.js";
import { openDb } from "../db/connection.js";
import { Store } from "../db/store.js";
import { type ImportConfig, runImport } from "../importer.js";
import { loadEnv } from "../paths.js";

loadEnv();
const config = loadConfig();
const path = process.env.NAEIL_IMPORT_CONFIG || join(dirname(config.dbPath), "import.json");
if (!existsSync(path)) {
  console.log(`가져오기 설정이 없음: ${path} (할 일 없음)`);
  process.exit(0);
}
const settings = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, "")) as ImportConfig;
const db = openDb(config.dbPath);
const store = new Store(db);
const out = await runImport(store, settings, {
  fetch: (url, init) => fetch(url, init),
  now: () => new Date(),
  githubToken: process.env.NAEIL_GITHUB_TOKEN || undefined,
});
db.close();

let failed = 0;
for (const r of out.inbox) {
  console.log(`받은 요청 ${r.file}: ${r.ok ? "처리" : "실패"} ${r.message}`);
  if (!r.ok) failed++;
}
for (const s of out.sources) {
  if (s.error) {
    failed++;
    console.log(`실패  ${s.source} (${s.project}): ${s.error}`);
  } else {
    const r = s.result;
    console.log(
      `가져옴 ${s.source} (${s.project}): 새로 ${r?.created} 고침 ${r?.updated} 끝남 ${r?.closed} 다시 열림 ${r?.reopened} 그대로 ${r?.same} 휴지통이라 둠 ${r?.skipped}`,
    );
  }
}
if (out.sheet) console.log(`오늘 한 장: ${out.sheet}`);
if (out.handoffs?.length) console.log(`이어하기 한 장 ${out.handoffs.length}개`);
process.exit(failed ? 1 : 0);
