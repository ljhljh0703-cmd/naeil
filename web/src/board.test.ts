import { describe, expect, it } from "vitest";
import {
  type BoardMilestone,
  type BoardTask,
  groupBoard,
  progressOf,
  sortForBoard,
} from "./board.js";

const ms = (id: string, dueAt: string | null, projectId = "p1"): BoardMilestone => ({
  id,
  projectId,
  name: id,
  dueAt,
});
const t = (
  id: string,
  status: BoardTask["status"],
  milestoneId: string | null,
  over: Partial<BoardTask> = {},
): BoardTask => ({
  id,
  projectId: "p1",
  milestoneId,
  status,
  ...over,
});

describe("진행률", () => {
  it("끝은 1, 하는 중은 절반, 휴지통은 뺀다", () => {
    const p = progressOf([
      t("a", "done", null),
      t("b", "doing", null),
      t("c", "todo", null),
      t("d", "done", null, { deletedAt: "2026-10-26T00:00:00Z" }),
    ]);
    expect(p).toEqual({ total: 3, done: 1, doing: 1, percent: 50 });
  });

  it("할 일이 없으면 0%", () => {
    expect(progressOf([]).percent).toBe(0);
  });
});

describe("보드 묶기", () => {
  const milestones = [
    ms("날짜없음", null),
    ms("나중", "2026-12-01T00:00:00Z"),
    ms("먼저", "2026-11-01T00:00:00Z"),
    ms("다른프로젝트", "2026-10-01T00:00:00Z", "p2"),
  ];

  it("목표 날짜 순, 날짜 없는 건 뒤, 다른 프로젝트는 빠짐", () => {
    const g = groupBoard("p1", milestones, []);
    expect(g.map((x) => x.milestone?.id ?? "없음")).toEqual(["먼저", "나중", "날짜없음"]);
  });

  it("다음 = 아직 다 안 끝난 첫 마일스톤 하나만", () => {
    const g = groupBoard("p1", milestones, [t("1", "done", "먼저"), t("2", "todo", "나중")]);
    expect(g.filter((x) => x.next).map((x) => x.milestone?.id)).toEqual(["나중"]);
  });

  it("휴지통에 간 마일스톤을 가리키는 할 일은 「마일스톤 없음」으로", () => {
    const g = groupBoard(
      "p1",
      [ms("먼저", null)],
      [t("1", "todo", "사라진"), t("2", "todo", null)],
    );
    const loose = g.find((x) => x.milestone === null);
    expect(loose?.tasks.map((x) => x.id)).toEqual(["1", "2"]);
  });

  it("마일스톤이 있고 남는 할 일이 없으면 「마일스톤 없음」 칸을 안 만든다", () => {
    const g = groupBoard("p1", [ms("먼저", null)], [t("1", "todo", "먼저")]);
    expect(g.some((x) => x.milestone === null)).toBe(false);
  });

  it("하던 중 → 할 일 → 끝 순서", () => {
    const sorted = sortForBoard([
      t("a", "done", null),
      t("b", "todo", null),
      t("c", "doing", null),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });
});
