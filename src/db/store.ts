// 할 일 저장소. 바꿀 때마다 변경 기록에 한 줄 남긴다.
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { BadInput, Duplicate, NotFound, RuleViolation, VersionMismatch } from "../errors.js";

export const STATUSES = ["todo", "doing", "done"] as const;
export const BLOCKED_REASONS = ["my_decision", "ai_working", "external", "tech"] as const;
export type Status = (typeof STATUSES)[number];
export type BlockedReason = (typeof BLOCKED_REASONS)[number];

// 누가 바꿨나. actor = 출입증이 정한 도구 이름, session = 세션 이름표(선택)
export type Who = string | { actor: string; session?: string | null };

export type Project = {
  id: string;
  workspace_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

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
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ChangeRow = {
  id: number;
  workspace_id: string;
  at: string;
  actor: string;
  session: string | null;
  entity: string;
  entity_id: string;
  action: string;
  details: string | null;
};

export type TaskFilter = {
  projectId?: string;
  milestoneId?: string;
  status?: Status;
  blockedReason?: BlockedReason;
  includeTrashed?: boolean;
  limit?: number;
  // 커서: 이 할 일 다음부터 (만든 시각, 번호 순)
  after?: { createdAt: string; id: string };
};

export type TaskPatch = {
  title?: string;
  status?: Status;
  dueAt?: string | null;
  milestoneId?: string | null;
};

type Clock = () => Date;

function norm(who: Who): { actor: string; session: string | null } {
  return typeof who === "string" ? { actor: who, session: null } : { session: null, ...who };
}

export class Store {
  constructor(
    private db: Database.Database,
    private workspace = "me",
    private clock: Clock = () => new Date(),
  ) {}

  private now(): string {
    return this.clock().toISOString(); // 항상 세계 표준시
  }

  private log(who: Who, entity: string, entityId: string, action: string, details?: unknown) {
    const { actor, session } = norm(who);
    this.db
      .prepare(
        "INSERT INTO change_log (workspace_id, at, actor, session, entity, entity_id, action, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        this.workspace,
        this.now(),
        actor,
        session,
        entity,
        entityId,
        action,
        details === undefined ? null : JSON.stringify(details),
      );
  }

  // ── 프로젝트 ──

  createProject(who: Who, name: string): string {
    const id = randomUUID();
    const t = this.now();
    this.db
      .prepare(
        "INSERT INTO projects (id, workspace_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, this.workspace, name, t, t);
    this.log(who, "project", id, "create", { name });
    return id;
  }

  getProject(id: string, opts: { includeTrashed?: boolean } = {}): Project | undefined {
    return this.db
      .prepare(
        `SELECT * FROM projects WHERE id = ? AND workspace_id = ? ${opts.includeTrashed ? "" : "AND deleted_at IS NULL"}`,
      )
      .get(id, this.workspace) as Project | undefined;
  }

  listProjects(opts: { includeTrashed?: boolean } = {}): Project[] {
    return this.db
      .prepare(
        `SELECT * FROM projects WHERE workspace_id = ? ${opts.includeTrashed ? "" : "AND deleted_at IS NULL"} ORDER BY created_at, id`,
      )
      .all(this.workspace) as Project[];
  }

  // ── 마일스톤 ──

  createMilestone(who: Who, projectId: string, name: string, dueAt?: string): string {
    const id = randomUUID();
    const t = this.now();
    this.db
      .prepare(
        "INSERT INTO milestones (id, workspace_id, project_id, name, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, this.workspace, projectId, name, dueAt ?? null, t, t);
    this.log(who, "milestone", id, "create", { name, due_at: dueAt ?? null });
    return id;
  }

  private milestoneInProject(milestoneId: string, projectId: string): boolean {
    return !!this.db
      .prepare(
        "SELECT 1 FROM milestones WHERE id = ? AND project_id = ? AND workspace_id = ? AND deleted_at IS NULL",
      )
      .get(milestoneId, projectId, this.workspace);
  }

  // ── 할 일 ──

  createTask(
    who: Who,
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
    if (!this.getProject(input.projectId))
      throw new BadInput("projectId 에 해당하는 프로젝트가 없음");
    if (input.milestoneId && !this.milestoneInProject(input.milestoneId, input.projectId)) {
      throw new BadInput("milestoneId 가 이 프로젝트의 마일스톤이 아님");
    }
    const id = randomUUID();
    const t = this.now();
    try {
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
    } catch (err) {
      if ((err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw new Duplicate(`이미 가져온 할 일: ${input.source} ${input.sourceRef}`);
      }
      throw err;
    }
    this.log(who, "task", id, "create", { title: input.title, source: input.source ?? "direct" });
    return id;
  }

  getTask(id: string, opts: { includeTrashed?: boolean } = {}): Task | undefined {
    return this.db
      .prepare(
        `SELECT * FROM tasks WHERE id = ? AND workspace_id = ? ${opts.includeTrashed ? "" : "AND deleted_at IS NULL"}`,
      )
      .get(id, this.workspace) as Task | undefined;
  }

  private mustTask(id: string, opts: { includeTrashed?: boolean } = {}): Task {
    const t = this.getTask(id, opts);
    if (!t) throw new NotFound(`할 일이 없음: ${id}`);
    return t;
  }

  listTasks(filter: TaskFilter = {}): Task[] {
    const where = ["workspace_id = ?"];
    const args: unknown[] = [this.workspace];
    if (!filter.includeTrashed) where.push("deleted_at IS NULL");
    if (filter.projectId) {
      where.push("project_id = ?");
      args.push(filter.projectId);
    }
    if (filter.milestoneId) {
      where.push("milestone_id = ?");
      args.push(filter.milestoneId);
    }
    if (filter.status) {
      where.push("status = ?");
      args.push(filter.status);
    }
    if (filter.blockedReason) {
      where.push("blocked_reason = ?");
      args.push(filter.blockedReason);
    }
    if (filter.after) {
      where.push("(created_at, id) > (?, ?)");
      args.push(filter.after.createdAt, filter.after.id);
    }
    let sql = `SELECT * FROM tasks WHERE ${where.join(" AND ")} ORDER BY created_at, id`;
    if (filter.limit) {
      sql += " LIMIT ?";
      args.push(filter.limit);
    }
    return this.db.prepare(sql).all(...args) as Task[];
  }

  // 판 번호를 올리며 고친다. expectedVersion 이 있으면 지금 판과 같을 때만 (덮어쓰기 막기).
  private bump(id: string, expectedVersion: number | undefined, set: string, args: unknown[]) {
    const res = this.db
      .prepare(
        `UPDATE tasks SET ${set}, version = version + 1, updated_at = ?
         WHERE id = ? AND workspace_id = ? ${expectedVersion === undefined ? "" : "AND version = ?"}`,
      )
      .run(
        ...args,
        this.now(),
        id,
        this.workspace,
        ...(expectedVersion === undefined ? [] : [expectedVersion]),
      );
    if (res.changes === 0) throw new VersionMismatch();
  }

  updateTask(who: Who, id: string, patch: TaskPatch, expectedVersion?: number): void {
    const before = this.mustTask(id);
    if (expectedVersion !== undefined && before.version !== expectedVersion) {
      throw new VersionMismatch();
    }
    if (patch.milestoneId && !this.milestoneInProject(patch.milestoneId, before.project_id)) {
      throw new BadInput("milestoneId 가 이 프로젝트의 마일스톤이 아님");
    }
    const sets: string[] = [];
    const args: unknown[] = [];
    const changed: Record<string, unknown> = {};
    if (patch.title !== undefined) {
      sets.push("title = ?");
      args.push(patch.title);
      changed.title = patch.title;
    }
    if (patch.dueAt !== undefined) {
      sets.push("due_at = ?");
      args.push(patch.dueAt);
      changed.due_at = patch.dueAt;
    }
    if (patch.milestoneId !== undefined) {
      sets.push("milestone_id = ?");
      args.push(patch.milestoneId);
      changed.milestone_id = patch.milestoneId;
    }
    if (patch.status !== undefined) {
      sets.push("status = ?");
      args.push(patch.status);
      if (patch.status === "done") sets.push("blocked_reason = NULL", "held_by = NULL");
    }
    if (sets.length === 0) return;
    this.db.transaction(() => {
      this.bump(id, expectedVersion, sets.join(", "), args);
      if (patch.status !== undefined && patch.status !== before.status) {
        this.log(who, "task", id, "status", { from: before.status, to: patch.status });
      }
      if (Object.keys(changed).length) this.log(who, "task", id, "update", changed);
    })();
  }

  setStatus(who: Who, id: string, status: Status): void {
    this.updateTask(who, id, { status });
  }

  block(who: Who, id: string, reason: BlockedReason, heldBy?: string): void {
    const before = this.mustTask(id);
    if (before.status === "done") {
      throw new RuleViolation("blocked-done", "끝난 일에는 멈춘 이유를 붙이지 않는다");
    }
    if (heldBy && reason !== "ai_working") {
      throw new RuleViolation("held-by-not-ai", "잡은 세션은 「AI가 하는 중」일 때만");
    }
    this.db.transaction(() => {
      this.bump(id, undefined, "blocked_reason = ?, held_by = ?", [reason, heldBy ?? null]);
      this.log(who, "task", id, "block", { reason, held_by: heldBy ?? null });
    })();
  }

  unblock(who: Who, id: string): void {
    this.mustTask(id);
    this.db.transaction(() => {
      this.bump(id, undefined, "blocked_reason = NULL, held_by = NULL", []);
      this.log(who, "task", id, "unblock");
    })();
  }

  // 휴지통으로. 목록에서 빠지지만 되살릴 수 있다.
  trash(who: Who, id: string): void {
    this.mustTask(id);
    this.db.transaction(() => {
      this.bump(id, undefined, "deleted_at = ?", [this.now()]);
      this.log(who, "task", id, "trash");
    })();
  }

  // 되살리기: 휴지통에서 꺼내거나, 끝난 일을 다시 연다.
  revive(who: Who, id: string): void {
    this.mustTask(id, { includeTrashed: true });
    this.db.transaction(() => {
      this.bump(
        id,
        undefined,
        "deleted_at = NULL, status = CASE WHEN status = 'done' THEN 'todo' ELSE status END",
        [],
      );
      this.log(who, "task", id, "revive");
    })();
  }

  // ── 변경 기록 ──

  listChanges(filter: { actor?: string; limit?: number; beforeId?: number } = {}): ChangeRow[] {
    const where = ["workspace_id = ?"];
    const args: unknown[] = [this.workspace];
    if (filter.actor) {
      where.push("actor = ?");
      args.push(filter.actor);
    }
    if (filter.beforeId !== undefined) {
      where.push("id < ?");
      args.push(filter.beforeId);
    }
    args.push(filter.limit ?? 20);
    return this.db
      .prepare(`SELECT * FROM change_log WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ?`)
      .all(...args) as ChangeRow[];
  }

  recentChanges(limit = 20): ChangeRow[] {
    return this.listChanges({ limit });
  }
}
