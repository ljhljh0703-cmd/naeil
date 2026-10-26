import { existsSync } from "node:fs";
import fastifyStatic from "@fastify/static";
import type Database from "better-sqlite3";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type RouteHandlerMethod,
} from "fastify";
import { findKey, type KeyInfo } from "./auth.js";
import { decodeCursor, encodeCursor } from "./cursor.js";
import { openDb } from "./db/connection.js";
import {
  type BlockedReason,
  type ChangeRow,
  type Project,
  type Status,
  Store,
  type Task,
  type TaskPatch,
} from "./db/store.js";
import { AppError, ERROR_DOCS, NotFound, Unauthorized, VersionMismatch } from "./errors.js";
import { IdempotencyStore, requestHash } from "./idempotency.js";
import { routeSchema, specSchemaBundle, toFastifyPath } from "./spec.js";

export const TAGLINE = "내 일은 naeil에서";

declare module "fastify" {
  interface FastifyRequest {
    key: KeyInfo | null;
    who: { actor: string; session: string | null };
  }
}

export type AppOptions = {
  logger?: boolean;
  db?: Database.Database;
  // 화면(web/dist)이 있으면 첫 주소에서 화면을 연다
  webDir?: string;
  clock?: () => Date;
};

// ── 바깥으로 나가는 모양 (명세서: 낙타 표기, 세계 표준시) ──

export const toProject = (p: Project) => ({
  id: p.id,
  name: p.name,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
  deletedAt: p.deleted_at,
});

export const toTask = (t: Task) => ({
  id: t.id,
  projectId: t.project_id,
  milestoneId: t.milestone_id,
  title: t.title,
  status: t.status,
  blockedReason: t.blocked_reason,
  heldBy: t.held_by,
  dueAt: t.due_at,
  source: t.source,
  sourceRef: t.source_ref,
  externalText: t.external_text === 1,
  body: t.body,
  createdAt: t.created_at,
  updatedAt: t.updated_at,
  deletedAt: t.deleted_at,
});

export const toChange = (c: ChangeRow) => ({
  id: c.id,
  at: c.at,
  actor: c.actor,
  session: c.session,
  entity: c.entity,
  entityId: c.entity_id,
  action: c.action,
  details: c.details ? JSON.parse(c.details) : null,
});

const etag = (t: Task) => `"v${t.version}"`;

// If-Match: 없으면 검사 안 함(작가 결정: 선택). 「*」 도 검사 안 함.
function expectedVersion(header: string | undefined): number | undefined {
  if (header === undefined || header.trim() === "*") return undefined;
  const m = /^(?:W\/)?"v(\d+)"$/.exec(header.trim());
  if (!m) throw new VersionMismatch();
  return Number(m[1]);
}

function sendProblem(reply: FastifyReply, err: AppError, instance?: string) {
  return reply
    .code(err.status)
    .type("application/problem+json")
    .send({
      type: `${ERROR_DOCS}#${err.slug}`,
      title: err.title,
      status: err.status,
      detail: err.message,
      ...(instance ? { instance } : {}),
    });
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const db = options.db ?? openDb(":memory:");
  const clock = options.clock ?? (() => new Date());
  const idem = new IdempotencyStore(db, clock);
  const stores = new Map<string, Store>();
  const storeFor = (req: FastifyRequest) => {
    const ws = req.key?.workspace ?? "me";
    let s = stores.get(ws);
    if (!s) {
      s = new Store(db, ws, clock);
      stores.set(ws, s);
    }
    return s;
  };

  const app = Fastify({
    logger: options.logger ?? false,
    ajv: {
      // 명세서의 additionalProperties: false 를 「조용히 지우기」가 아니라 「거절」로
      customOptions: { removeAdditional: false, strict: false },
    },
  });
  app.addSchema(specSchemaBundle());
  app.decorateRequest("key", null);
  app.decorateRequest("who", null as unknown as FastifyRequest["who"]);

  // ── 오류는 한 가지 모양 (RFC 9457) ──
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) return sendProblem(reply, err, req.url);
    const e = err as { statusCode?: number; validation?: unknown; message: string };
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return sendProblem(
        reply,
        new AppError(e.statusCode, "bad-input", "입력 규칙 위반", e.message),
        req.url,
      );
    }
    req.log.error(err);
    return sendProblem(
      reply,
      new AppError(500, "server", "서버 오류", "서버 기록을 확인하세요"),
      req.url,
    );
  });
  app.setNotFoundHandler((req, reply) =>
    sendProblem(reply, new NotFound("그런 주소는 없음"), req.url),
  );

  // ── 출입증: /v1 아래는 전부 ──
  // 주소 글자(req.url)가 아닌 「찾아간 주소 틀」로 판단한다. 「/%761/tasks」 처럼 글자를 바꿔 써도
  // 같은 주소로 찾아가므로, 글자로 판단하면 출입증 검사를 건너뛴다 (2026-10-26 시험에서 발견).
  app.addHook("onRequest", async (req) => {
    if (!req.routeOptions.url?.startsWith("/v1/")) return;
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");
    const key = m?.[1] ? findKey(db, m[1]) : null;
    if (!key) throw new Unauthorized();
    req.key = key;
  });
  app.addHook("preHandler", async (req) => {
    if (!req.key) return;
    const session = req.headers["x-naeil-session"];
    req.who = { actor: req.key.name, session: typeof session === "string" ? session : null };
  });
  app.addHook("onSend", async (_req, reply) => {
    if (reply.statusCode === 401) reply.header("WWW-Authenticate", "Bearer");
  });

  // 명세서 주소 하나 = 동작 하나. 입력 규칙은 명세서에서 가져온다.
  const route = (
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    specPath: string,
    handler: RouteHandlerMethod,
  ) =>
    app.route({
      method,
      url: toFastifyPath(specPath),
      schema: routeSchema(specPath, method),
      handler,
    });

  // 같은 요청 두 번 막기를 거쳐 만들기
  async function idempotent(
    req: FastifyRequest,
    reply: FastifyReply,
    run: () => { status: number; body: unknown; location: string | null },
  ) {
    const idemKey = req.headers["idempotency-key"];
    const key = req.key as KeyInfo;
    if (typeof idemKey === "string") {
      const hash = requestHash(req.method, req.url, req.body);
      const prev = idem.find(key.workspace, key.name, idemKey, hash);
      if (prev) {
        if (prev.location) reply.header("Location", prev.location);
        return reply.code(prev.status).header("Idempotent-Replayed", "true").send(prev.body);
      }
      const res = run();
      idem.save(key.workspace, key.name, idemKey, hash, res);
      if (res.location) reply.header("Location", res.location);
      return reply.code(res.status).send(res.body);
    }
    const res = run();
    if (res.location) reply.header("Location", res.location);
    return reply.code(res.status).send(res.body);
  }

  // ── 상태 확인 (로그인 없이) ──
  route("GET", "/health", async () => ({ ok: true }));

  // ── 프로젝트 ──
  route("GET", "/v1/projects", async (req) => {
    const q = req.query as { includeTrashed?: boolean };
    return {
      items: storeFor(req).listProjects({ includeTrashed: q.includeTrashed }).map(toProject),
    };
  });

  route("POST", "/v1/projects", async (req, reply) =>
    idempotent(req, reply, () => {
      const s = storeFor(req);
      const id = s.createProject(req.who, (req.body as { name: string }).name);
      return {
        status: 201,
        body: toProject(s.getProject(id) as Project),
        location: `/v1/projects/${id}`,
      };
    }),
  );

  route("GET", "/v1/projects/{projectId}", async (req) => {
    const { projectId } = req.params as { projectId: string };
    const p = storeFor(req).getProject(projectId);
    if (!p) throw new NotFound(`프로젝트가 없음: ${projectId}`);
    return toProject(p);
  });

  // ── 할 일 ──
  const sendTask = (req: FastifyRequest, reply: FastifyReply, id: string, opts = {}) => {
    const t = storeFor(req).getTask(id, opts) as Task;
    return reply.header("ETag", etag(t)).send(toTask(t));
  };

  route("GET", "/v1/tasks", async (req) => {
    const q = req.query as {
      projectId?: string;
      milestoneId?: string;
      status?: Status;
      blockedReason?: BlockedReason;
      includeTrashed?: boolean;
      limit: number;
      cursor?: string;
    };
    const after = q.cursor ? decodeCursor<{ c: string; i: string }>(q.cursor) : undefined;
    const rows = storeFor(req).listTasks({
      ...q,
      limit: q.limit + 1,
      after: after ? { createdAt: after.c, id: after.i } : undefined,
    });
    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    return {
      items: page.map(toTask),
      nextCursor:
        rows.length > q.limit && last ? encodeCursor({ c: last.created_at, i: last.id }) : null,
    };
  });

  route("POST", "/v1/tasks", async (req, reply) =>
    idempotent(req, reply, () => {
      const s = storeFor(req);
      const id = s.createTask(req.who, req.body as Parameters<Store["createTask"]>[1]);
      return { status: 201, body: toTask(s.getTask(id) as Task), location: `/v1/tasks/${id}` };
    }),
  );

  route("GET", "/v1/tasks/{taskId}", async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    if (!storeFor(req).getTask(taskId)) throw new NotFound(`할 일이 없음: ${taskId}`);
    return sendTask(req, reply, taskId);
  });

  route("PATCH", "/v1/tasks/{taskId}", async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const ifMatch = req.headers["if-match"];
    storeFor(req).updateTask(
      req.who,
      taskId,
      req.body as TaskPatch,
      expectedVersion(typeof ifMatch === "string" ? ifMatch : undefined),
    );
    return sendTask(req, reply, taskId);
  });

  route("DELETE", "/v1/tasks/{taskId}", async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    storeFor(req).trash(req.who, taskId);
    return reply.code(204).send();
  });

  route("PUT", "/v1/tasks/{taskId}/block", async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const b = req.body as { reason: BlockedReason; heldBy?: string };
    storeFor(req).block(req.who, taskId, b.reason, b.heldBy);
    return sendTask(req, reply, taskId);
  });

  route("DELETE", "/v1/tasks/{taskId}/block", async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    storeFor(req).unblock(req.who, taskId);
    return sendTask(req, reply, taskId);
  });

  route("POST", "/v1/tasks/{taskId}/revive", async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    storeFor(req).revive(req.who, taskId);
    return sendTask(req, reply, taskId);
  });

  // ── 변경 기록 (읽기만) ──
  route("GET", "/v1/changes", async (req) => {
    const q = req.query as { actor?: string; limit: number; cursor?: string };
    const before = q.cursor ? decodeCursor<{ i: number }>(q.cursor) : undefined;
    const rows = storeFor(req).listChanges({
      actor: q.actor,
      limit: q.limit + 1,
      beforeId: before?.i,
    });
    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    return {
      items: page.map(toChange),
      nextCursor: rows.length > q.limit && last ? encodeCursor({ i: last.id }) : null,
    };
  });

  // ── 화면 ──
  if (options.webDir && existsSync(`${options.webDir}/index.html`)) {
    app.register(fastifyStatic, { root: options.webDir, prefix: "/" });
  } else {
    app.get("/", async () => ({ name: "naeil", tagline: TAGLINE }));
  }

  return app;
}
