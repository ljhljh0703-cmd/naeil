// 마일스톤 보드 규칙. 화면 없이 시험할 수 있게 따로 둔다.
// 근거: Linear 프로젝트 마일스톤 (마일스톤마다 완료율, 하던 중은 일부만 반영, 다음 마일스톤 하나만 강조, 목표 날짜는 나중에 넣어도 됨)
// + TickTick 「날짜 미정 칸」 → 마일스톤 없는 할 일 모음.
import type { Status } from "./today.js";

export type BoardMilestone = { id: string; projectId: string; name: string; dueAt: string | null };
export type BoardTask = {
  id: string;
  projectId: string;
  milestoneId: string | null;
  status: Status;
  deletedAt?: string | null;
};

export type Progress = { total: number; done: number; doing: number; percent: number };

// 끝 = 1, 하는 중 = 0.5. 화면 막대에는 끝과 하는 중을 따로 칠한다.
export function progressOf(tasks: BoardTask[]): Progress {
  const live = tasks.filter((t) => !t.deletedAt);
  const done = live.filter((t) => t.status === "done").length;
  const doing = live.filter((t) => t.status === "doing").length;
  const total = live.length;
  const percent = total === 0 ? 0 : Math.round(((done + doing / 2) / total) * 100);
  return { total, done, doing, percent };
}

export const isComplete = (p: Progress) => p.total > 0 && p.done === p.total;

export type MilestoneGroup = {
  milestone: BoardMilestone | null; // null = 마일스톤 없음
  tasks: BoardTask[];
  progress: Progress;
  next: boolean;
};

// 보드 한 장 = 마일스톤 순서대로 (목표 날짜 → 날짜 없음), 맨 끝에 「마일스톤 없음」.
// 없는(휴지통에 간) 마일스톤을 가리키는 할 일도 「마일스톤 없음」으로 모은다.
export function groupBoard(
  projectId: string,
  milestones: BoardMilestone[],
  tasks: BoardTask[],
): MilestoneGroup[] {
  const ms = milestones
    .filter((m) => m.projectId === projectId)
    .sort((a, b) => {
      if (a.dueAt === b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return a.dueAt < b.dueAt ? -1 : 1;
    });
  const known = new Set(ms.map((m) => m.id));
  const mine = tasks.filter((t) => t.projectId === projectId && !t.deletedAt);
  const groups: MilestoneGroup[] = ms.map((m) => {
    const list = mine.filter((t) => t.milestoneId === m.id);
    return { milestone: m, tasks: list, progress: progressOf(list), next: false };
  });
  const next = groups.find((g) => !isComplete(g.progress));
  if (next) next.next = true;
  const loose = mine.filter((t) => !t.milestoneId || !known.has(t.milestoneId));
  if (loose.length > 0 || groups.length === 0) {
    groups.push({ milestone: null, tasks: loose, progress: progressOf(loose), next: false });
  }
  return groups;
}

// 하던 중 → 할 일 → 끝 순서. 끝난 건 아래로.
const ORDER: Record<Status, number> = { doing: 0, todo: 1, done: 2 };
export const sortForBoard = <T extends BoardTask>(list: T[]): T[] =>
  [...list].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
