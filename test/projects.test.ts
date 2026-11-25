// 프로젝트 출처 이름표(011), 합치기, 사람이 끝낼 때 열린 질문 처리
import type Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb } from "../src/db/connection.js";
import { Store } from "../src/db/store.js";
import { runImport } from "../src/importer.js";

let db: Database.Database;
let s: Store;
const me = { actor: "author", session: null, kind: "human" as const };
const ai = { actor: "claude", session: null, kind: "ai" as const };
const projects = () => s.listProjects().map((p) => p.name);

beforeEach(() => {
  db = openDb(":memory:");
  s = new Store(db);
});

const issue = (n: number) => ({
  number: n,
  title: `이슈 ${n}`,
  state: "open",
  html_url: `https://github.com/o/r/issues/${n}`,
  body: "",
});
const fakeFetch = async (url: string) => ({
  ok: true,
  status: 200,
  json: async () => (url.includes("state=open") ? [issue(1)] : []),
});
const deps = { fetch: fakeFetch, now: () => new Date("2026-11-25T03:00:00Z") };

describe("가져오기는 프로젝트를 출처로 찾는다", () => {
  it("이름을 바꿔도 다음 가져오기 때 옛 이름 프로젝트가 새로 생기지 않는다", async () => {
    const config = { sources: [{ type: "github" as const, repo: "o/r" }] };
    await runImport(s, config, deps);
    expect(projects()).toEqual(["o/r"]);
    s.updateProject(me, s.listProjects()[0]?.id as string, { name: "젤리 패닉" });
    await runImport(s, config, deps);
    expect(projects()).toEqual(["젤리 패닉"]);
  });

  it("이미 있던 프로젝트(출처 표 전)는 이름으로 찾아 출처를 붙인다", () => {
    const old = s.createProject(me, "o/r");
    expect(s.ensureProject(me, "o/r", "github:o/r")).toBe(old);
    s.updateProject(me, old, { name: "새 이름" });
    expect(s.ensureProject(me, "o/r", "github:o/r")).toBe(old);
  });
});

describe("프로젝트 합치기", () => {
  it("할 일, 마일스톤, 출처를 옮기고 빈 쪽은 휴지통에", () => {
    const a = s.ensureProject(me, "ljh/hwigi", "github:ljh/hwigi");
    const b = s.createProject(me, "회귀탑 리메이크");
    const m = s.createMilestone(me, a, "M1");
    s.createTask(me, { projectId: a, milestoneId: m, title: "하나" });
    const r = s.mergeProjects(me, a, b);
    expect(r).toEqual({ milestones: 1, tasks: 1 });
    expect(projects()).toEqual(["회귀탑 리메이크"]);
    expect(s.ensureProject(me, "ljh/hwigi", "github:ljh/hwigi")).toBe(b);
    expect(() => s.mergeProjects(me, b, b)).toThrow();
  });

  it("합친 기록이 저장되지 않으면 아무것도 옮기지 않는다", () => {
    const a = s.ensureProject(me, "ljh/hwigi", "github:ljh/hwigi");
    const b = s.createProject(me, "회귀탑 리메이크");
    s.createTask(me, { projectId: a, title: "하나" });
    db.exec(`CREATE TRIGGER fail_merge BEFORE INSERT ON change_log
             WHEN NEW.action = 'merge'
             BEGIN SELECT RAISE(ABORT, '기록 저장 실패 주입'); END`);
    expect(() => s.mergeProjects(me, a, b)).toThrow();
    expect(projects().sort()).toEqual(["ljh/hwigi", "회귀탑 리메이크"]);
    expect(s.ensureProject(me, "x", "github:ljh/hwigi")).toBe(a);
    const n = (
      db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE project_id = ?").get(a) as { n: number }
    ).n;
    expect(n).toBe(1);
  });
});

describe("사람이 끝낼 때 열린 질문", () => {
  const ext = () => {
    const p = s.createProject(me, "p");
    return s.createTask(me, { projectId: p, title: "외부", source: "github", sourceRef: "o/r#1" });
  };

  it("사람 확인 질문이 열려 있으면 「완료」로 답한 것으로 보고 끝낸다", () => {
    const id = ext();
    s.updateTask(ai, id, { status: "done" });
    expect(s.getTask(id)?.status).not.toBe("done");
    s.updateTask(me, id, { status: "done" });
    const t = s.getTask(id);
    expect(t?.status).toBe("done");
    expect(t?.blocked_reason).toBeNull();
    expect(s.listDecisions({ open: true })).toHaveLength(0);
  });

  it("다른 질문이 열려 있으면 거절해 질문이 열린 채 남지 않게 한다", () => {
    const id = ext();
    s.askDecision(ai, id, { question: "어느 쪽?", options: ["가", "나"] });
    expect(() => s.updateTask(me, id, { status: "done" })).toThrow(/질문/);
    expect(s.getTask(id)?.status).toBe("todo");
  });
});
