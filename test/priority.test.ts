// 우선순위 (0.8.0): 지금 할 것은 하는 중 다음으로 높음 → 보통 → 낮음. 마이그레이션 012 는 끝난 일에 열린 질문을 닫음
import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createKey } from "../src/auth.js";
import { openDb } from "../src/db/connection.js";
import { migrateDownOne, migrateUp } from "../src/db/migrate.js";
import { Store } from "../src/db/store.js";
import { pickNow } from "../src/today.js";

let db: Database.Database;
let s: Store;
const me = { actor: "author", session: null, kind: "human" as const };

beforeEach(() => {
  db = openDb(":memory:");
  s = new Store(db);
});

describe("우선순위와 지금 할 것", () => {
  it("높음이 마감 있는 보통보다 먼저, 낮음은 맨 뒤, 하는 중은 그대로 맨 앞", () => {
    const p = s.createProject(me, "p");
    const due = s.createTask(me, {
      projectId: p,
      title: "마감 있는 보통",
      dueAt: "2026-11-26T00:00:00Z",
    });
    const low = s.createTask(me, { projectId: p, title: "낮음" });
    const high = s.createTask(me, { projectId: p, title: "높음" });
    s.updateTask(me, low, { priority: "low" });
    s.updateTask(me, high, { priority: "high" });
    expect(pickNow(s.listTasks())?.id).toBe(high);
    s.updateTask(me, high, { priority: "normal" });
    expect(pickNow(s.listTasks())?.id).toBe(due);
    s.updateTask(me, due, { status: "done" });
    s.updateTask(me, high, { status: "done" });
    expect(pickNow(s.listTasks())?.id).toBe(low);
    const doing = s.createTask(me, { projectId: p, title: "하는 중" });
    s.updateTask(me, doing, { status: "doing", priority: "low" });
    expect(pickNow(s.listTasks())?.id).toBe(doing);
  });

  it("API: 바꾸고 읽기, 다른 값은 거절", async () => {
    const app: FastifyInstance = buildApp({ db });
    const key = createKey(db, "author");
    const h = { authorization: `Bearer ${key}` };
    const p = s.createProject(me, "p");
    const id = s.createTask(me, { projectId: p, title: "일" });
    const get = await app.inject({ method: "GET", url: `/v1/tasks/${id}`, headers: h });
    expect(get.json().priority).toBe("normal");
    const ok = await app.inject({
      method: "PATCH",
      url: `/v1/tasks/${id}`,
      headers: h,
      payload: { priority: "high" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().priority).toBe("high");
    const bad = await app.inject({
      method: "PATCH",
      url: `/v1/tasks/${id}`,
      headers: h,
      payload: { priority: "urgent" },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe("마이그레이션 012", () => {
  it("끝난 할 일에 열린 질문만 닫고, 열린 할 일의 질문은 그대로", () => {
    expect(migrateDownOne(db)).toBe("012_priority_close_stale");
    const at = "2026-11-20T00:00:00.000Z";
    db.prepare(
      "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p', 'p', ?, ?)",
    ).run(at, at);
    for (const [id, status] of [
      ["done1", "done"],
      ["open1", "todo"],
    ]) {
      db.prepare(
        "INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES (?, 'p', ?, ?, ?, ?)",
      ).run(id, id, status, at, at);
      db.prepare(
        "INSERT INTO decisions (id, workspace_id, task_id, question, options, asked_by, asked_at) VALUES (?, 'me', ?, '질문', '[]', 'import', ?)",
      ).run(`d-${id}`, id, at);
    }
    expect(migrateUp(db)).toEqual(["012_priority_close_stale"]);
    const d = (id: string) =>
      db.prepare("SELECT answer, answered_at FROM decisions WHERE id = ?").get(id) as {
        answer: string | null;
        answered_at: string | null;
      };
    expect(d("d-done1").answer).toBe("닫힘");
    expect(d("d-open1").answered_at).toBeNull();
  });
});
