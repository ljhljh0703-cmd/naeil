// 상태 확인(/health)이 보는 것. 「프로세스가 살아 있다」만으로는 부족하다:
// 켜진 채로 자료 파일이 지워지거나 백업본으로 바뀌면, 서버는 옛 파일을 붙든 채 계속 「정상」이라고 답했다(2026-11-05 적대 검토에서 재현).
import { existsSync, statSync } from "node:fs";
import type Database from "better-sqlite3";

export type DbState = "ok" | "missing" | "replaced" | "error";
export type WebState = "ok" | "missing" | "off";

const fileId = (path: string) => {
  const s = statSync(path);
  return `${s.dev}:${s.ino}`;
};

// 켤 때 연 파일을 기억해 두고, 물을 때마다 「같은 자리에 같은 파일이 있고 읽히는지」 본다.
export function dbChecker(db: Database.Database, path?: string): () => DbState {
  const onDisk = path !== undefined && path !== ":memory:" && existsSync(path);
  const opened = onDisk ? fileId(path) : null;
  return () => {
    try {
      db.prepare("SELECT count(*) AS n FROM schema_migrations").get();
      if (!onDisk || opened === null) return "ok";
      if (!existsSync(path)) return "missing";
      if (fileId(path) !== opened) return "replaced";
      return "ok";
    } catch {
      return "error";
    }
  };
}
