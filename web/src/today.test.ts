import { describe, expect, it } from "vitest";
import {
  dDay,
  dueFromKstDate,
  dueSoon,
  kstDate,
  pickNow,
  type Task,
  waitingOnMe,
} from "./today.js";

const now = new Date("2026-10-26T03:00:00Z"); // 한국 10/26 12:00
let n = 0;
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`,
  projectId: "p",
  title: "일",
  status: "todo",
  blockedReason: null,
  heldBy: null,
  dueAt: null,
  createdAt: `2026-10-2${n % 10}T00:00:00Z`,
  ...over,
});

describe("한국 날짜", () => {
  it("세계 표준시 15시는 한국 다음 날", () => {
    expect(kstDate(new Date("2026-10-25T15:00:00Z"))).toBe("2026-10-26");
  });

  it("마감 날짜는 그날 밤 한국 23:59:59", () => {
    expect(dueFromKstDate("2026-10-28")).toBe("2026-10-28T14:59:59.000Z");
    expect(dDay(dueFromKstDate("2026-10-28"), now)).toBe(2);
    expect(dDay(dueFromKstDate("2026-10-26"), now)).toBe(0);
  });
});

describe("지금 할 것 1개", () => {
  it("① 하던 중인 것이 먼저", () => {
    const a = task({ dueAt: dueFromKstDate("2026-10-26") });
    const b = task({ status: "doing" });
    expect(pickNow([a, b])?.id).toBe(b.id);
  });

  it("② 그다음 마감 가까운 것 · 마감 없는 건 뒤로", () => {
    const a = task();
    const b = task({ dueAt: dueFromKstDate("2026-10-30") });
    const c = task({ dueAt: dueFromKstDate("2026-10-27") });
    expect(pickNow([a, b, c])?.id).toBe(c.id);
  });

  it("멈춘 일·끝난 일·AI가 하는 일은 고르지 않는다", () => {
    const a = task({ blockedReason: "ai_working", heldBy: "claude" });
    const b = task({ status: "done" });
    const c = task({ blockedReason: "my_decision" });
    expect(pickNow([a, b, c])).toBeNull();
  });

  it("건너뛰면 다음 것, 「오늘은 이거」는 맨 앞", () => {
    const a = task({ status: "doing" });
    const b = task();
    expect(pickNow([a, b], { skipped: new Set([a.id]) })?.id).toBe(b.id);
    expect(pickNow([a, b], { pinnedId: b.id })?.id).toBe(b.id);
  });
});

describe("나머지 칸", () => {
  it("내가 정할 것 = 내 결정 기다림만", () => {
    const a = task({ blockedReason: "my_decision" });
    const b = task({ blockedReason: "external" });
    expect(waitingOnMe([a, b]).map((t) => t.id)).toEqual([a.id]);
  });

  it("마감 가까운 것 = 지난 것 + 7일 안, 빠른 순", () => {
    const late = task({ dueAt: dueFromKstDate("2026-10-24") });
    const soon = task({ dueAt: dueFromKstDate("2026-11-02") });
    const far = task({ dueAt: dueFromKstDate("2026-11-03") });
    expect(dueSoon([far, soon, late], now).map((t) => t.id)).toEqual([late.id, soon.id]);
  });
});
