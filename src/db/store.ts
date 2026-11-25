// 할 일 저장소. 바꿀 때마다 변경 기록에 한 줄 남긴다.
import type Database from "better-sqlite3";
// 노드 전용 꾸러미를 들이지 않는다 (브라우저 시연판이 이 파일을 그대로 씀). 아이디는 전역 crypto 로
import {
  BadInput,
  Duplicate,
  HoldConflict,
  NotFound,
  RuleViolation,
  VersionMismatch,
} from "../errors.js";

export const STATUSES = ["todo", "doing", "done"] as const;
export const BLOCKED_REASONS = ["my_decision", "ai_working", "external", "tech"] as const;
export type Status = (typeof STATUSES)[number];
export type BlockedReason = (typeof BLOCKED_REASONS)[number];

// 누가 바꿨나. actor = API 키가 정한 도구 이름, session = 세션 이름표(선택)
export type ActorKind = "human" | "ai" | "ci";
export type Who =
  | string
  | { actor: string; session?: string | null; kind?: ActorKind | null; hold?: string | null };

export type Project = {
  id: string;
  workspace_id: string;
  name: string;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ProjectPatch = { name?: string };

export type Milestone = {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  due_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // 프로젝트와 같이 휴지통에 들어갔으면 그 프로젝트 번호 (004)
  trashed_with?: string | null;
  // 이 마일스톤이 끝났다고 볼 기준 (007, 인수인계 문서의 「목표」)
  done_when?: string | null;
};

export type MilestonePatch = { name?: string; dueAt?: string | null; doneWhen?: string | null };

export type Task = {
  id: string;
  workspace_id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  status: Status;
  blocked_reason: BlockedReason | null;
  held_by: string | null;
  hold_id: string | null; // 잡은 세션만 아는 번호 (M2-2). 응답에 내보내지 않음
  hold_expires_at: string | null;
  due_at: string | null;
  source: string;
  source_ref: string | null;
  external_text: 0 | 1;
  body: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  trashed_with?: string | null;
  // 006: 작가 담당(author)인가 AI 담당(ai)인가, 가져온 일의 원문 주소
  owner?: Owner;
  source_url?: string | null;
  source_seen?: string | null;
  // 어디까지 했나 한 줄 (007)
  progress_note?: string | null;
};

export type Decision = {
  id: string;
  workspace_id: string;
  task_id: string;
  question: string;
  options: string; // JSON
  recommended: string | null;
  basis: string | null;
  asked_by: string;
  asked_at: string;
  answer: string | null;
  note: string | null;
  answered_by: string | null;
  answered_at: string | null;
  kind: string | null; // done_check = AI 가 끝냈다고 보고한 외부 입력 할 일의 확인 (M2-1)
};
// AI 가 외부 입력 할 일을 끝냈다고 보고할 때 작가에게 묻는 질문 (M2-1). 첫 선택지를 고르면 완료
export const DONE_CHECK = {
  question: "AI 가 끝냈다고 보고함. 실제로 문제없는지 확인했나요?",
  options: ["완료", "다시 하기"],
  basis: null,
};
export type DecisionAsk = {
  question: string;
  options?: string[];
  recommended?: string | null;
  basis?: string | null;
};

// 기능 스위치 (M1-4). 처음에는 모두 켜짐 (작가 결정 2026-11-13 「셋 다 켜짐」).
// 스위치는 화면만 숨긴다. 경계 규칙(사람 확인 대기, 검증됨은 전용 API 키만)은 스위치와 무관하게 늘 적용
export const SWITCHES = {
  handoff: "인수인계 문서",
} as const;
export type SwitchName = keyof typeof SWITCHES;
export type Setting = {
  name: SwitchName;
  label: string;
  enabled: boolean;
  reason: string | null;
  changedBy: string | null;
  changedKind: string | null;
  changedAt: string | null;
};

export type Owner = "author" | "ai";

export type UsageDay = {
  day: string;
  firstOpenedAt: string | null;
  authorChanges: number;
  decisions: number;
  aiChanges: number;
  imports: number;
};

// 가져올 일 하나 (M1-3). 출처 + 출처 번호가 같으면 같은 일로 보고 새로 넣지 않고 고친다
export type ImportItem = {
  ref: string;
  title: string;
  state: "open" | "done";
  owner: Owner;
  decision?: boolean; // 작가가 정할 일이면 「내 결정 대기」로, 결정함에 질문을 남김
  options?: string[];
  recommended?: string | null;
  basis?: string | null;
  dueAt?: string | null;
  body?: string | null;
  url?: string | null;
  milestone?: string | null; // 원장의 「마일스톤」 칸. 없으면 만들고, 있으면 그 마일스톤에 넣음
};
export type ImportResult = {
  created: number;
  updated: number;
  closed: number;
  reopened: number;
  same: number;
  skipped: number; // 작가가 휴지통에 넣은 것은 다시 꺼내지 않음
};

export type ChangeRow = {
  id: number;
  workspace_id: string;
  at: string;
  actor: string;
  session: string | null;
  actor_kind: ActorKind | null;
  entity: string;
  entity_id: string;
  action: string;
  details: string | null;
};

export type ChangeFilter = {
  actor?: string;
  actorKind?: ActorKind;
  entity?: "project" | "milestone" | "task";
  entityId?: string;
  since?: string; // 한국 날짜 YYYY-MM-DD (그날 0시부터)
  until?: string; // 한국 날짜 YYYY-MM-DD (그날 끝까지)
  limit?: number;
  beforeId?: number;
};

// 한국 날짜의 0시를 세계 표준시로 (days 만큼 뒤 날짜)
export function kstDayStart(day: string, days = 0): string {
  const t = Date.parse(`${day}T00:00:00+09:00`);
  if (Number.isNaN(t)) throw new BadInput(`날짜는 YYYY-MM-DD 로: ${day}`);
  return new Date(t + days * 86_400_000).toISOString();
}

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
  owner?: Owner;
  progressNote?: string | null;
};

type Clock = () => Date;

// 시각은 어떤 모양으로 와도 세계 표준시 한 가지 모양으로 저장한다 (+09:00, 공백 구분 등)
const utc = (v: string | null | undefined) => {
  if (v == null) return null;
  const date = new Date(v);
  // 런타임 변환 실패와 UTC 변환 후 응답 명세의 네 자리 연도를 벗어나는 값은 입력 오류다.
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 0 ||
    date.getUTCFullYear() > 9999
  ) {
    throw new BadInput("dueAt을 저장 가능한 시각으로 보내세요 (예: 2026-11-01T09:00:00+09:00)");
  }
  return date.toISOString();
};

function norm(who: Who): {
  actor: string;
  session: string | null;
  kind: ActorKind | null;
  hold: string | null;
} {
  return typeof who === "string"
    ? { actor: who, session: null, kind: null, hold: null }
    : {
        actor: who.actor,
        session: who.session ?? null,
        kind: who.kind ?? null,
        hold: who.hold ?? null,
      };
}

// 잡기가 끝날 때(놓기, 완료, 휴지통, 질문, 멈춤 풀기) 같이 지우는 칸 (M2-2)
const CLEAR_HOLD = "held_by = NULL, hold_id = NULL, hold_expires_at = NULL";
// 잡기는 이만큼 지나면 저절로 끝난다. 잡은 세션이 그 할 일을 고칠 때마다 다시 늘어난다
export const HOLD_MS = 2 * 60 * 60 * 1000;

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
    const { actor, session, kind } = norm(who);
    this.db
      .prepare(
        "INSERT INTO change_log (workspace_id, at, actor, session, actor_kind, entity, entity_id, action, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        this.workspace,
        this.now(),
        actor,
        session,
        kind,
        entity,
        entityId,
        action,
        details === undefined ? null : JSON.stringify(details),
      );
  }

  // ── 프로젝트 ──

  createProject(who: Who, name: string): string {
    const id = crypto.randomUUID();
    const t = this.now();
    this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO projects (id, workspace_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(id, this.workspace, name, t, t);
      this.log(who, "project", id, "create", { name });
    })();
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

  private mustProject(id: string): Project {
    const project = this.getProject(id);
    if (!project) throw new NotFound(`프로젝트가 없음: ${id}`);
    return project;
  }

  // 표 이름은 이 두 값만 사용한다. 판 검사와 변경은 하나의 UPDATE로 처리한다.
  private bumpEntity(
    table: "projects" | "milestones",
    id: string,
    expectedVersion: number | undefined,
    set: string,
    args: unknown[],
  ): void {
    const result = this.db
      .prepare(
        `UPDATE ${table} SET ${set}, version = version + 1, updated_at = ?
         WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL
         ${expectedVersion === undefined ? "" : "AND version = ?"}`,
      )
      .run(
        ...args,
        this.now(),
        id,
        this.workspace,
        ...(expectedVersion === undefined ? [] : [expectedVersion]),
      );
    if (result.changes === 0) throw new VersionMismatch();
  }

  updateProject(who: Who, id: string, patch: ProjectPatch, expectedVersion?: number): void {
    this.db.transaction(() => {
      const before = this.mustProject(id);
      if (expectedVersion !== undefined && before.version !== expectedVersion) {
        throw new VersionMismatch();
      }
      if (patch.name === undefined) return;
      this.bumpEntity("projects", id, expectedVersion, "name = ?", [patch.name]);
      this.log(who, "project", id, "update", { name: patch.name });
    })();
  }

  // 프로젝트 휴지통: 안의 마일스톤과 할 일도 같은 시각으로 같이 넣고, 같이 들어간 표시를 남긴다 (M1-2, 작가 결정 2026-11-05)
  trashProject(who: Who, id: string): void {
    this.db.transaction(() => {
      const { name } = this.mustProject(id);
      const t = this.now();
      const milestones = this.db
        .prepare(
          `UPDATE milestones SET deleted_at = ?, trashed_with = ?, version = version + 1, updated_at = ?
           WHERE project_id = ? AND workspace_id = ? AND deleted_at IS NULL`,
        )
        .run(t, id, t, id, this.workspace).changes;
      const tasks = this.db
        .prepare(
          `UPDATE tasks SET deleted_at = ?, trashed_with = ?, version = version + 1, updated_at = ?
           WHERE project_id = ? AND workspace_id = ? AND deleted_at IS NULL`,
        )
        .run(t, id, t, id, this.workspace).changes;
      this.bumpEntity("projects", id, undefined, "deleted_at = ?", [t]);
      // 이름도 남긴다. 휴지통에 든 뒤에도 「마지막에 한 일」에 이름이 보이게
      this.log(who, "project", id, "trash", { name, milestones, tasks });
    })();
  }

  // 되살리기: 프로젝트와, 프로젝트와 같이 들어간 것만 꺼낸다. 먼저 따로 버린 할 일은 휴지통에 그대로
  reviveProject(who: Who, id: string): void {
    this.db.transaction(() => {
      const p = this.getProject(id, { includeTrashed: true });
      if (!p) throw new NotFound(`프로젝트가 없음: ${id}`);
      if (!p.deleted_at) return; // 이미 살아 있음
      const t = this.now();
      const milestones = this.db
        .prepare(
          `UPDATE milestones SET deleted_at = NULL, trashed_with = NULL, version = version + 1, updated_at = ?
           WHERE trashed_with = ? AND workspace_id = ?`,
        )
        .run(t, id, this.workspace).changes;
      const tasks = this.db
        .prepare(
          `UPDATE tasks SET deleted_at = NULL, trashed_with = NULL, version = version + 1, updated_at = ?
           WHERE trashed_with = ? AND workspace_id = ?`,
        )
        .run(t, id, this.workspace).changes;
      this.db
        .prepare(
          `UPDATE projects SET deleted_at = NULL, version = version + 1, updated_at = ?
           WHERE id = ? AND workspace_id = ?`,
        )
        .run(t, id, this.workspace);
      this.log(who, "project", id, "revive", { name: p.name, milestones, tasks });
    })();
  }

  // ── 마일스톤 ──

  createMilestone(who: Who, projectId: string, name: string, dueAt?: string | null): string {
    return this.db.transaction(() => {
      this.mustProject(projectId);
      const id = crypto.randomUUID();
      const t = this.now();
      const due = utc(dueAt);
      this.db
        .prepare(
          "INSERT INTO milestones (id, workspace_id, project_id, name, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id, this.workspace, projectId, name, due, t, t);
      this.log(who, "milestone", id, "create", { name, due_at: due });
      return id;
    })();
  }

  getMilestone(id: string, opts: { includeTrashed?: boolean } = {}): Milestone | undefined {
    return this.db
      .prepare(
        `SELECT * FROM milestones WHERE id = ? AND workspace_id = ? ${opts.includeTrashed ? "" : "AND deleted_at IS NULL"}`,
      )
      .get(id, this.workspace) as Milestone | undefined;
  }

  private mustMilestone(id: string): Milestone {
    const milestone = this.getMilestone(id);
    if (!milestone) throw new NotFound(`마일스톤이 없음: ${id}`);
    return milestone;
  }

  listMilestones(projectId: string): Milestone[] {
    this.mustProject(projectId);
    return this.db
      .prepare(
        `SELECT * FROM milestones WHERE project_id = ? AND workspace_id = ? AND deleted_at IS NULL
         ORDER BY due_at IS NULL, due_at, created_at, rowid`,
      )
      .all(projectId, this.workspace) as Milestone[];
  }

  // 가져오기용: 같은 이름의 마일스톤이 있으면 그것, 없으면 새로 (한 묶음 저장 안에서 부름)
  ensureMilestone(who: Who, projectId: string, name: string): string {
    const found = this.db
      .prepare(
        "SELECT id FROM milestones WHERE workspace_id = ? AND project_id = ? AND name = ? AND deleted_at IS NULL ORDER BY created_at LIMIT 1",
      )
      .get(this.workspace, projectId, name) as { id: string } | undefined;
    return found?.id ?? this.createMilestone(who, projectId, name);
  }

  // 오늘 화면에 올릴 할 일: 프로젝트마다 「지금 단계」(열린 일이 남은 첫 마일스톤) 뒤의 마일스톤에 든 열린 일은 뺀다.
  // 마일스톤 순서는 보드와 같음 (목표 날짜, 만든 순서). 마일스톤 없는 일과 「오늘 할 일」로 고정한 일은 늘 보임 (작가 결정 2026-11-16 「오늘 화면에서 다음 판 숨기기」)
  todayTasks(pinnedId?: string | null): { tasks: Task[]; later: number } {
    const tasks = this.listTasks();
    const ms = this.db
      .prepare(
        `SELECT id, project_id FROM milestones WHERE workspace_id = ? AND deleted_at IS NULL
         ORDER BY project_id, due_at IS NULL, due_at, created_at, rowid`,
      )
      .all(this.workspace) as { id: string; project_id: string }[];
    const open = new Set(
      tasks.filter((t) => t.status !== "done" && t.milestone_id).map((t) => t.milestone_id),
    );
    const later = new Set<string>();
    const seenCurrent = new Set<string>();
    for (const m of ms) {
      if (seenCurrent.has(m.project_id)) later.add(m.id);
      else if (open.has(m.id)) seenCurrent.add(m.project_id);
    }
    const hidden = (t: Task) =>
      t.status !== "done" &&
      t.id !== pinnedId &&
      t.milestone_id !== null &&
      later.has(t.milestone_id);
    return { tasks: tasks.filter((t) => !hidden(t)), later: tasks.filter(hidden).length };
  }

  updateMilestone(who: Who, id: string, patch: MilestonePatch, expectedVersion?: number): void {
    this.db.transaction(() => {
      const before = this.mustMilestone(id);
      if (expectedVersion !== undefined && before.version !== expectedVersion) {
        throw new VersionMismatch();
      }
      const sets: string[] = [];
      const args: unknown[] = [];
      const changed: Record<string, unknown> = {};
      if (patch.name !== undefined) {
        sets.push("name = ?");
        args.push(patch.name);
        changed.name = patch.name;
      }
      if (patch.dueAt !== undefined) {
        sets.push("due_at = ?");
        const due = utc(patch.dueAt);
        args.push(due);
        changed.due_at = due;
      }
      if (patch.doneWhen !== undefined) {
        const v = patch.doneWhen?.trim() || null;
        sets.push("done_when = ?");
        args.push(v);
        changed.done_when = v;
      }
      if (sets.length === 0) return;
      this.bumpEntity("milestones", id, expectedVersion, sets.join(", "), args);
      this.log(who, "milestone", id, "update", changed);
    })();
  }

  trashMilestone(who: Who, id: string): void {
    this.db.transaction(() => {
      this.mustMilestone(id);
      this.bumpEntity("milestones", id, undefined, "deleted_at = ?", [this.now()]);
      this.log(who, "milestone", id, "trash");
    })();
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
      owner?: Owner;
      sourceUrl?: string;
    },
  ): string {
    if (!this.getProject(input.projectId))
      throw new BadInput("projectId 에 해당하는 프로젝트가 없음");
    if (input.milestoneId && !this.milestoneInProject(input.milestoneId, input.projectId)) {
      throw new BadInput("milestoneId 가 이 프로젝트의 마일스톤이 아님");
    }
    const id = crypto.randomUUID();
    const t = this.now();
    // 할 일과 「누가 만들었나」 기록은 한 묶음. 기록이 실패하면 할 일도 남기지 않는다 (S1, 2026-11-05)
    this.db.transaction(() => {
      this.insertTask(id, t, input);
      this.log(who, "task", id, "create", { title: input.title, source: input.source ?? "direct" });
    })();
    return id;
  }

  private insertTask(
    id: string,
    t: string,
    input: {
      projectId: string;
      title: string;
      milestoneId?: string;
      dueAt?: string;
      source?: string;
      sourceRef?: string;
      externalText?: boolean;
      body?: string;
      owner?: Owner;
      sourceUrl?: string;
    },
  ) {
    try {
      this.db
        .prepare(
          `INSERT INTO tasks (id, workspace_id, project_id, milestone_id, title, due_at, source, source_ref, external_text, body, created_at, updated_at, owner, source_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          this.workspace,
          input.projectId,
          input.milestoneId ?? null,
          input.title,
          utc(input.dueAt),
          input.source ?? "direct",
          input.sourceRef ?? null,
          // 직접 쓴 것이 아니면(깃허브 등에서 가져옴) 보내는 쪽이 빼도 서버가 늘 외부 입력로 표시 (M1-7)
          input.externalText || (input.source ?? "direct") !== "direct" ? 1 : 0,
          input.body ?? null,
          t,
          t,
          input.owner ?? "author",
          input.sourceUrl ?? null,
        );
    } catch (err) {
      if ((err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw new Duplicate(`이미 가져온 할 일: ${input.source} ${input.sourceRef}`);
      }
      throw err;
    }
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
    this.guardHold(who, before);
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
      args.push(utc(patch.dueAt));
      changed.due_at = utc(patch.dueAt);
    }
    if (patch.milestoneId !== undefined) {
      sets.push("milestone_id = ?");
      args.push(patch.milestoneId);
      changed.milestone_id = patch.milestoneId;
    }
    if (patch.owner !== undefined && patch.owner !== before.owner) {
      sets.push("owner = ?");
      args.push(patch.owner);
      changed.owner = patch.owner;
    }
    if (patch.progressNote !== undefined) {
      const v = patch.progressNote?.trim() || null;
      sets.push("progress_note = ?");
      args.push(v);
      changed.progress_note = v;
    }
    // 사람이 끝낼 때: 사람 확인 질문이 열려 있으면 「완료」로 답한 것으로 본다. 다른 질문이 열려 있으면 먼저 답해야 한다
    // (그냥 끝내면 질문이 열린 채 남는다)
    if (patch.status === "done" && before.status !== "done" && norm(who).kind !== "ai") {
      const open = this.openDecision(id);
      if (open?.kind === "done_check") {
        const { status: _done, ...rest } = patch;
        this.db.transaction(() => {
          this.updateTask(who, id, rest, expectedVersion);
          this.answerDecision(who, id, DONE_CHECK.options?.[0] ?? "완료");
        })();
        return;
      }
      if (open) {
        throw new RuleViolation("open-decision", "답할 질문이 열려 있음. 질문에 먼저 답해 주세요");
      }
    }
    // 사람 확인 대기 (M2-1, 작가 2026-11-25 「AI로 지시해서 끝내고, 실제 문제는 없는지 직접 검증한다」):
    // AI 가 외부 입력(깃허브, vault, 운영 이슈 등) 할 일을 완료로 바꾸면 끝내지 않고 작가에게 확인을 묻는다
    if (
      patch.status === "done" &&
      before.status !== "done" &&
      before.external_text === 1 &&
      norm(who).kind === "ai"
    ) {
      const open = this.openDecision(id);
      if (open && open.kind !== "done_check") {
        throw new RuleViolation(
          "open-decision",
          "작가에게 묻고 있는 질문이 있어 끝낼 수 없음. 답을 받은 뒤 다시",
        );
      }
      const { status: _claimed, ...rest } = patch;
      this.db.transaction(() => {
        this.updateTask(who, id, rest, expectedVersion);
        this.askDecision(who, id, DONE_CHECK, "done_check");
        this.log(who, "task", id, "done-claimed", { from: before.status });
      })();
      return;
    }
    if (patch.status !== undefined) {
      sets.push("status = ?");
      args.push(patch.status);
      if (patch.status === "done") sets.push("blocked_reason = NULL", CLEAR_HOLD);
    }
    if (sets.length === 0) return;
    this.db.transaction(() => {
      this.bump(id, expectedVersion, sets.join(", "), args);
      if (patch.status !== undefined && patch.status !== before.status) {
        const cleared =
          patch.status === "done" && before.blocked_reason
            ? { cleared_block: before.blocked_reason }
            : {};
        this.log(who, "task", id, "status", { from: before.status, to: patch.status, ...cleared });
      }
      if (Object.keys(changed).length) this.log(who, "task", id, "update", changed);
    })();
  }

  setStatus(who: Who, id: string, status: Status): void {
    this.updateTask(who, id, { status });
  }

  block(who: Who, id: string, reason: BlockedReason, heldBy?: string): void {
    const before = this.mustTask(id);
    this.guardHold(who, before);
    if (before.status === "done") {
      throw new RuleViolation("blocked-done", "끝난 일에는 멈춘 이유를 붙이지 않는다");
    }
    if (heldBy !== undefined && reason !== "ai_working") {
      throw new RuleViolation("held-by-not-ai", "잡은 세션은 「AI 작업 중」일 때만");
    }
    this.db.transaction(() => {
      this.bump(id, undefined, "blocked_reason = ?, held_by = ?", [reason, heldBy ?? null]);
      this.log(who, "task", id, "block", { reason, held_by: heldBy ?? null });
    })();
  }

  unblock(who: Who, id: string): void {
    const t = this.mustTask(id);
    this.guardHold(who, t);
    if (!t.blocked_reason) return; // 멈춘 게 없으면 바꿀 것도 없음
    this.db.transaction(() => {
      this.bump(id, undefined, `blocked_reason = NULL, ${CLEAR_HOLD}`, []);
      this.log(who, "task", id, "unblock");
    })();
  }

  // ── 잡기와 놓기 (M2-2) ──
  // 불변조건
  //  1. 할 일 하나에 살아 있는 잡기는 많아야 하나 (번호가 있고 시간이 안 지남)
  //  2. 살아 있는 잡기가 있으면, AI 의 쓰기는 그 번호를 가져온 것만 받는다 (409 held)
  //  3. 잡기가 없는데 번호를 가져온 AI 쓰기는 옛 요청이라 거절한다 (409 hold-stale). 놓은 뒤, 시간이 지난 뒤, 남이 다시 잡은 뒤 늦게 온 요청
  //  4. 사람은 잡기와 상관없이 고칠 수 있고, 남의 잡기도 놓을 수 있다
  //  5. 잡기는 놓기, 완료, 휴지통, 작가에게 질문, 멈춤 풀기로 끝난다. 끝나면 번호를 지워 3번이 걸린다
  //  번호를 안 가져온 AI 쓰기는, 아무도 안 잡은 할 일이면 예전처럼 받는다

  private liveHold(t: Task): string | null {
    return t.hold_id && t.hold_expires_at && t.hold_expires_at > this.now() ? t.hold_id : null;
  }

  private guardHold(who: Who, t: Task): void {
    const { kind, hold } = norm(who);
    if (kind !== "ai") return;
    const live = this.liveHold(t);
    if (live) {
      if (hold !== live) {
        throw new HoldConflict(
          "held",
          `다른 세션이 잡은 일 (${t.held_by ?? "누군가"}). 놓을 때까지 기다리세요`,
        );
      }
      // 잡은 세션이 고칠 때마다 시간을 늘린다. 내용이 바뀐 게 아니라 판 번호는 그대로
      this.db
        .prepare("UPDATE tasks SET hold_expires_at = ? WHERE id = ? AND workspace_id = ?")
        .run(new Date(this.clock().getTime() + HOLD_MS).toISOString(), t.id, this.workspace);
    } else if (hold) {
      throw new HoldConflict(
        "hold-stale",
        "이 잡기는 이미 끝남 (놓았거나, 시간이 지났거나, 할 일이 끝남). 다시 잡으세요",
      );
    }
  }

  // 잡는다: 서버가 번호를 발급한다. 같은 번호를 가져오면 시간만 늘린다
  hold(who: Who, id: string): { holdId: string; expiresAt: string; heldBy: string } {
    const { actor, session, hold } = norm(who);
    return this.db.transaction(() => {
      const t = this.mustTask(id);
      if (t.status === "done") throw new RuleViolation("hold-done", "끝난 일은 잡지 않는다");
      const live = this.liveHold(t);
      const expiresAt = new Date(this.clock().getTime() + HOLD_MS).toISOString();
      if (live && hold === live) {
        this.db
          .prepare("UPDATE tasks SET hold_expires_at = ? WHERE id = ? AND workspace_id = ?")
          .run(expiresAt, id, this.workspace);
        return { holdId: live, expiresAt, heldBy: t.held_by ?? actor };
      }
      if (live) {
        throw new HoldConflict(
          "held",
          `다른 세션이 잡은 일 (${t.held_by ?? "누군가"}). 놓을 때까지 기다리세요`,
        );
      }
      if (t.blocked_reason && t.blocked_reason !== "ai_working") {
        throw new RuleViolation(
          "hold-blocked",
          "다른 이유로 멈춘 일은 잡지 않는다. 멈춤을 먼저 풀어야 함",
        );
      }
      const holdId = crypto.randomUUID();
      const heldBy = session ? `${actor} · ${session}` : actor;
      this.bump(
        id,
        undefined,
        "blocked_reason = 'ai_working', held_by = ?, hold_id = ?, hold_expires_at = ?",
        [heldBy, holdId, expiresAt],
      );
      this.log(who, "task", id, "hold", { held_by: heldBy, expires_at: expiresAt });
      return { holdId, expiresAt, heldBy };
    })();
  }

  // 놓는다. 잡기가 없으면 할 일 없음(다시 보내도 같음). AI 는 자기 번호로만 놓는다
  release(who: Who, id: string): void {
    const { kind, hold } = norm(who);
    this.db.transaction(() => {
      const t = this.mustTask(id);
      const live = this.liveHold(t);
      if (live && kind === "ai" && hold !== live) {
        throw new HoldConflict("held", "다른 세션이 잡은 일은 놓을 수 없음");
      }
      if (!t.hold_id) return;
      const unblock = t.blocked_reason === "ai_working" ? "blocked_reason = NULL, " : "";
      this.bump(id, undefined, `${unblock}${CLEAR_HOLD}`, []);
      this.log(who, "task", id, "release", live ? {} : { expired: true });
    })();
  }

  // 휴지통으로. 목록에서 빠지지만 되살릴 수 있다.
  trash(who: Who, id: string): void {
    this.guardHold(who, this.mustTask(id));
    this.db.transaction(() => {
      this.bump(id, undefined, `deleted_at = ?, ${CLEAR_HOLD}`, [this.now()]);
      this.log(who, "task", id, "trash");
    })();
  }

  // 되살리기: 휴지통에서 꺼내거나, 끝난 일을 다시 연다.
  revive(who: Who, id: string): void {
    const t = this.mustTask(id, { includeTrashed: true });
    this.guardHold(who, t);
    if (!t.deleted_at && t.status !== "done") return; // 이미 살아 있음
    // 휴지통에 든 프로젝트의 할 일만 꺼내면 보이지 않는 곳에 살아난다. 프로젝트를 되살리게 한다
    if (t.deleted_at && !this.getProject(t.project_id)) {
      throw new RuleViolation(
        "project-trashed",
        "이 할 일의 프로젝트가 휴지통에 있음. 프로젝트를 되돌리면 같이 돌아옴",
      );
    }
    this.db.transaction(() => {
      this.bump(
        id,
        undefined,
        "deleted_at = NULL, trashed_with = NULL, status = CASE WHEN status = 'done' THEN 'todo' ELSE status END",
        [],
      );
      this.log(who, "task", id, "revive");
    })();
  }

  // ── 가져오기 (M1-3) ──

  // 이름으로 프로젝트를 찾고, 없으면 만든다 (가져오기 묶음마다 프로젝트 하나)
  // 가져오기용: 출처(sourceKey)로 먼저 찾고, 없으면 이름으로 찾아 출처를 붙인다 (마이그레이션 011).
  // 출처로 찾으니 작가가 이름을 바꿔도 다음 가져오기 때 옛 이름 프로젝트가 새로 생기지 않는다
  ensureProject(who: Who, name: string, sourceKey?: string): string {
    if (sourceKey) {
      const mapped = this.db
        .prepare(
          `SELECT p.id FROM project_sources s JOIN projects p ON p.id = s.project_id
           WHERE s.workspace_id = ? AND s.source_key = ? AND p.deleted_at IS NULL`,
        )
        .get(this.workspace, sourceKey) as { id: string } | undefined;
      if (mapped) return mapped.id;
    }
    const found = this.db
      .prepare(
        "SELECT id FROM projects WHERE workspace_id = ? AND name = ? AND deleted_at IS NULL ORDER BY created_at LIMIT 1",
      )
      .get(this.workspace, name) as { id: string } | undefined;
    const id = found?.id ?? this.createProject(who, name);
    if (sourceKey) {
      this.db
        .prepare(
          "INSERT OR REPLACE INTO project_sources (workspace_id, source_key, project_id, created_at) VALUES (?, ?, ?, ?)",
        )
        .run(this.workspace, sourceKey, id, this.now());
    }
    return id;
  }

  // 프로젝트 합치기: from 의 마일스톤, 할 일, 출처를 into 로 옮기고 빈 from 은 휴지통에 넣는다 (되살릴 수 있음)
  mergeProjects(who: Who, fromId: string, intoId: string): { milestones: number; tasks: number } {
    if (fromId === intoId) throw new BadInput("같은 프로젝트끼리는 합칠 수 없음");
    return this.db.transaction(() => {
      const from = this.mustProject(fromId);
      const into = this.mustProject(intoId);
      const t = this.now();
      const move = (table: string) =>
        this.db
          .prepare(
            `UPDATE ${table} SET project_id = ?, version = version + 1, updated_at = ?
             WHERE project_id = ? AND workspace_id = ? AND deleted_at IS NULL`,
          )
          .run(intoId, t, fromId, this.workspace).changes;
      const milestones = move("milestones");
      const tasks = move("tasks");
      this.db
        .prepare(
          "UPDATE project_sources SET project_id = ? WHERE project_id = ? AND workspace_id = ?",
        )
        .run(intoId, fromId, this.workspace);
      this.log(who, "project", intoId, "merge", {
        from: from.name,
        into: into.name,
        milestones,
        tasks,
      });
      this.trashProject(who, fromId);
      return { milestones, tasks };
    })();
  }

  findProjectByName(name: string): { id: string; name: string } | undefined {
    return this.db
      .prepare(
        "SELECT id, name FROM projects WHERE workspace_id = ? AND name = ? AND deleted_at IS NULL ORDER BY created_at LIMIT 1",
      )
      .get(this.workspace, name) as { id: string; name: string } | undefined;
  }

  // 출처 하나의 일들을 넣거나 고친다. 두 번 돌려도 같은 결과 (출처 + 출처 번호 기준).
  // 한 묶음으로 저장해, 중간에 실패하면 이번 회차는 하나도 남기지 않는다.
  // 출처에서 바뀐 칸만 고친다: 지난번에 출처에서 본 값(source_seen)과 다를 때만.
  // 작업판에서 끝냈거나 이름을 바꾼 것을, 출처가 그대로라는 이유로 되돌리지 않는다.
  importItems(who: Who, source: string, projectId: string, items: ImportItem[]): ImportResult {
    const r: ImportResult = { created: 0, updated: 0, closed: 0, reopened: 0, same: 0, skipped: 0 };
    this.db.transaction(() => {
      this.mustProject(projectId);
      for (const it of items) {
        const seen = {
          state: it.state,
          title: it.title,
          due: it.dueAt ? utc(it.dueAt) : null,
          body: it.body ?? null,
          url: it.url ?? null,
          owner: it.owner,
          decision: !!it.decision,
          options: JSON.stringify(it.options ?? []),
          recommended: it.recommended ?? null,
          milestone: it.milestone ?? null,
        };
        const msId = it.milestone ? this.ensureMilestone(who, projectId, it.milestone) : null;
        const t = this.db
          .prepare("SELECT * FROM tasks WHERE workspace_id = ? AND source = ? AND source_ref = ?")
          .get(this.workspace, source, it.ref) as Task | undefined;
        if (!t) {
          const id = crypto.randomUUID();
          this.insertTask(id, this.now(), {
            projectId,
            title: it.title,
            dueAt: it.dueAt ?? undefined,
            source,
            sourceRef: it.ref,
            body: it.body ?? undefined,
            owner: it.owner,
            sourceUrl: it.url ?? undefined,
            milestoneId: msId ?? undefined,
          });
          const extra = it.state === "done" ? ", status = 'done'" : "";
          this.bump(id, undefined, `source_seen = ?${extra}`, [JSON.stringify(seen)]);
          this.log(who, "task", id, "import", {
            source,
            ref: it.ref,
            title: it.title,
            change: "create",
          });
          // 작가가 정할 일은 결정함에 질문으로 (선택지, 추천, 근거를 같이)
          if (it.state === "open" && it.decision) this.askFromImport(who, id, it);
          r.created++;
          continue;
        }
        // 작가가 휴지통에 넣은 것은 출처에 남아 있어도 다시 꺼내지 않는다
        if (t.deleted_at) {
          r.skipped++;
          continue;
        }
        const prev = (t.source_seen ? JSON.parse(t.source_seen) : {}) as Partial<typeof seen>;
        const moved = <K extends keyof typeof seen>(k: K) => prev[k] !== seen[k];
        const sets: string[] = [];
        const args: unknown[] = [];
        const changed: Record<string, unknown> = {};
        const field = (col: string, key: keyof typeof seen, current: unknown, label?: string) => {
          if (moved(key) && seen[key] !== current) {
            sets.push(`${col} = ?`);
            args.push(seen[key]);
            if (label) changed[label] = seen[key];
          }
        };
        field("title", "title", t.title, "title");
        field("due_at", "due", t.due_at, "due_at");
        field("body", "body", t.body);
        field("source_url", "url", t.source_url ?? null);
        field("owner", "owner", t.owner, "owner");
        // 마일스톤: 출처에서 바뀐 때만 옮김 (작업판에서 옮긴 것은 덮지 않음)
        if (moved("milestone") && msId !== t.milestone_id) {
          sets.push("milestone_id = ?");
          args.push(msId);
          changed.milestone = it.milestone ?? null;
        }
        let change = "update";
        if (moved("state") && seen.state === "done" && t.status !== "done") {
          sets.push("status = 'done'", "blocked_reason = NULL", CLEAR_HOLD);
          change = "close";
        } else if (moved("state") && seen.state === "open" && t.status === "done") {
          // 출처에서 다시 열린 것 (놓친 것 부활)
          sets.push("status = 'todo'");
          change = "reopen";
        }
        const reask =
          seen.decision &&
          seen.state === "open" &&
          change !== "close" &&
          t.status !== "done" &&
          (moved("decision") || moved("title") || moved("options") || moved("recommended"));
        const seenText = JSON.stringify(seen);
        if (!sets.length) {
          // 고칠 것은 없어도 본 값은 새로 적는다 (다음 비교의 기준)
          if (seenText !== t.source_seen)
            this.db.prepare("UPDATE tasks SET source_seen = ? WHERE id = ?").run(seenText, t.id);
          if (reask) this.askFromImport(who, t.id, it);
          r.same++;
          continue;
        }
        sets.push("source_seen = ?");
        args.push(seenText);
        this.bump(t.id, undefined, sets.join(", "), args);
        if (reask) this.askFromImport(who, t.id, it);
        this.log(who, "task", t.id, "import", {
          source,
          ref: it.ref,
          title: it.title,
          change,
          ...changed,
        });
        if (change === "close") r.closed++;
        else if (change === "reopen") r.reopened++;
        else r.updated++;
      }
    })();
    return r;
  }

  private askFromImport(who: Who, taskId: string, it: ImportItem) {
    this.askDecision(who, taskId, {
      question: it.title,
      options: it.options,
      recommended: it.recommended,
      basis: it.basis,
    });
  }

  findBySource(source: string, ref: string): Task | undefined {
    return this.db
      .prepare(
        "SELECT * FROM tasks WHERE workspace_id = ? AND source = ? AND source_ref = ? AND deleted_at IS NULL",
      )
      .get(this.workspace, source, ref) as Task | undefined;
  }

  // ── 결정함 (M1-4) ──

  // 정할 것을 묻는다: 질문, 선택지, 추천, 근거. 할 일은 「내 결정 대기」로 멈춘다.
  // 이미 열린 질문이 있으면 그 질문을 고친다 (한 할 일에 열린 질문은 하나)
  askDecision(who: Who, taskId: string, ask: DecisionAsk, kind: string | null = null): void {
    const { actor } = norm(who);
    const question = ask.question.trim();
    if (!question) throw new BadInput("질문이 비어 있음");
    const options = [...new Set((ask.options ?? []).map((o) => o.trim()).filter(Boolean))];
    this.db.transaction(() => {
      const t = this.mustTask(taskId);
      this.guardHold(who, t);
      if (t.status === "done") {
        throw new RuleViolation("decision-done", "끝난 일에는 정할 것을 붙이지 않는다");
      }
      const open = this.openDecision(taskId);
      if (open) {
        this.db
          .prepare(
            "UPDATE decisions SET question = ?, options = ?, recommended = ?, basis = ?, kind = ? WHERE id = ?",
          )
          .run(
            question,
            JSON.stringify(options),
            ask.recommended ?? null,
            ask.basis ?? null,
            kind,
            open.id,
          );
      } else {
        this.db
          .prepare(
            `INSERT INTO decisions (id, workspace_id, task_id, question, options, recommended, basis, asked_by, asked_at, kind)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            crypto.randomUUID(),
            this.workspace,
            taskId,
            question,
            JSON.stringify(options),
            ask.recommended ?? null,
            ask.basis ?? null,
            actor,
            this.now(),
            kind,
          );
      }
      if (t.blocked_reason !== "my_decision") {
        this.bump(taskId, undefined, `blocked_reason = 'my_decision', ${CLEAR_HOLD}`, []);
      }
      this.log(who, "task", taskId, "ask", { question, options });
    })();
  }

  // 답한다: 고른 답을 남기고 멈춤을 푼다. 기다리던 세션은 GET 으로 답을 읽는다
  answerDecision(who: Who, taskId: string, answer: string, note?: string | null): void {
    const { actor } = norm(who);
    const a = answer.trim();
    if (!a) throw new BadInput("답이 비어 있음");
    this.db.transaction(() => {
      const t = this.mustTask(taskId);
      const open = this.openDecision(taskId);
      if (!open) throw new RuleViolation("no-open-decision", "답할 질문이 없음");
      this.db
        .prepare(
          "UPDATE decisions SET answer = ?, note = ?, answered_by = ?, answered_at = ? WHERE id = ?",
        )
        .run(a, note?.trim() || null, actor, this.now(), open.id);
      if (t.blocked_reason === "my_decision") {
        this.bump(taskId, undefined, `blocked_reason = NULL, ${CLEAR_HOLD}`, []);
      }
      this.log(who, "task", taskId, "decide", { question: open.question, answer: a });
      // 사람 확인에서 「완료」를 고르면 그때 끝낸다. 「다시 하기」는 멈춤만 풀고 그대로 둔다
      if (open.kind === "done_check" && a === DONE_CHECK.options?.[0]) {
        this.updateTask(who, taskId, { status: "done" });
      }
    })();
  }

  private openDecision(taskId: string): Decision | undefined {
    return this.db
      .prepare(
        "SELECT * FROM decisions WHERE workspace_id = ? AND task_id = ? AND answered_at IS NULL",
      )
      .get(this.workspace, taskId) as Decision | undefined;
  }

  // 가장 최근 질문 (열린 것이 있으면 그것)
  getDecision(taskId: string): Decision | undefined {
    return (
      this.openDecision(taskId) ??
      (this.db
        .prepare(
          "SELECT * FROM decisions WHERE workspace_id = ? AND task_id = ? ORDER BY answered_at DESC LIMIT 1",
        )
        .get(this.workspace, taskId) as Decision | undefined)
    );
  }

  // 열린 질문 전부 + 최근 답 (화면의 결정함, 오늘 요약)
  listDecisions(opts: { open?: boolean; limit?: number } = {}): Decision[] {
    return this.db
      .prepare(
        `SELECT d.* FROM decisions d JOIN tasks t ON t.id = d.task_id
         WHERE d.workspace_id = ? AND t.deleted_at IS NULL ${opts.open ? "AND d.answered_at IS NULL" : ""}
         ORDER BY d.answered_at IS NOT NULL, COALESCE(d.answered_at, d.asked_at) DESC LIMIT ?`,
      )
      .all(this.workspace, opts.limit ?? 200) as Decision[];
  }

  // ── 기능 스위치 (M1-4) ──

  listSettings(): Setting[] {
    const rows = this.db
      .prepare("SELECT * FROM settings WHERE workspace_id = ?")
      .all(this.workspace) as {
      name: string;
      enabled: number;
      reason: string | null;
      changed_by: string;
      changed_kind: string | null;
      changed_at: string;
    }[];
    return (Object.keys(SWITCHES) as SwitchName[]).map((name) => {
      const r = rows.find((x) => x.name === name);
      return {
        name,
        label: SWITCHES[name],
        enabled: r ? r.enabled === 1 : true,
        reason: r?.reason ?? null,
        changedBy: r?.changed_by ?? null,
        changedKind: r?.changed_kind ?? null,
        changedAt: r?.changed_at ?? null,
      };
    });
  }

  isOn(name: SwitchName): boolean {
    return this.listSettings().find((s) => s.name === name)?.enabled ?? true;
  }

  // 작가와 AI 모두 바꿀 수 있다 (작가 결정 2026-11-13 「AI도 바꿀 수 있게」). AI 는 이유 한 줄이 필수
  setSetting(who: Who, name: string, enabled: boolean, reason?: string | null): Setting {
    if (!(name in SWITCHES)) throw new NotFound(`없는 기능 설정: ${name}`);
    const { actor, kind } = norm(who);
    const why = reason?.trim() || null;
    if (kind === "ai" && !why) {
      throw new RuleViolation("reason-required", "AI 가 기능 설정을 바꿀 때는 이유 한 줄이 필요");
    }
    this.db
      .prepare(
        `INSERT INTO settings (workspace_id, name, enabled, reason, changed_by, changed_kind, changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (workspace_id, name) DO UPDATE SET enabled = excluded.enabled, reason = excluded.reason,
           changed_by = excluded.changed_by, changed_kind = excluded.changed_kind, changed_at = excluded.changed_at`,
      )
      .run(this.workspace, name, enabled ? 1 : 0, why, actor, kind, this.now());
    return this.listSettings().find((s) => s.name === name) as Setting;
  }

  // ── 날짜별 사용 기록 (M1-5) ──

  // 사람 API 키로 부른 그날 첫 시각만 남긴다 (이미 있으면 그대로)
  markOpened(day: string): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO usage_days (workspace_id, day, first_opened_at) VALUES (?, ?, ?)",
      )
      .run(this.workspace, day, this.now());
  }

  // 한국 날짜 from ~ to (둘 다 포함) 날마다: 처음 연 시각, 작가가 바꾼 수, 고른 결정 수, AI 가 바꾼 수, 가져오기 수
  usage(from: string, to: string): UsageDay[] {
    const start = kstDayStart(from);
    const end = kstDayStart(to, 1);
    const dayOf = (iso: string) =>
      new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 10);
    const days = new Map<string, UsageDay>();
    for (let t = Date.parse(start); t < Date.parse(end); t += 86_400_000) {
      const d = dayOf(new Date(t).toISOString());
      days.set(d, {
        day: d,
        firstOpenedAt: null,
        authorChanges: 0,
        decisions: 0,
        aiChanges: 0,
        imports: 0,
      });
    }
    for (const r of this.db
      .prepare(
        "SELECT day, first_opened_at FROM usage_days WHERE workspace_id = ? AND day >= ? AND day <= ?",
      )
      .all(this.workspace, from, to) as { day: string; first_opened_at: string }[]) {
      const u = days.get(r.day);
      if (u) u.firstOpenedAt = r.first_opened_at;
    }
    for (const r of this.db
      .prepare(
        "SELECT at, actor_kind, action FROM change_log WHERE workspace_id = ? AND at >= ? AND at < ?",
      )
      .all(this.workspace, start, end) as {
      at: string;
      actor_kind: string | null;
      action: string;
    }[]) {
      const u = days.get(dayOf(r.at));
      if (!u) continue;
      if (r.action === "import") u.imports++;
      else if (r.actor_kind === "human") {
        u.authorChanges++;
        if (r.action === "decide") u.decisions++;
      } else if (r.actor_kind === "ai") u.aiChanges++;
    }
    return [...days.values()];
  }

  // ── 변경 기록 ──

  // 거르기 (M1-7): 누가, 어떤 종류의 API 키가, 어느 항목을, 어느 날부터 어느 날까지 (한국 날짜)
  listChanges(filter: ChangeFilter = {}): ChangeRow[] {
    const where = ["workspace_id = ?"];
    const args: unknown[] = [this.workspace];
    if (filter.actor) {
      where.push("actor = ?");
      args.push(filter.actor);
    }
    if (filter.actorKind) {
      where.push("actor_kind = ?");
      args.push(filter.actorKind);
    }
    if (filter.entity) {
      where.push("entity = ?");
      args.push(filter.entity);
    }
    if (filter.entityId) {
      where.push("entity_id = ?");
      args.push(filter.entityId);
    }
    if (filter.since) {
      where.push("at >= ?");
      args.push(kstDayStart(filter.since));
    }
    if (filter.until) {
      where.push("at < ?");
      args.push(kstDayStart(filter.until, 1));
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

  // ── 오늘 할 일(고정)과 건너뛰기 (날짜별, M1-7) ──

  getDay(day: string): { pinnedTaskId: string | null; skipped: string[] } {
    const row = this.db
      .prepare("SELECT pinned_task_id, skipped FROM day_state WHERE workspace_id = ? AND day = ?")
      .get(this.workspace, day) as { pinned_task_id: string | null; skipped: string } | undefined;
    return row
      ? { pinnedTaskId: row.pinned_task_id, skipped: JSON.parse(row.skipped) as string[] }
      : { pinnedTaskId: null, skipped: [] };
  }

  setDay(day: string, state: { pinnedTaskId: string | null; skipped: string[] }): void {
    const skipped = [...new Set(state.skipped)];
    this.db
      .prepare(
        `INSERT INTO day_state (workspace_id, day, pinned_task_id, skipped, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (workspace_id, day) DO UPDATE SET pinned_task_id = excluded.pinned_task_id,
           skipped = excluded.skipped, updated_at = excluded.updated_at`,
      )
      .run(this.workspace, day, state.pinnedTaskId, JSON.stringify(skipped), this.now());
  }

  recentChanges(limit = 20): ChangeRow[] {
    return this.listChanges({ limit });
  }
}
