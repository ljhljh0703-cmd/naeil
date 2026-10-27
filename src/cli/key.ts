// 출입증 명령 (작가 결정 2026-10-25: 도구별 출입증 3장)
//   npm run key -- new author     화면용
//   npm run key -- new claude     Claude 세션용
//   npm run key -- new codex      Codex 세션용
//   npm run key -- revoke claude  폐기 (잃어버렸거나 바꿀 때)
//   npm run key -- list           목록 (키 원문은 다시 못 봄)
import { createKey, listKeys, revokeKey } from "../auth.js";
import { loadConfig } from "../config.js";
import { openDb } from "../db/connection.js";

const [cmd, name] = process.argv.slice(2);
const db = openDb(loadConfig().dbPath);

function usage(): never {
  console.error("쓰는 법: npm run key -- new <이름> | revoke <이름> | list");
  process.exit(1);
}

try {
  if (cmd === "new" && name) {
    const key = createKey(db, name);
    console.log(`\n「${name}」 출입증 (지금 한 번만 보입니다. 바로 복사해 두세요)\n\n  ${key}\n`);
    console.log(
      "어디에 넣나: 화면은 첫 화면의 출입증 칸, AI 세션은 그 도구 설정 파일의 NAEIL_KEY.",
    );
    console.log(
      "저장소(깃허브)에는 절대 올리지 마세요. 잃어버리면 revoke 후 새로 만들면 됩니다.\n",
    );
  } else if (cmd === "revoke" && name) {
    console.log(
      revokeKey(db, name)
        ? `「${name}」 출입증을 폐기했습니다.`
        : `살아 있는 「${name}」 출입증이 없습니다.`,
    );
  } else if (cmd === "list") {
    for (const k of listKeys(db)) {
      console.log(
        `${k.name.padEnd(10)} 만든 날 ${k.created_at}  ${k.revoked_at ? `폐기 ${k.revoked_at}` : "사용 중"}`,
      );
    }
  } else {
    usage();
  }
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
