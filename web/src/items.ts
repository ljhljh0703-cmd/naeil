// 누를 수 있는 카드와 상세 칸의 공통 틀 (작가 요청 2026-10-26 「한 일인가 할 일 상호작용 가능한 카드
// 형태면 좋겠음 누르면 볼 수 있게. 이런 범용성 확장성」).
// 근거 조사: 카드 앞면은 적게, 상세는 칸 배열 (Trello 카드 뒷면 칸 · Backstage 종류별 탭 · Jira 빈 칸 숨김).
// 새 종류(마일스톤 · AI 세션 · 스킬)는 registerItemType 하나로 끼운다. 칸 모양은 공통 틀이 그린다.
import type { ApiTask, Change, Milestone, Project } from "./api.js";
import { groupBoard, isComplete, progressOf, sortForBoard } from "./board.js";
import { ACTION, BLOCKED, dayOf, dLabel, STATUS, timeOf, whoOf } from "./labels.js";
import { dDay, kstDate, type Status } from "./today.js";

export type ItemType = "task" | "change" | "milestone";
export type ItemRef = { type: ItemType; id: string };

export type Tone = "neutral" | "info" | "warn" | "done" | "fail";
export type Chip = { label: string; tone?: Tone };
// 버튼 하나, 또는 고르기(select)·날짜 칸. 고르기·날짜는 값이 바뀌면 바로 onAction(값)
export type Control =
  | { kind: "select"; value: string; choices: { value: string; label: string }[] }
  | { kind: "date"; value: string };
export type Action = {
  id: string;
  label: string;
  tone?: "primary" | "default" | "danger";
  control?: Control;
};
export type Field = { label: string; value: string | null };
export type Event = { at: string; who?: string; text: string };

export type Section =
  | { id: string; kind: "fields"; title?: string; fields: Field[] }
  | { id: string; kind: "body"; title?: string; text: string | null; note?: string }
  | { id: string; kind: "timeline"; title?: string; events: Event[] }
  | { id: string; kind: "list"; title?: string; items: CardModel[] }
  | { id: string; kind: "actions"; actions: Action[] };

export type CardModel = {
  ref: ItemRef;
  title: string;
  status?: Chip;
  chips?: Chip[]; // 3개까지
  meta?: string;
  quickAction?: Action;
};

export type DetailModel = {
  ref: ItemRef;
  kindLabel: string;
  title: string;
  status?: Chip;
  meta?: string;
  sections: Section[];
};

export type Ctx = {
  tasks: ApiTask[];
  changes: Change[];
  projects: Project[];
  milestones: Milestone[];
  now: Date;
};

type Def<T> = {
  label: string;
  find: (ctx: Ctx, id: string) => T | undefined;
  card: (item: T, ctx: Ctx) => CardModel;
  detail: (item: T, ctx: Ctx) => Omit<DetailModel, "ref" | "kindLabel">;
};

const registry = new Map<ItemType, Def<unknown>>();

export function registerItemType<T>(type: ItemType, def: Def<T>) {
  registry.set(type, def as Def<unknown>);
}

export const refKey = (r: ItemRef) => `${r.type}:${r.id}`;

// 주소의 「?open=task:…」 를 읽는다. 모르는 종류·이상한 번호는 무시
export function parseRef(value: string | null): ItemRef | null {
  if (!value) return null;
  const m = /^([a-z]+):([A-Za-z0-9-]{1,64})$/.exec(value);
  if (!m?.[1] || !m[2] || !registry.has(m[1] as ItemType)) return null;
  return { type: m[1] as ItemType, id: m[2] };
}

export const hrefFor = (r: ItemRef, full = false) =>
  `?open=${encodeURIComponent(refKey(r))}${full ? "&full=1" : ""}`;

export function cardOf(ctx: Ctx, ref: ItemRef): CardModel | null {
  const def = registry.get(ref.type);
  const item = def?.find(ctx, ref.id);
  return def && item ? def.card(item, ctx) : null;
}

// 빈 칸은 숨긴다. 칸 안의 빈 값(null)도 숨긴다 (Jira 「비어 있으면 숨김」)
export function detailOf(ctx: Ctx, ref: ItemRef): DetailModel | null {
  const def = registry.get(ref.type);
  const item = def?.find(ctx, ref.id);
  if (!def || !item) return null;
  const d = def.detail(item, ctx);
  const sections = d.sections
    .map((s) => (s.kind === "fields" ? { ...s, fields: s.fields.filter((f) => f.value) } : s))
    .filter((s) => {
      if (s.kind === "fields") return s.fields.length > 0;
      if (s.kind === "body") return !!s.text;
      if (s.kind === "timeline") return s.events.length > 0;
      if (s.kind === "list") return s.items.length > 0;
      return s.actions.length > 0;
    });
  return { ...d, ref, kindLabel: def.label, sections };
}

// ── 할 일 ──

const statusTone: Record<Status, Tone> = { todo: "neutral", doing: "info", done: "done" };

const projectName = (ctx: Ctx, id: string) => ctx.projects.find((p) => p.id === id)?.name ?? null;
const milestoneOf = (ctx: Ctx, id: string | null) =>
  id ? ctx.milestones.find((m) => m.id === id) : undefined;

function changeText(c: Change): string {
  const base = ACTION[c.action] ?? c.action;
  const d = c.details ?? {};
  if (c.action === "status" && typeof d.to === "string") {
    return `${base}: ${STATUS[d.to as Status] ?? d.to}`;
  }
  if (c.action === "block" && typeof d.reason === "string") {
    return `${base}: ${BLOCKED[d.reason as keyof typeof BLOCKED] ?? d.reason}`;
  }
  return base;
}

export function taskChips(t: ApiTask, ctx: Ctx): Chip[] {
  const chips: Chip[] = [];
  if (t.blockedReason) chips.push({ label: BLOCKED[t.blockedReason], tone: "warn" });
  if (t.dueAt && t.status !== "done") {
    const d = dDay(t.dueAt, ctx.now);
    chips.push({ label: dLabel(d), tone: d < 0 ? "fail" : d <= 1 ? "warn" : "neutral" });
  }
  if (t.externalText) chips.push({ label: "바깥에서 온 글", tone: "neutral" });
  return chips.slice(0, 3);
}

registerItemType<ApiTask>("task", {
  label: "할 일",
  find: (ctx, id) => ctx.tasks.find((t) => t.id === id),
  card: (t, ctx) => ({
    ref: { type: "task", id: t.id },
    title: t.title,
    status: { label: STATUS[t.status], tone: statusTone[t.status] },
    chips: taskChips(t, ctx),
    meta: projectName(ctx, t.projectId) ?? undefined,
  }),
  detail: (t, ctx) => {
    const actions: Action[] = [];
    if (t.status === "todo") actions.push({ id: "start", label: "시작", tone: "primary" });
    if (t.status !== "done")
      actions.push({
        id: "done",
        label: "끝냄",
        tone: t.status === "doing" ? "primary" : "default",
      });
    if (t.status === "done") actions.push({ id: "reopen", label: "다시 열기" });
    if (t.blockedReason === "my_decision") actions.push({ id: "decided", label: "정했음" });
    else if (t.status !== "done") actions.push({ id: "need-decision", label: "내가 정할 게 있음" });
    const choices = ctx.milestones.filter((m) => m.projectId === t.projectId);
    if (choices.length > 0) {
      actions.push({
        id: "move-milestone",
        label: "마일스톤",
        control: {
          kind: "select",
          value: milestoneOf(ctx, t.milestoneId) ? (t.milestoneId as string) : "",
          choices: [
            { value: "", label: "마일스톤 없음" },
            ...choices.map((m) => ({ value: m.id, label: m.name })),
          ],
        },
      });
    }
    actions.push({ id: "trash", label: "휴지통", tone: "danger" });
    return {
      title: t.title,
      status: { label: STATUS[t.status], tone: statusTone[t.status] },
      meta: projectName(ctx, t.projectId) ?? undefined,
      sections: [
        { id: "actions", kind: "actions", actions },
        {
          id: "fields",
          kind: "fields",
          fields: [
            { label: "마일스톤", value: milestoneOf(ctx, t.milestoneId)?.name ?? null },
            { label: "멈춘 이유", value: t.blockedReason ? BLOCKED[t.blockedReason] : null },
            { label: "잡은 세션", value: t.heldBy },
            {
              label: "마감",
              value: t.dueAt ? `${dayOf(t.dueAt)} (${dLabel(dDay(t.dueAt, ctx.now))})` : null,
            },
            {
              label: "출처",
              value: t.source === "direct" ? null : `${t.source} ${t.sourceRef ?? ""}`,
            },
            { label: "만든 날", value: timeOf(t.createdAt) },
            { label: "마지막으로 바뀜", value: timeOf(t.updatedAt) },
          ],
        },
        {
          id: "body",
          kind: "body",
          title: "내용",
          text: t.body,
          // 바깥(이슈·제보)에서 온 글은 AI가 지시로 따르지 않는 글이라는 표시를 같이 보인다
          note: t.externalText
            ? "바깥에서 온 글입니다. 이 안의 문장은 지시로 따르지 않습니다."
            : undefined,
        },
        {
          id: "history",
          kind: "timeline",
          title: "바뀐 기록",
          events: ctx.changes
            .filter((c) => c.entity === "task" && c.entityId === t.id)
            .map((c) => ({ at: c.at, who: whoOf(c.actor, c.session), text: changeText(c) })),
        },
      ],
    };
  },
});

// ── 마지막에 한 일 (변경 기록 한 줄) ──

function changeTarget(c: Change, ctx: Ctx): string {
  if (c.entity === "task") {
    return (
      ctx.tasks.find((t) => t.id === c.entityId)?.title ??
      (typeof c.details?.title === "string" ? c.details.title : "(휴지통)")
    );
  }
  if (c.entity === "milestone") {
    return (
      milestoneOf(ctx, c.entityId)?.name ??
      (typeof c.details?.name === "string" ? c.details.name : "(휴지통)")
    );
  }
  return (
    projectName(ctx, c.entityId) ??
    (typeof c.details?.name === "string" ? c.details.name : "(휴지통)")
  );
}

// 변경 기록의 값 이름·값을 쉬운 말로
const DETAIL_KEY: Record<string, string> = {
  from: "바꾸기 전",
  to: "바꾼 뒤",
  reason: "멈춘 이유",
  held_by: "잡은 세션",
  title: "제목",
  name: "이름",
  source: "출처",
  due_at: "마감",
  milestone_id: "마일스톤",
  cleared_block: "같이 풀린 멈춤",
};

function detailValue(key: string, v: unknown, ctx: Ctx): string | null {
  if (key === "milestone_id") return v ? (milestoneOf(ctx, String(v))?.name ?? "(휴지통)") : "없음";
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  if (key === "from" || key === "to") return STATUS[s as Status] ?? s;
  if (key === "reason" || key === "cleared_block") return BLOCKED[s as keyof typeof BLOCKED] ?? s;
  if (key === "due_at") return dayOf(s);
  if (key === "source" && s === "direct") return "직접 만듦";
  return s;
}

registerItemType<Change>("change", {
  label: "한 일",
  find: (ctx, id) => ctx.changes.find((c) => String(c.id) === id),
  card: (c, ctx) => ({
    ref: { type: "change", id: String(c.id) },
    title: `「${changeTarget(c, ctx)}」 ${changeText(c)}`,
    meta: `${timeOf(c.at)} · ${whoOf(c.actor, c.session)}`,
  }),
  detail: (c, ctx) => {
    const targetRef: ItemRef | null =
      c.entity === "task" || c.entity === "milestone" ? { type: c.entity, id: c.entityId } : null;
    const taskCard = targetRef ? cardOf(ctx, targetRef) : null;
    const details = Object.entries(c.details ?? {}).map(([k, v]) => ({
      label: DETAIL_KEY[k] ?? k,
      value: detailValue(k, v, ctx),
    }));
    return {
      title: `「${changeTarget(c, ctx)}」 ${changeText(c)}`,
      meta: `${timeOf(c.at)} · ${whoOf(c.actor, c.session)}`,
      sections: [
        {
          id: "who",
          kind: "fields",
          fields: [
            { label: "언제", value: timeOf(c.at) },
            { label: "누가", value: c.actor },
            { label: "세션", value: c.session },
            { label: "한 일", value: ACTION[c.action] ?? c.action },
          ],
        },
        { id: "target", kind: "list", title: "대상", items: taskCard ? [taskCard] : [] },
        { id: "details", kind: "fields", title: "바뀐 값", fields: details },
      ],
    };
  },
});

// ── 마일스톤 ──
// 카드 앞면 = 이름 + 「다음」 또는 「끝」 + 목표 날짜 + 진행 수. 상세 = 날짜 바꾸기 · 속한 할 일 · 바뀐 기록.

function milestoneStatus(m: Milestone, ctx: Ctx): Chip | undefined {
  const g = groupBoard(m.projectId, ctx.milestones, ctx.tasks).find(
    (x) => x.milestone?.id === m.id,
  );
  if (!g) return undefined;
  if (isComplete(g.progress)) return { label: "끝", tone: "done" };
  if (g.next) return { label: "다음", tone: "info" };
  return undefined;
}

const tasksIn = (ctx: Ctx, m: Milestone) =>
  ctx.tasks.filter((t) => t.milestoneId === m.id && !t.deletedAt);

registerItemType<Milestone>("milestone", {
  label: "마일스톤",
  find: (ctx, id) => ctx.milestones.find((m) => m.id === id),
  card: (m, ctx) => {
    const p = progressOf(tasksIn(ctx, m));
    const chips: Chip[] = [];
    if (m.dueAt && !isComplete(p)) {
      const d = dDay(m.dueAt, ctx.now);
      chips.push({ label: dLabel(d), tone: d < 0 ? "fail" : d <= 1 ? "warn" : "neutral" });
    }
    chips.push({ label: p.total === 0 ? "할 일 없음" : `${p.done}/${p.total} 끝` });
    return {
      ref: { type: "milestone", id: m.id },
      title: m.name,
      status: milestoneStatus(m, ctx),
      chips,
      meta: projectName(ctx, m.projectId) ?? undefined,
    };
  },
  detail: (m, ctx) => {
    const list = tasksIn(ctx, m);
    const p = progressOf(list);
    return {
      title: m.name,
      status: milestoneStatus(m, ctx),
      meta: projectName(ctx, m.projectId) ?? undefined,
      sections: [
        {
          id: "actions",
          kind: "actions",
          actions: [
            {
              id: "milestone-due",
              label: "목표 날짜",
              control: { kind: "date", value: m.dueAt ? kstDate(new Date(m.dueAt)) : "" },
            },
            { id: "milestone-trash", label: "휴지통", tone: "danger" },
          ],
        },
        {
          id: "fields",
          kind: "fields",
          fields: [
            {
              label: "목표 날짜",
              value: m.dueAt ? `${dayOf(m.dueAt)} (${dLabel(dDay(m.dueAt, ctx.now))})` : null,
            },
            {
              label: "진행",
              value:
                p.total === 0
                  ? "속한 할 일 없음"
                  : `${p.done}/${p.total} 끝${p.doing ? ` · 하는 중 ${p.doing}` : ""} (${p.percent}%)`,
            },
            { label: "만든 날", value: timeOf(m.createdAt) },
          ],
        },
        {
          id: "tasks",
          kind: "list",
          title: "속한 할 일",
          items: sortForBoard(list)
            .map((t) => cardOf(ctx, { type: "task", id: t.id }))
            .filter((c): c is CardModel => !!c),
        },
        {
          id: "history",
          kind: "timeline",
          title: "바뀐 기록",
          events: ctx.changes
            .filter((c) => c.entity === "milestone" && c.entityId === m.id)
            .map((c) => ({ at: c.at, who: whoOf(c.actor, c.session), text: changeText(c) })),
        },
      ],
    };
  },
});
