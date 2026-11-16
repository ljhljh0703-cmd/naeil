// 시연판 예시 자료. 지어낸 프로젝트 둘. 실제 할 일은 넣지 않는다.
// 지난 6일에 걸쳐 쓴 것처럼 시계를 돌려 가며 넣어, 「최근 7일」과 「마지막에 한 일」이 비지 않게
import { Store } from "../../../src/db/store.js";
import type { BrowserDb } from "./sqlite.js";

const DAY = 86_400_000;
const me = { actor: "author", kind: "human" as const, session: null };
const claude = { actor: "claude", kind: "ai" as const, session: "시연-세션" };

export function fillSample(db: BrowserDb, now: Date): void {
  let at = new Date(now.getTime() - 6 * DAY);
  const s = new Store(db as never, "me", () => at);
  const day = (n: number, h: number) => {
    // n 일 전 한국 h 시
    const base = new Date(now.getTime() - n * DAY);
    const kst = new Date(base.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
    at = new Date(Date.parse(`${kst}T${String(h).padStart(2, "0")}:00:00+09:00`));
    s.markOpened(kst);
  };
  const iso = (daysAhead: number) => new Date(now.getTime() + daysAhead * DAY).toISOString();

  day(6, 9);
  const game = s.createProject(me, "예시 퍼즐 게임");
  const launch = s.createMilestone(me, game, "첫 공개판", iso(5));
  s.updateMilestone(me, launch, { doneWhen: "누구나 주소로 열어 한 판을 끝까지 할 수 있음" });
  const tutorial = s.createTask(me, {
    projectId: game,
    milestoneId: launch,
    title: "첫 판 안내 문구 쓰기",
  });
  const sound = s.createTask(me, {
    projectId: game,
    milestoneId: launch,
    title: "소리 크기 조절 넣기",
  });
  const score = s.createTask(me, {
    projectId: game,
    milestoneId: launch,
    title: "점수 저장 붙이기",
    dueAt: iso(2),
  });

  day(5, 10);
  s.updateTask(me, tutorial, { status: "doing", progressNote: "세 줄 중 두 줄 씀" });
  const site = s.createProject(me, "예시 소개 페이지");
  const page = s.createMilestone(me, site, "첫 화면");
  const copy = s.createTask(me, {
    projectId: site,
    milestoneId: page,
    title: "첫 화면 문구 고르기",
  });
  const shot = s.createTask(me, {
    projectId: site,
    milestoneId: page,
    title: "화면 그림 세 장 찍기",
    dueAt: iso(1),
  });

  day(4, 14);
  const ai1 = s.createTask(claude, {
    projectId: game,
    milestoneId: launch,
    title: "점수 저장 시험 쓰기",
    owner: "ai",
  });
  s.updateTask(claude, ai1, { status: "doing", progressNote: "저장과 불러오기 시험 둘 통과" });
  s.askDecision(claude, score, {
    question: "점수를 어디에 저장할까요?",
    options: ["브라우저에만", "서버에도"],
    recommended: "브라우저에만",
    basis: "첫 공개판은 로그인이 없어서, 서버에 두면 누구 점수인지 가릴 수 없음",
  });

  day(3, 11);
  s.updateTask(me, sound, { status: "done" });
  s.importItems({ actor: "import", session: null, kind: null }, "github", game, [
    { ref: "example/puzzle#3", title: "모바일에서 버튼이 겹침", state: "open", owner: "ai" },
    { ref: "example/puzzle#4", title: "다시 하기 누르면 점수가 남음", state: "open", owner: "ai" },
  ]);

  day(1, 20);
  s.askDecision(claude, copy, {
    question: "첫 화면 제목은 어느 쪽으로 할까요?",
    options: ["한 판 1분, 바로 시작", "하루 한 번 퍼즐"],
    recommended: "한 판 1분, 바로 시작",
    basis: "들어오자마자 할 일을 보여 주는 쪽이 나가는 사람이 적다는 예시 기준",
  });
  s.block(me, shot, "external");

  day(0, 8);
  s.updateTask(claude, ai1, { progressNote: "점수 덮어쓰기 경우만 남음" });
  at = now;
}
