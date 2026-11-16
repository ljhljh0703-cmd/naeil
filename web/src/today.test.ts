import { describe, expect, it } from "vitest";
import { dDay, dueFromKstDate, kstDate } from "./today.js";

const now = new Date("2026-10-26T03:00:00Z"); // 한국 10/26 12:00

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

// 지금 할 것 등 오늘 칸의 규칙 시험은 test/today.test.ts (서버로 옮김, M1-7)
