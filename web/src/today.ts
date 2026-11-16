// 오늘 화면의 날짜 도움 함수. 화면 없이 시험할 수 있게 따로 둔다.

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

// 지금 할 것, 내가 정할 것, 마감 가까운 것의 규칙은 서버로 옮겼다 (M1-7, src/today.ts, GET /v1/today).
// 폰과 AI 도구가 화면과 같은 답을 보게 하려고. 여기에는 날짜 표시용 도움 함수만 남긴다.

// 한국 날짜 입력(YYYY-MM-DD) → 그날 밤 23:59:59 한국 시각을 세계 표준시로
export function dueFromKstDate(date: string): string {
  return new Date(`${date}T23:59:59+09:00`).toISOString();
}
