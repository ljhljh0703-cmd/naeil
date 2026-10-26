import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { applied, migrateDownOne, migrateUp } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { Store } from "../src/db/store.js";

function freshDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrateUp(db);
  return db;
}

describe("표 구조 변경", () => {
  it("올리고 되돌리고 다시 올릴 수 있다", () => {
    const db = new Database(":memory:");
    expect(migrateUp(db)).toEqual(["001_init", "002_keys_idempotency_session"]);
    expect(migrateUp(db)).toEqual([]); // 두 번 돌려도 그대로
    expect(migrateDownOne(db)).toBe("002_keys_idempotency_session");
    expect(migrateDownOne(db)).toBe("001_init");
    expect(applied(db)).toEqual([]);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
      .all();
    expect(tables).toHaveLength(0);
    expect(migrateUp(db)).toEqual(["001_init", "002_keys_idempotency_session"]);
  });

  it("데이터베이스가 직접 막는다: 끝난 일에 멈춘 이유", () => {
    const db = freshDb();
    const t = "2026-10-25T00:00:00.000Z";
    db.prepare(
      "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p', 'p', ?, ?)",
    ).run(t, t);
    expect(() =>
      db
        .prepare(
          "INSERT INTO tasks (id, project_id, title, status, blocked_reason, created_at, updated_at) VALUES ('t', 'p', 'x', 'done', 'tech', ?, ?)",
        )
        .run(t, t),
    ).toThrow();
  });

  it("모든 표에 작업 공간 칸이 있다", () => {
    const db = freshDb();
    for (const t of ["projects", "milestones", "tasks", "change_log"]) {
      const cols = db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[];
      expect(cols.map((c) => c.name)).toContain("workspace_id");
    }
  });
});

describe("할 일", () => {
  let db: Database.Database;
  let store: Store;
  let projectId: string;

  beforeEach(() => {
    db = freshDb();
    store = new Store(db, "me", () => new Date("2026-10-25T05:00:00+09:00"));
    projectId = store.createProject("author", "내일은내일");
  });

  it("시간은 세계 표준시로 저장한다", () => {
    const id = store.createTask("author", { projectId, title: "저장소 만들기" });
    expect(store.getTask(id)?.created_at).toBe("2026-10-24T20:00:00.000Z");
  });

  it("상태를 바꾸면 변경 기록에 누가·무엇을이 남는다", () => {
    const id = store.createTask("author", { projectId, title: "서버 띄우기" });
    store.setStatus("claude", id, "doing");
    const last = store.recentChanges(1)[0] as { actor: string; action: string; details: string };
    expect(last.actor).toBe("claude");
    expect(last.action).toBe("status");
    expect(JSON.parse(last.details)).toEqual({ from: "todo", to: "doing" });
  });

  it("멈춘 이유는 멈췄을 때만, 끝내면 지워진다", () => {
    const id = store.createTask("author", { projectId, title: "토큰 만들기" });
    store.block("claude", id, "my_decision");
    expect(store.getTask(id)?.blocked_reason).toBe("my_decision");
    store.setStatus("author", id, "done");
    expect(store.getTask(id)?.blocked_reason).toBeNull();
    expect(() => store.block("claude", id, "tech")).toThrow();
  });

  it("잡은 세션은 「AI가 하는 중」일 때만 붙는다", () => {
    const id = store.createTask("author", { projectId, title: "1단계 만들기" });
    expect(() => store.block("claude", id, "external", "codex")).toThrow();
    store.block("claude", id, "ai_working", "codex");
    expect(store.getTask(id)?.held_by).toBe("codex");
  });

  it("같은 이슈를 두 번 가져오면 막힌다", () => {
    const input = {
      projectId,
      title: "제보",
      source: "github",
      sourceRef: "a/b#1",
      externalText: true,
    };
    store.createTask("import", input);
    expect(() => store.createTask("import", input)).toThrow();
  });

  it("휴지통에 넣으면 목록에서 빠지고, 되살리면 돌아온다", () => {
    const id = store.createTask("author", { projectId, title: "지울 것" });
    store.trash("author", id);
    expect(store.listTasks().map((t) => t.id)).not.toContain(id);
    store.revive("author", id);
    expect(store.listTasks().map((t) => t.id)).toContain(id);
  });

  it("끝난 일을 되살리면 다시 할 일이 된다", () => {
    const id = store.createTask("author", { projectId, title: "다시 할 것" });
    store.setStatus("author", id, "done");
    store.revive("author", id);
    expect(store.getTask(id)?.status).toBe("todo");
  });

  it("다른 작업 공간의 할 일은 안 보인다", () => {
    store.createTask("author", { projectId, title: "내 것" });
    const other = new Store(db, "someone");
    expect(other.listTasks()).toHaveLength(0);
  });
});

describe("예시 데이터", () => {
  it("예시 파일이 들어가고 바깥 글 표시가 붙는다", () => {
    const db = freshDb();
    seed(db, new URL("../examples/seed.json", import.meta.url).pathname);
    const tasks = new Store(db).listTasks();
    expect(tasks).toHaveLength(3);
    expect(tasks.filter((t) => t.external_text === 1)).toHaveLength(1);
  });
});
