import { describe, expect, it } from "vitest";
import type { ApiTask, Change } from "./api.js";
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
