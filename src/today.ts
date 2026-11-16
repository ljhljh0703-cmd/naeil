// 서버가 주는 「오늘」 (M1-7). 전에는 화면(브라우저) 안에서만 계산해서,
// 폰과 AI 도구가 서로 다른 「지금 할 것」을 볼 수 있었다 (2026-11-13 검토). 이제 규칙의 원본은 여기 하나.
import type { Task } from "./db/store.js";

const DAY = 24 * 60 * 60 * 1000;
const KST = 9 * 60 * 60 * 1000;

// 한국 날짜 (YYYY-MM-DD). 세계 표준시로 저장한 시각을 한국 날짜로 본다
export function kstDate(d: Date): string {
  return new Date(d.getTime() + KST).toISOString().slice(0, 10);
}

// 마감까지 남은 날 (한국 날짜 기준). 0 = 오늘, 음수 = 지남
export function dDay(dueAt: string, now: Date): number {
  const a = Date.parse(`${kstDate(new Date(dueAt))}T00:00:00Z`);
  const b = Date.parse(`${kstDate(now)}T00:00:00Z`);
  return Math.round((a - b) / DAY);
}

const open = (t: Task) => t.status !== "done" && !t.deleted_at;

// 지금 할 것 1개 (작가 결정 2026-10-25). 내가 직접 해야 하는 일 중
//   ① 하던 중인 것 ② 마감 가까운 것 ③ 오래된 것
// 「오늘 고정」로 고정하면 그게 먼저, 「건너뛰기」 한 것은 그날 하루 뺀다.
export function pickNow(
  tasks: Task[],
  opts: { skipped?: ReadonlySet<string>; pinnedId?: string | null } = {},
): Task | null {
  // AI 담당(가져온 깃허브 이슈 등)은 후보에서 뺀다 (작가 결정 2026-11-13 「AI 몫으로」)
  const mine = tasks.filter((t) => open(t) && !t.blocked_reason && t.owner !== "ai");
  const pinned = mine.find((t) => t.id === opts.pinnedId);
  if (pinned) return pinned;
  const rest = mine.filter((t) => !opts.skipped?.has(t.id));
  rest.sort((a, b) => {
    if (a.status !== b.status) return a.status === "doing" ? -1 : b.status === "doing" ? 1 : 0;
    if (a.due_at !== b.due_at) {
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return a.due_at < b.due_at ? -1 : 1;
    }
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });
  return rest[0] ?? null;
}

// 내가 정할 것 = 「내 결정 대기」 모음
export function waitingOnMe(tasks: Task[]): Task[] {
  return tasks.filter((t) => open(t) && t.blocked_reason === "my_decision");
}

// 마감 가까운 것 = 지난 것 + 앞으로 days일 안
export function dueSoon(tasks: Task[], now: Date, days = 7): Task[] {
  return tasks
    .filter((t) => open(t) && t.due_at && dDay(t.due_at, now) <= days)
    .sort((a, b) => ((a.due_at as string) < (b.due_at as string) ? -1 : 1));
}
