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
