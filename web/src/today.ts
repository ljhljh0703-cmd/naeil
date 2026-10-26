// 오늘 화면 4칸의 규칙. 화면 없이 시험할 수 있게 따로 둔다.

export type Status = "todo" | "doing" | "done";
export type BlockedReason = "my_decision" | "ai_working" | "external" | "tech";

export type Task = {
  id: string;
  projectId: string;
  title: string;
  status: Status;
  blockedReason: BlockedReason | null;
  heldBy: string | null;
  dueAt: string | null;
  createdAt: string;
  deletedAt?: string | null;
};

const DAY = 24 * 60 * 60 * 1000;
const KST = 9 * 60 * 60 * 1000;

// 한국 날짜 (YYYY-MM-DD). 세계 표준시로 저장한 시각을 한국 날짜로 본다.
export function kstDate(d: Date): string {
  return new Date(d.getTime() + KST).toISOString().slice(0, 10);
}

// 마감까지 남은 날 (한국 날짜 기준). 0 = 오늘, 음수 = 지남
export function dDay(dueAt: string, now: Date): number {
  const a = Date.parse(`${kstDate(new Date(dueAt))}T00:00:00Z`);
  const b = Date.parse(`${kstDate(now)}T00:00:00Z`);
  return Math.round((a - b) / DAY);
}

const open = (t: Task) => t.status !== "done" && !t.deletedAt;

// 지금 할 것 1개 (작가 결정 2026-10-25). 내가 직접 해야 하는 일 중
//   ① 하던 중인 것 ② 마감 가까운 것 ③ 이게 끝나야 다른 일이 움직이는 것 ④ 금방 끝나는 작은 것
// ③·④는 아직 데이터 칸이 없어서 다음 조각에서 붙인다. 그 대신 오래된 것부터.
// 「오늘은 이거」로 고정하면 그게 먼저, 「건너뛰기」 한 것은 오늘 하루 뺀다.
export function pickNow(
  tasks: Task[],
  opts: { skipped?: ReadonlySet<string>; pinnedId?: string | null } = {},
): Task | null {
  const mine = tasks.filter((t) => open(t) && !t.blockedReason);
  const pinned = mine.find((t) => t.id === opts.pinnedId);
  if (pinned) return pinned;
  const rest = mine.filter((t) => !opts.skipped?.has(t.id));
  rest.sort((a, b) => {
    if (a.status !== b.status) return a.status === "doing" ? -1 : b.status === "doing" ? 1 : 0;
    if (a.dueAt !== b.dueAt) {
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return a.dueAt < b.dueAt ? -1 : 1;
    }
    return a.createdAt < b.createdAt ? -1 : 1;
  });
  return rest[0] ?? null;
}

// 내가 정할 것 = 「내 결정 기다림」 모음
export function waitingOnMe(tasks: Task[]): Task[] {
  return tasks.filter((t) => open(t) && t.blockedReason === "my_decision");
}

// 마감 가까운 것 = 지난 것 + 앞으로 days일 안
export function dueSoon(tasks: Task[], now: Date, days = 7): Task[] {
  return tasks
    .filter((t) => open(t) && t.dueAt && dDay(t.dueAt, now) <= days)
    .sort((a, b) => ((a.dueAt as string) < (b.dueAt as string) ? -1 : 1));
}

// 한국 날짜 입력(YYYY-MM-DD) → 그날 밤 23:59:59 한국 시각을 세계 표준시로
export function dueFromKstDate(date: string): string {
  return new Date(`${date}T23:59:59+09:00`).toISOString();
}
