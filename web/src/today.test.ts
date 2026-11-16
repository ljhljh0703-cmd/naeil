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

import { usageLine } from "./Usage.js";

describe("최근 7일 한 줄", () => {
  it("연 시각은 한국 시각, 0 인 칸은 뺌", () => {
    expect(
      usageLine({
        day: "2026-11-16",
        firstOpenedAt: "2026-11-16T00:30:00.000Z",
        authorChanges: 3,
        decisions: 1,
        aiChanges: 0,
        imports: 2,
      }),
    ).toBe("09:30 엶, 내가 3, 결정 1, 가져오기 2");
    expect(
      usageLine({
        day: "2026-11-15",
        firstOpenedAt: null,
        authorChanges: 0,
        decisions: 0,
        aiChanges: 4,
        imports: 0,
      }),
    ).toBe("안 엶, AI 4");
  });
});
