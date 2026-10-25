// 할 일 저장소. 바꿀 때마다 변경 기록에 한 줄 남긴다.
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export const STATUSES = ["todo", "doing", "done"] as const;
export const BLOCKED_REASONS = ["my_decision", "ai_working", "external", "tech"] as const;
export type Status = (typeof STATUSES)[number];
export type BlockedReason = (typeof BLOCKED_REASONS)[number];

export type Task = {
  id: string;
  workspace_id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  status: Status;
  blocked_reason: BlockedReason | null;
  held_by: string | null;
  due_at: string | null;
  source: string;
  source_ref: string | null;
  external_text: 0 | 1;
  body: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type Clock = () => Date;

export class Store {
  constructor(
    private db: Database.Database,
    private workspace = "me",
    private clock: Clock = () => new Date(),
  ) {}

  private now(): string {
    return this.clock().toISOString(); // 항상 세계 표준시
  }

  private log(actor: string, entity: string, entityId: string, action: string, details?: unknown) {
    this.db
      .prepare(
        "INSERT INTO change_log (workspace_id, at, actor, entity, entity_id, action, details) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        this.workspace,
        this.now(),
        actor,
        entity,
        entityId,
        action,
        details === undefined ? null : JSON.stringify(details),
      );
  }

  createProject(actor: string, name: string): string {
    const id = randomUUID();
    const t = this.now();
    this.db
      .prepare(
        "INSERT INTO projects (id, workspace_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, this.workspace, name, t, t);
    this.log(actor, "project", id, "create", { name });
    return id;
  }

  createMilestone(actor: string, projectId: string, name: string, dueAt?: string): string {
    const id = randomUUID();
    const t = this.now();
    this.db
      .prepare(
        "INSERT INTO milestones (id, workspace_id, project_id, name, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, this.workspace, projectId, name, dueAt ?? null, t, t);
    this.log(actor, "milestone", id, "create", { name, due_at: dueAt ?? null });
    return id;
  }

  createTask(
    actor: string,
    input: {
      projectId: string;
      title: string;
      milestoneId?: string;
      dueAt?: string;
      source?: string;
      sourceRef?: string;
      externalText?: boolean;
      body?: string;
    },
  ): string {
    const id = randomUUID();
    const t = this.now();
    this.db
      .prepare(
        `INSERT INTO tasks (id, workspace_id, project_id, milestone_id, title, due_at, source, source_ref, external_text, body, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        this.workspace,
        input.projectId,
        input.milestoneId ?? null,
        input.title,
        input.dueAt ?? null,
        input.source ?? "direct",
        input.sourceRef ?? null,
        input.externalText ? 1 : 0,
        input.body ?? null,
        t,
        t,
      );
    this.log(actor, "task", id, "create", { title: input.title, source: input.source ?? "direct" });
    return id;
  }

  getTask(id: string): Task | undefined {
    return this.db
      .prepare("SELECT * FROM tasks WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL")
      .get(id, this.workspace) as Task | undefined;
  }

  listTasks(): Task[] {
    return this.db
      .prepare(
        "SELECT * FROM tasks WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at",
      )
      .all(this.workspace) as Task[];
  }

  setStatus(actor: string, id: string, status: Status): void {
    const before = this.getTask(id);
    if (!before) throw new Error(`할 일이 없음: ${id}`);
    // 끝내면 멈춘 이유·잡은 세션은 비운다
    const clear = status === "done";
    this.db
      .prepare(
        `UPDATE tasks SET status = ?, updated_at = ?,
           blocked_reason = CASE WHEN ? THEN NULL ELSE blocked_reason END,
           held_by = CASE WHEN ? THEN NULL ELSE held_by END
         WHERE id = ? AND workspace_id = ?`,
      )
      .run(status, this.now(), clear ? 1 : 0, clear ? 1 : 0, id, this.workspace);
    this.log(actor, "task", id, "status", { from: before.status, to: status });
  }

  block(actor: string, id: string, reason: BlockedReason, heldBy?: string): void {
    const before = this.getTask(id);
    if (!before) throw new Error(`할 일이 없음: ${id}`);
    if (before.status === "done") throw new Error("끝난 일에는 멈춘 이유를 붙이지 않는다");
    if (heldBy && reason !== "ai_working") throw new Error("잡은 세션은 「AI가 하는 중」일 때만");
    this.db
      .prepare(
        "UPDATE tasks SET blocked_reason = ?, held_by = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(reason, heldBy ?? null, this.now(), id, this.workspace);
    this.log(actor, "task", id, "block", { reason, held_by: heldBy ?? null });
  }

  unblock(actor: string, id: string): void {
    this.db
      .prepare(
        "UPDATE tasks SET blocked_reason = NULL, held_by = NULL, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(this.now(), id, this.workspace);
    this.log(actor, "task", id, "unblock");
  }

  // 휴지통으로. 목록에서 빠지지만 되살릴 수 있다.
  trash(actor: string, id: string): void {
    this.db
      .prepare("UPDATE tasks SET deleted_at = ? WHERE id = ? AND workspace_id = ?")
      .run(this.now(), id, this.workspace);
    this.log(actor, "task", id, "trash");
  }

  // 되살리기: 휴지통에서 꺼내거나, 끝난 일을 다시 연다.
  revive(actor: string, id: string): void {
    this.db
      .prepare(
        "UPDATE tasks SET deleted_at = NULL, status = CASE WHEN status = 'done' THEN 'todo' ELSE status END, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(this.now(), id, this.workspace);
    this.log(actor, "task", id, "revive");
  }

  recentChanges(limit = 20) {
    return this.db
      .prepare("SELECT * FROM change_log WHERE workspace_id = ? ORDER BY id DESC LIMIT ?")
      .all(this.workspace, limit);
  }
}
