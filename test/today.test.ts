// 서버가 주는 오늘의 규칙 (M1-7: 화면 안 규칙을 서버로 옮김. 원래 시험 web/src/today.test.ts)
import { describe, expect, it } from "vitest";
import type { Task } from "../src/db/store.js";
import { dDay, dueSoon, kstDate, pickNow, waitingOnMe } from "../src/today.js";

const now = new Date("2026-10-26T03:00:00Z"); // 한국 10/26 12:00
const due = (day: string) => new Date(`${day}T23:59:59+09:00`).toISOString();
let n = 0;
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`,
  workspace_id: "me",
  project_id: "p",
  milestone_id: null,
  title: "일",
  status: "todo",
  blocked_reason: null,
  held_by: null,
  due_at: null,
  source: "direct",
  source_ref: null,
  external_text: 0,
  body: null,
  version: 1,
  created_at: `2026-10-2${n % 10}T00:00:00Z`,
  updated_at: "2026-10-26T00:00:00Z",
  deleted_at: null,
  ...over,
});

describe("한국 날짜", () => {
  it("세계 표준시 15시는 한국 다음 날", () => {
    expect(kstDate(new Date("2026-10-25T15:00:00Z"))).toBe("2026-10-26");
  });
  it("마감까지 남은 날", () => {
    expect(dDay(due("2026-10-28"), now)).toBe(2);
    expect(dDay(due("2026-10-26"), now)).toBe(0);
  });
});

describe("지금 할 것 1개", () => {
  it("① 하던 중인 것이 먼저", () => {
    const a = task({ due_at: due("2026-10-26") });
    const b = task({ status: "doing" });
    expect(pickNow([a, b])?.id).toBe(b.id);
  });
  it("② 그다음 마감 가까운 것, 마감 없는 건 뒤로", () => {
    const a = task();
    const b = task({ due_at: due("2026-10-30") });
    const c = task({ due_at: due("2026-10-27") });
    expect(pickNow([a, b, c])?.id).toBe(c.id);
  });
  it("멈춘 일, 끝난 일, AI가 하는 일, 휴지통 일은 고르지 않는다", () => {
    const a = task({ blocked_reason: "ai_working", held_by: "claude" });
    const b = task({ status: "done" });
    const c = task({ blocked_reason: "my_decision" });
    const d = task({ deleted_at: "2026-10-25T00:00:00Z" });
    expect(pickNow([a, b, c, d])).toBeNull();
  });
  it("건너뛰면 다음 것, 「오늘은 이거」는 맨 앞, 고정한 일이 멈추면 고정이 풀린 것처럼", () => {
    const a = task({ status: "doing" });
    const b = task();
    expect(pickNow([a, b], { skipped: new Set([a.id]) })?.id).toBe(b.id);
    expect(pickNow([a, b], { pinnedId: b.id })?.id).toBe(b.id);
    const blocked = { ...b, blocked_reason: "external" as const };
    expect(pickNow([a, blocked], { pinnedId: b.id })?.id).toBe(a.id);
  });
});

describe("나머지 칸", () => {
  it("내가 정할 것 = 내 결정 기다림만", () => {
    const a = task({ blocked_reason: "my_decision" });
    const b = task({ blocked_reason: "external" });
    expect(waitingOnMe([a, b]).map((t) => t.id)).toEqual([a.id]);
  });
  it("마감 가까운 것 = 지난 것 + 7일 안, 빠른 순", () => {
    const late = task({ due_at: due("2026-10-24") });
    const soon = task({ due_at: due("2026-11-02") });
    const far = task({ due_at: due("2026-11-03") });
    expect(dueSoon([far, soon, late], now).map((t) => t.id)).toEqual([late.id, soon.id]);
  });
});
