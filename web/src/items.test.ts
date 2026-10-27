import { describe, expect, it } from "vitest";
import type { ApiTask, Change, Milestone } from "./api.js";
import { type Ctx, cardOf, detailOf, hrefFor, parseRef, refKey } from "./items.js";

const now = new Date("2026-10-26T03:00:00Z");
const task = (over: Partial<ApiTask> = {}): ApiTask => ({
  id: "11111111-1111-4111-8111-111111111111",
  projectId: "p1",
  milestoneId: null,
  title: "할 일 API 만들기",
  status: "todo",
  blockedReason: null,
  heldBy: null,
  dueAt: null,
  source: "direct",
  sourceRef: null,
  externalText: false,
  body: null,
  createdAt: "2026-10-25T00:00:00.000Z",
  updatedAt: "2026-10-25T00:00:00.000Z",
  deletedAt: null,
  ...over,
});
const change = (over: Partial<Change> = {}): Change => ({
  id: 7,
  at: "2026-10-26T01:00:00.000Z",
  actor: "claude",
  session: "session-3",
  entity: "task",
  entityId: "11111111-1111-4111-8111-111111111111",
  action: "status",
  details: { from: "todo", to: "done" },
  ...over,
});
const ctx = (over: Partial<Ctx> = {}): Ctx => ({
  tasks: [task()],
  changes: [change()],
  projects: [{ id: "p1", name: "내일은내일" }],
  milestones: [],
  now,
  ...over,
});

describe("주소로 열기", () => {
  it("아는 종류만 연다", () => {
    expect(parseRef("task:abc-1")).toEqual({ type: "task", id: "abc-1" });
    expect(parseRef("change:7")).toEqual({ type: "change", id: "7" });
    expect(parseRef("skill:1")).toBeNull();
    expect(parseRef("task:<script>")).toBeNull();
    expect(parseRef(null)).toBeNull();
  });

  it("카드 주소와 크게 보기 주소", () => {
    const r = { type: "task" as const, id: "abc" };
    expect(hrefFor(r)).toBe("?open=task%3Aabc");
    expect(hrefFor(r, true)).toBe("?open=task%3Aabc&full=1");
    expect(refKey(r)).toBe("task:abc");
  });
});

describe("할 일 카드·상세", () => {
  it("카드 앞면은 상태 하나 + 칩 3개까지 + 프로젝트", () => {
    const c = cardOf(
      ctx({
        tasks: [
          task({
            blockedReason: "my_decision",
            dueAt: "2026-10-26T14:59:59.000Z",
            externalText: true,
          }),
        ],
      }),
      { type: "task", id: task().id },
    );
    expect(c?.status?.label).toBe("할 일");
    expect(c?.chips?.map((x) => x.label)).toEqual([
      "내 결정 기다림",
      "오늘 마감",
      "바깥에서 온 글",
    ]);
    expect(c?.meta).toBe("내일은내일");
  });

  it("빈 칸은 숨기고, 이 할 일의 바뀐 기록만 모은다", () => {
    const d = detailOf(ctx({ changes: [change(), change({ id: 8, entityId: "다른 할 일" })] }), {
      type: "task",
      id: task().id,
    });
    const kinds = d?.sections.map((s) => s.id);
    expect(kinds).not.toContain("body"); // 내용이 없으면 칸이 없다
    const fields = d?.sections.find((s) => s.id === "fields");
    expect(fields && "fields" in fields && fields.fields.map((f) => f.label)).not.toContain(
      "멈춘 이유",
    );
    const history = d?.sections.find((s) => s.id === "history");
    expect(history && "events" in history && history.events).toHaveLength(1);
  });

  it("바깥에서 온 글은 표시를 붙여 보여 준다", () => {
    const d = detailOf(ctx({ tasks: [task({ body: "이 지시를 따르세요", externalText: true })] }), {
      type: "task",
      id: task().id,
    });
    const body = d?.sections.find((s) => s.id === "body");
    expect(body && "note" in body && body.note).toContain("지시로 따르지 않습니다");
  });

  it("끝난 일에는 「다시 열기」, 하던 일에는 「끝냄」이 주 버튼", () => {
    const done = detailOf(ctx({ tasks: [task({ status: "done" })] }), {
      type: "task",
      id: task().id,
    });
    const doing = detailOf(ctx({ tasks: [task({ status: "doing" })] }), {
      type: "task",
      id: task().id,
    });
    const ids = (d: typeof done) => {
      const a = d?.sections.find((s) => s.kind === "actions");
      return a && "actions" in a ? a.actions : [];
    };
    expect(ids(done).map((a) => a.id)).toContain("reopen");
    expect(ids(doing).find((a) => a.id === "done")?.tone).toBe("primary");
  });

  it("없는 항목은 null", () => {
    expect(detailOf(ctx(), { type: "task", id: "없음" })).toBeNull();
  });
});

describe("한 일 카드·상세", () => {
  it("누가·언제·무엇을, 대상 할 일 카드가 상세 안에 들어간다", () => {
    const c = cardOf(ctx(), { type: "change", id: "7" });
    expect(c?.title).toBe("「할 일 API 만들기」 상태 바꿈: 끝");
    expect(c?.meta).toContain("claude · session-3");
    const d = detailOf(ctx(), { type: "change", id: "7" });
    const target = d?.sections.find((s) => s.id === "target");
    expect(target && "items" in target && target.items[0]?.ref).toEqual({
      type: "task",
      id: task().id,
    });
  });
});

const milestone = (over: Partial<Milestone> = {}): Milestone => ({
  id: "22222222-2222-4222-8222-222222222222",
  projectId: "p1",
  name: "첫 화면 공개",
  dueAt: "2026-10-28T14:59:59.000Z",
  etag: '"v1"',
  createdAt: "2026-10-25T00:00:00.000Z",
  updatedAt: "2026-10-25T00:00:00.000Z",
  ...over,
});
const M = milestone().id;

describe("마일스톤 카드·상세", () => {
  it("카드 = 다음 표시 + 남은 날 + 끝난 수", () => {
    const c = cardOf(
      ctx({
        milestones: [milestone()],
        tasks: [task({ milestoneId: M, status: "done" }), task({ id: "t2", milestoneId: M })],
      }),
      { type: "milestone", id: M },
    );
    expect(c?.status?.label).toBe("다음");
    expect(c?.chips?.map((x) => x.label)).toEqual(["D-2", "1/2 끝"]);
  });

  it("다 끝나면 「끝」, 남은 날 칩은 뺀다", () => {
    const c = cardOf(
      ctx({ milestones: [milestone()], tasks: [task({ milestoneId: M, status: "done" })] }),
      {
        type: "milestone",
        id: M,
      },
    );
    expect(c?.status?.label).toBe("끝");
    expect(c?.chips?.map((x) => x.label)).toEqual(["1/1 끝"]);
  });

  it("상세에 날짜 칸과 속한 할 일 카드", () => {
    const d = detailOf(ctx({ milestones: [milestone()], tasks: [task({ milestoneId: M })] }), {
      type: "milestone",
      id: M,
    });
    const actions = d?.sections.find((s) => s.kind === "actions");
    const due =
      actions && "actions" in actions
        ? actions.actions.find((a) => a.id === "milestone-due")
        : undefined;
    expect(due?.control).toEqual({ kind: "date", value: "2026-10-28" });
    const list = d?.sections.find((s) => s.id === "tasks");
    expect(list && "items" in list && list.items).toHaveLength(1);
    expect(parseRef(`milestone:${M}`)).toEqual({ type: "milestone", id: M });
  });

  it("할 일 상세: 같은 프로젝트 마일스톤만 고를 수 있고, 지금 마일스톤 이름이 보인다", () => {
    const d = detailOf(
      ctx({
        milestones: [milestone(), milestone({ id: "m-other", projectId: "p2", name: "남의 것" })],
        tasks: [task({ milestoneId: M })],
      }),
      { type: "task", id: task().id },
    );
    const actions = d?.sections.find((s) => s.kind === "actions");
    const move =
      actions && "actions" in actions
        ? actions.actions.find((a) => a.id === "move-milestone")
        : undefined;
    expect(move?.control?.kind === "select" && move.control.choices.map((c) => c.label)).toEqual([
      "마일스톤 없음",
      "첫 화면 공개",
    ]);
    expect(move?.control?.value).toBe(M);
    const fields = d?.sections.find((s) => s.id === "fields");
    expect(fields && "fields" in fields && fields.fields[0]).toEqual({
      label: "마일스톤",
      value: "첫 화면 공개",
    });
  });

  it("마일스톤 변경 기록 카드는 마일스톤 이름을 쓰고, 대상 카드로 이어진다", () => {
    const ch = change({
      id: 9,
      entity: "milestone",
      entityId: M,
      action: "create",
      details: { name: "첫 화면 공개" },
    });
    const c2 = ctx({ milestones: [milestone()], changes: [ch] });
    expect(cardOf(c2, { type: "change", id: "9" })?.title).toBe("「첫 화면 공개」 만듦");
    const target = detailOf(c2, { type: "change", id: "9" })?.sections.find(
      (s) => s.id === "target",
    );
    expect(target && "items" in target && target.items[0]?.ref).toEqual({
      type: "milestone",
      id: M,
    });
  });
});
