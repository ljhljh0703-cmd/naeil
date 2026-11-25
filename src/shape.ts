// API 가 바깥으로 내보내는 모양 (명세서: 낙타 표기, 세계 표준시).
// 서버(app.ts)와 브라우저 시연판(web/src/demo)이 같이 쓴다. 그래서 여기에는 노드 전용 것을 들이지 않는다
import type { ChangeRow, Decision, Milestone, Project, Store, Task } from "./db/store.js";
import { dueSoon, pickNow, waitingOnMe } from "./today.js";

export const etag = (t: { version: number }) => `"v${t.version}"`;

export const toProject = (p: Project) => ({
  id: p.id,
  name: p.name,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
  deletedAt: p.deleted_at,
});

export const toMilestone = (m: Milestone) => ({
  id: m.id,
  projectId: m.project_id,
  name: m.name,
  dueAt: m.due_at,
  doneWhen: m.done_when ?? null,
  etag: etag(m),
  createdAt: m.created_at,
  updatedAt: m.updated_at,
  deletedAt: m.deleted_at,
});

export const toTask = (t: Task) => ({
  id: t.id,
  projectId: t.project_id,
  milestoneId: t.milestone_id,
  title: t.title,
  status: t.status,
  blockedReason: t.blocked_reason,
  heldBy: t.held_by,
  holdExpiresAt: t.hold_id ? (t.hold_expires_at ?? null) : null,
  dueAt: t.due_at,
  source: t.source,
  sourceRef: t.source_ref,
  externalText: t.external_text === 1,
  body: t.body,
  owner: t.owner ?? "author",
  sourceUrl: t.source_url ?? null,
  progressNote: t.progress_note ?? null,
  priority: t.priority ?? "normal",
  createdAt: t.created_at,
  updatedAt: t.updated_at,
  deletedAt: t.deleted_at,
});

export const toChange = (c: ChangeRow) => ({
  id: c.id,
  at: c.at,
  actor: c.actor,
  actorKind: c.actor_kind,
  session: c.session,
  entity: c.entity,
  entityId: c.entity_id,
  action: c.action,
  details: c.details ? JSON.parse(c.details) : null,
});

export const toDecision = (d: Decision) => ({
  id: d.id,
  taskId: d.task_id,
  question: d.question,
  options: JSON.parse(d.options) as string[],
  recommended: d.recommended,
  basis: d.basis,
  askedBy: d.asked_by,
  askedAt: d.asked_at,
  answer: d.answer,
  note: d.note,
  answeredBy: d.answered_by,
  answeredAt: d.answered_at,
  doneCheck: d.kind === "done_check",
});

// 오늘 (M1-7): 지금 할 것, 내가 정할 것, 마감 가까운 것을 서버가 계산
export function buildToday(s: Store, day: string, now: Date) {
  const state = s.getDay(day);
  const { tasks, later } = s.todayTasks(state.pinnedTaskId);
  const shown = new Set(tasks.map((t) => t.id));
  const pick = pickNow(tasks, { skipped: new Set(state.skipped), pinnedId: state.pinnedTaskId });
  return {
    day,
    now: pick ? toTask(pick) : null,
    pinnedTaskId: state.pinnedTaskId,
    skipped: state.skipped,
    waitingOnMe: waitingOnMe(tasks).map(toTask),
    dueSoon: dueSoon(tasks, now).map(toTask),
    // 내가 정할 것의 질문 (결정함, M1-4)
    decisions: s
      .listDecisions({ open: true })
      .filter((d) => shown.has(d.task_id))
      .map(toDecision),
    // 뒤 마일스톤이라 오늘 화면에서 뺀 열린 일 수
    laterCount: later,
    // AI 가 끈 스위치는 다시 켤 때까지 오늘 화면 맨 위에 (작가 결정 2026-11-13)
    notices: s
      .listSettings()
      .filter((x) => !x.enabled && x.changedKind === "ai")
      .map((x) => ({
        kind: "switch-off" as const,
        name: x.name,
        label: x.label,
        changedBy: x.changedBy,
        reason: x.reason,
        changedAt: x.changedAt,
      })),
  };
}
