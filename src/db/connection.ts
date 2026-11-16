import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { migrateUp } from "./migrate.js";

// 파일 경로는 바깥 설정에서 받는다. 아이클라우드 동기화 폴더(문서·데스크탑)에는 두지 않는다.
export function openDb(path: string): Database.Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  // 켜진 서버와 가져오기 명령이 같은 파일을 쓸 때, 잠깐 잠겨 있으면 기다렸다가 쓴다 (M1-3)
  db.pragma("busy_timeout = 5000");
  migrateUp(db);
  return db;
}
