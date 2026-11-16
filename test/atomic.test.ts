// S1 저장 경계: 할 일과 「누가 만들었나」 기록은 함께 저장되거나 함께 취소된다.
// 기록 저장에 일부러 실패를 넣어(데이터베이스 트리거) 할 일만 남는 상태가 없는지 본다.
import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createKey } from "../src/auth.js";
import { openDb } from "../src/db/connection.js";
import { Store } from "../src/db/store.js";

let db: Database.Database;
let app: FastifyInstance;
let key: string;

const count = (table: string, where = "1=1") =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number }).n;

// 할 일 생성 기록만 실패시킨다. 프로젝트 기록 등 다른 기록은 그대로 둔다.
const breakTaskLog = () =>
  db.exec(`CREATE TRIGGER fail_task_log BEFORE INSERT ON change_log
           WHEN NEW.entity = 'task' AND NEW.action = 'create'
           BEGIN SELECT RAISE(ABORT, '기록 저장 실패 주입'); END`);

beforeEach(() => {
  db = openDb(":memory:");
  app = buildApp({ db });
  key = createKey(db, "author");
});

async function newProject() {
  const res = await app.inject({
    method: "POST",
    url: "/v1/projects",
    headers: { authorization: `Bearer ${key}` },
    payload: { name: "시험 프로젝트" },
  });
  return res.json().id as string;
}

describe("할 일 만들기: 할 일과 기록은 한 묶음", () => {
  it("대조: 실패를 넣지 않으면 할 일 1개, 기록 1줄", async () => {
    const projectId = await newProject();
    new Store(db).createTask("author", { projectId, title: "정상" });
    expect(count("tasks")).toBe(1);
    expect(count("change_log", "entity='task' AND action='create'")).toBe(1);
  });

  it("저장소 직접 호출: 기록이 실패하면 할 일도 남지 않는다", async () => {
    const projectId = await newProject();
    breakTaskLog();
    expect(() => new Store(db).createTask("author", { projectId, title: "반쪽" })).toThrow();
    expect(count("tasks")).toBe(0);
  });

  it("주소 호출, 재시도 열쇠 없이: 실패로 답하고 할 일이 남지 않는다", async () => {
    const projectId = await newProject();
    breakTaskLog();
    const res = await app.inject({
      method: "POST",
      url: "/v1/tasks",
      headers: { authorization: `Bearer ${key}` },
      payload: { projectId, title: "반쪽" },
    });
    expect(res.statusCode).toBe(500);
    expect(count("tasks")).toBe(0);
  });

  it("주소 호출, 재시도 열쇠 있이: 실패로 답하고 할 일도 재시도 응답도 남지 않는다", async () => {
    const projectId = await newProject();
    breakTaskLog();
    const res = await app.inject({
      method: "POST",
      url: "/v1/tasks",
      headers: { authorization: `Bearer ${key}`, "idempotency-key": "s1-atomic-1" },
      payload: { projectId, title: "반쪽" },
    });
    expect(res.statusCode).toBe(500);
    expect(count("tasks")).toBe(0);
    expect(count("idempotency_keys")).toBe(0);
  });
});

// M1-2: 프로젝트 휴지통과 되살리기는 프로젝트, 마일스톤, 할 일, 기록 네 곳을 한 번에 바꾼다.
// 기록이 실패하면 아무것도 바뀌지 않아야 한다 (안의 할 일만 휴지통에 들어간 반쪽 상태가 없게).
describe("프로젝트 휴지통과 되살리기: 네 곳이 한 묶음", () => {
  const breakProjectLog = (action: "trash" | "revive") =>
    db.exec(`CREATE TRIGGER fail_project_log BEFORE INSERT ON change_log
             WHEN NEW.entity = 'project' AND NEW.action = '${action}'
             BEGIN SELECT RAISE(ABORT, '기록 저장 실패 주입'); END`);
  const setup = async () => {
    const projectId = await newProject();
    const s = new Store(db);
    const m = s.createMilestone("author", projectId, "목표");
    s.createTask("author", { projectId, milestoneId: m, title: "할 일" });
    return { s, projectId };
  };

  it("대조: 실패를 넣지 않으면 넣고 되살리기가 모두 됨", async () => {
    const { s, projectId } = await setup();
    s.trashProject("author", projectId);
    expect(count("tasks", "deleted_at IS NOT NULL")).toBe(1);
    s.reviveProject("author", projectId);
    expect(count("tasks", "deleted_at IS NULL")).toBe(1);
  });

  it("휴지통 기록이 실패하면 프로젝트도 안의 것도 그대로 살아 있음", async () => {
    const { s, projectId } = await setup();
    breakProjectLog("trash");
    expect(() => s.trashProject("author", projectId)).toThrow();
    expect(count("projects", "deleted_at IS NULL")).toBe(1);
    expect(count("milestones", "deleted_at IS NULL AND trashed_with IS NULL")).toBe(1);
    expect(count("tasks", "deleted_at IS NULL AND trashed_with IS NULL")).toBe(1);
  });

  it("되살리기 기록이 실패하면 프로젝트도 안의 것도 휴지통에 그대로", async () => {
    const { s, projectId } = await setup();
    s.trashProject("author", projectId);
    breakProjectLog("revive");
    expect(() => s.reviveProject("author", projectId)).toThrow();
    expect(count("projects", "deleted_at IS NOT NULL")).toBe(1);
    expect(count("milestones", `trashed_with = '${projectId}'`)).toBe(1);
    expect(count("tasks", `trashed_with = '${projectId}'`)).toBe(1);
  });
});
