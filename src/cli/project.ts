// 프로젝트 이름 정리 명령 (서버 컴퓨터에서). 화면에서도 이름은 바꿀 수 있다
//   npm run project -- list                         프로젝트 목록
//   npm run project -- rename "<지금 이름>" "<새 이름>"
//   npm run project -- merge "<합칠 프로젝트>" "<남길 프로젝트>"   마일스톤, 할 일, 출처를 옮기고 빈 쪽은 휴지통으로
import { loadConfig } from "../config.js";
import { openDb } from "../db/connection.js";
import { Store } from "../db/store.js";
import { loadEnv } from "../paths.js";

const [cmd, a, b] = process.argv.slice(2);
loadEnv();
const config = loadConfig();
console.error(`자료 파일: ${config.dbPath}`);
const store = new Store(openDb(config.dbPath));
const who = { actor: "author-cli", session: null, kind: "human" as const };

function find(name: string | undefined) {
  const p = name ? store.findProjectByName(name) : undefined;
  if (!p) {
    console.error(`「${name ?? ""}」 이름의 프로젝트가 없습니다. npm run project -- list 로 확인`);
    process.exit(1);
  }
  return p;
}

try {
  if (cmd === "list") {
    for (const p of store.listProjects()) console.log(p.name);
  } else if (cmd === "rename" && a && b) {
    store.updateProject(who, find(a).id, { name: b });
    console.log(`「${a}」 → 「${b}」`);
  } else if (cmd === "merge" && a && b) {
    const r = store.mergeProjects(who, find(a).id, find(b).id);
    console.log(
      `「${a}」 를 「${b}」 에 합침: 마일스톤 ${r.milestones}개, 할 일 ${r.tasks}개. 빈 「${a}」 는 휴지통에`,
    );
  } else {
    console.error(
      '쓰는 법: npm run project -- list | rename "<지금 이름>" "<새 이름>" | merge "<합칠 것>" "<남길 것>"',
    );
    process.exit(1);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
