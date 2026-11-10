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

// 켜 둔 채 스스로 살피다가 무엇을 할지.
// replaced: 끄고 나간다. 자동 실행(맥 launchd)이 다시 켜면 새 파일을 연다.
// missing: 끄지 않는다. 다시 켜면 그 자리에 빈 자료 파일이 새로 생겨 「빈 작업판」이 정상처럼 보이게 되므로, 503 을 유지해 사람이 보게 한다.
export type SelfCheckAction = "keep" | "restart";
export function selfCheckAction(state: DbState): SelfCheckAction {
  return state === "replaced" ? "restart" : "keep";
}

// 다시 켜 달라는 뜻의 종료 번호 (자동 실행 설정은 0 이 아닌 종료를 모두 다시 켠다)
export const RESTART_EXIT_CODE = 75;
