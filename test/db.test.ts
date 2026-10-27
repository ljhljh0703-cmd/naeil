import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { applied, migrateDownOne, migrateUp } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { Store } from "../src/db/store.js";
import { NotFound, VersionMismatch } from "../src/errors.js";

function freshDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrateUp(db);
  return db;
}

describe("표 구조 변경", () => {
  it("올리고 되돌리고 다시 올릴 수 있다", () => {
    const db = new Database(":memory:");
    expect(migrateUp(db)).toEqual([
      "001_init",
      "002_keys_idempotency_session",
      "003_entity_versions",
    ]);
    expect(migrateUp(db)).toEqual([]); // 두 번 돌려도 그대로
    expect(migrateDownOne(db)).toBe("003_entity_versions");
    expect(migrateDownOne(db)).toBe("002_keys_idempotency_session");
    expect(migrateDownOne(db)).toBe("001_init");
    expect(applied(db)).toEqual([]);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
      .all();
    expect(tables).toHaveLength(0);
    expect(migrateUp(db)).toEqual([
      "001_init",
      "002_keys_idempotency_session",
      "003_entity_versions",
    ]);
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
    seed(db, fileURLToPath(new URL("../examples/seed.json", import.meta.url)));
    const tasks = new Store(db).listTasks();
    expect(tasks).toHaveLength(3);
    expect(tasks.filter((t) => t.external_text === 1)).toHaveLength(1);
  });
});

describe("프로젝트·마일스톤 판 번호", () => {
  it("003은 기존 행과 연결을 보존하며 올리고 되돌리고 다시 올린다", () => {
    const db = freshDb();
    expect(migrateDownOne(db)).toBe("003_entity_versions");
    const columns = (table: string) =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    expect(columns("projects")).not.toContain("version");
    expect(columns("milestones")).not.toContain("version");
    const store = new Store(db);
    const p = store.createProject("author", "기존 프로젝트");
    const m = store.createMilestone("author", p, "기존 목표", "2026-11-02T09:00:00+09:00");
    const t = store.createTask("author", { projectId: p, milestoneId: m, title: "기존 할 일" });
    const before = {
      project: db.prepare("SELECT * FROM projects WHERE id = ?").get(p),
      milestone: db.prepare("SELECT * FROM milestones WHERE id = ?").get(m),
      task: store.getTask(t),
      changes: store.listChanges(),
    };
    expect(migrateUp(db)).toEqual(["003_entity_versions"]);
    expect(store.getProject(p)).toEqual({ ...(before.project as object), version: 1 });
    expect(store.getMilestone(m)).toEqual({ ...(before.milestone as object), version: 1 });
    db.prepare("UPDATE projects SET version = 7 WHERE id = ?").run(p);
    db.prepare("UPDATE milestones SET version = 9 WHERE id = ?").run(m);
    expect(migrateDownOne(db)).toBe("003_entity_versions");
    expect(db.prepare("SELECT * FROM projects WHERE id = ?").get(p)).toEqual(before.project);
    expect(db.prepare("SELECT * FROM milestones WHERE id = ?").get(m)).toEqual(before.milestone);
    expect(store.getTask(t)).toEqual(before.task);
    expect(store.listChanges()).toEqual(before.changes);
    expect(db.pragma("foreign_key_check")).toEqual([]);
    expect(migrateUp(db)).toEqual(["003_entity_versions"]);
    expect(store.getProject(p)?.version).toBe(1);
    expect(store.getMilestone(m)?.version).toBe(1);
    expect(store.getTask(t)).toEqual(before.task);
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });
});

describe("프로젝트·마일스톤 저장소", () => {
  let db: Database.Database;
  let store: Store;
  let p: string;
  const who = { actor: "codex", session: "test-session" };

  beforeEach(() => {
    db = freshDb();
    store = new Store(db, "me", () => new Date("2026-10-26T09:00:00+09:00"));
    p = store.createProject("author", "시험 프로젝트");
  });

  it("프로젝트 수정은 판 번호와 기록을 한 번 올리고 오래된 판은 거절한다", () => {
    const before = store.listChanges().length;
    store.updateProject(who, p, { name: "수정한 이름" }, 1);
    expect(store.getProject(p)).toMatchObject({ name: "수정한 이름", version: 2 });
    expect(store.listChanges()).toHaveLength(before + 1);
    expect(store.listChanges()[0]).toMatchObject({
      ...who,
      entity: "project",
      entity_id: p,
      action: "update",
    });
    expect(() => store.updateProject(who, p, { name: "오래된 수정" }, 1)).toThrow(VersionMismatch);
    expect(store.getProject(p)).toMatchObject({ name: "수정한 이름", version: 2 });
    expect(store.listChanges()).toHaveLength(before + 1);
  });

  it("프로젝트 휴지통은 하위 행과 연결을 그대로 두며 반복 삭제는 거절한다", () => {
    const m = store.createMilestone(who, p, "목표");
    const t = store.createTask(who, { projectId: p, milestoneId: m, title: "할 일" });
    const milestone = store.getMilestone(m);
    const task = store.getTask(t);
    const count = store.listChanges().length;
    store.trashProject(who, p);
    expect(store.getProject(p)).toBeUndefined();
    expect(store.getProject(p, { includeTrashed: true })).toMatchObject({
      version: 2,
      deleted_at: "2026-10-26T00:00:00.000Z",
    });
    expect(store.getMilestone(m)).toEqual(milestone);
    expect(store.getTask(t)).toEqual(task);
    expect(store.listChanges()).toHaveLength(count + 1);
    expect(() => store.trashProject(who, p)).toThrow(NotFound);
    expect(store.listChanges()).toHaveLength(count + 1);
  });

  it("없는·다른 작업 공간·휴지통 프로젝트 아래 생성과 목록은 404 오류다", () => {
    const other = new Store(db, "other");
    const foreign = other.createProject(who, "다른 공간");
    const trashed = store.createProject(who, "휴지통 프로젝트");
    store.trashProject(who, trashed);
    const count = store.listChanges().length;
    for (const id of ["missing", foreign, trashed]) {
      expect(() => store.createMilestone(who, id, "만들지 않음")).toThrow(NotFound);
      expect(() => store.listMilestones(id)).toThrow(NotFound);
    }
    expect(store.listChanges()).toHaveLength(count);
  });

  it("마감은 UTC로 저장하고 목록은 빠른 순·동률 고정·미정 뒤로 정렬한다", () => {
    const nil = store.createMilestone(who, p, "미정", null);
    const late = store.createMilestone(who, p, "늦음", "2026-11-02T09:00:00+09:00");
    const early1 = store.createMilestone(who, p, "먼저 1", "2026-11-01T09:00:00+09:00");
    const early2 = store.createMilestone(who, p, "먼저 2", "2026-11-01T00:00:00Z");
    const removed = store.createMilestone(who, p, "지움", "2026-10-28T00:00:00Z");
    store.trashMilestone(who, removed);
    const another = store.createProject(who, "별개 프로젝트");
    store.createMilestone(who, another, "별개 목표", "2026-10-27T00:00:00Z");
    expect(store.listMilestones(p).map((m) => m.id)).toEqual([
      ...[early1, early2].sort(),
      late,
      nil,
    ]);
    expect(store.getMilestone(early1)?.due_at).toBe("2026-11-01T00:00:00.000Z");
    expect(store.getMilestone(nil)?.due_at).toBeNull();
  });

  it("마일스톤 수정은 생략한 마감을 보존하고 null은 제거하며 오래된 판은 거절한다", () => {
    const m = store.createMilestone(who, p, "목표", "2026-11-01T00:00:00Z");
    store.updateMilestone(who, m, { name: "고친 목표" }, 1);
    expect(store.getMilestone(m)).toMatchObject({
      name: "고친 목표",
      due_at: "2026-11-01T00:00:00.000Z",
      version: 2,
    });
    store.updateMilestone(who, m, { dueAt: null }, 2);
    expect(store.getMilestone(m)).toMatchObject({ name: "고친 목표", due_at: null, version: 3 });
    const count = store.listChanges().length;
    expect(() => store.updateMilestone(who, m, { name: "늦은 수정" }, 2)).toThrow(VersionMismatch);
    expect(store.getMilestone(m)?.version).toBe(3);
    expect(store.listChanges()).toHaveLength(count);
    expect(store.listChanges()[0]).toMatchObject({
      ...who,
      entity: "milestone",
      entity_id: m,
      action: "update",
    });
  });

  it("마일스톤 휴지통은 연결된 할 일을 그대로 두고 재삭제를 거절한다", () => {
    const m = store.createMilestone(who, p, "목표");
    const t = store.createTask(who, { projectId: p, milestoneId: m, title: "할 일" });
    const task = store.getTask(t);
    store.trashMilestone(who, m);
    expect(store.getMilestone(m)).toBeUndefined();
    expect(store.getMilestone(m, { includeTrashed: true })?.version).toBe(2);
    expect(store.getTask(t)).toEqual(task);
    expect(() => store.trashMilestone(who, m)).toThrow(NotFound);
  });

  it("다른 작업 공간에서는 프로젝트·마일스톤을 읽거나 바꾸거나 지울 수 없다", () => {
    const other = new Store(db, "other");
    const m = store.createMilestone(who, p, "목표");
    const count = store.listChanges().length;
    expect(other.getProject(p)).toBeUndefined();
    expect(other.getMilestone(m)).toBeUndefined();
    for (const change of [
      () => other.updateProject(who, p, { name: "침범" }),
      () => other.trashProject(who, p),
      () => other.updateMilestone(who, m, { name: "침범" }),
      () => other.trashMilestone(who, m),
    ])
      expect(change).toThrow(NotFound);
    expect(store.listChanges()).toHaveLength(count);
  });

  it("기록 저장 실패 시 프로젝트·마일스톤 생성·수정·휴지통도 되돌린다", () => {
    const m = store.createMilestone(who, p, "목표");
    const snapshot = () => ({
      projects: db.prepare("SELECT * FROM projects ORDER BY id").all(),
      milestones: db.prepare("SELECT * FROM milestones ORDER BY id").all(),
      changes: db.prepare("SELECT * FROM change_log ORDER BY id").all(),
    });
    const before = snapshot();
    db.exec(
      "CREATE TRIGGER fail_change BEFORE INSERT ON change_log BEGIN SELECT RAISE(ABORT, 'test log failure'); END",
    );
    for (const change of [
      () => store.createProject(who, "롤백"),
      () => store.updateProject(who, p, { name: "롤백" }, 1),
      () => store.trashProject(who, p),
      () => store.createMilestone(who, p, "롤백"),
      () => store.updateMilestone(who, m, { name: "롤백" }, 1),
      () => store.trashMilestone(who, m),
    ]) {
      expect(change).toThrow("test log failure");
      expect(snapshot()).toEqual(before);
    }
  });
});
