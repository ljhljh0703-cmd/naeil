/// <reference types="vite/client" />
// 시연판: 서버 없이 브라우저 안에서 도는 작업판. 저장소(src/db/store.ts)와 바깥 모양(src/shape.ts)은
// 진짜 서버와 같은 파일을 쓰고, 주소를 저장소 기능으로 잇는 부분만 여기서 한다. 새로 고치면 처음 자료로
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import { type BlockedReason, Store, type TaskPatch } from "../../../src/db/store.js";
import {
  AppError,
  BadInput,
  NotFound,
  RuleViolation,
  VersionMismatch,
} from "../../../src/errors.js";
import { buildHandoff } from "../../../src/handoff.js";
import {
  buildToday,
  toChange,
  toDecision,
  toMilestone,
  toProject,
  toTask,
} from "../../../src/shape.js";
import { kstDate } from "../../../src/today.js";
import type { DemoCall, DemoReply } from "../demo-hook.js";
import { fillSample } from "./sample.js";
import { BrowserDb } from "./sqlite.js";

export const isDemo = true;

const ups = import.meta.glob("../../../migrations/*.up.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const me = { actor: "author", kind: "human" as const, session: null };

let ready: Promise<Store> | null = null;

async function boot(): Promise<Store> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new BrowserDb(new SQL.Database());
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  for (const file of Object.keys(ups).sort()) db.exec(ups[file] as string);
  fillSample(db, new Date());
  return new Store(db as never, "me", () => new Date());
}

// 화면이 보내는 몸통 칸을 한데 모은 모양 (주소마다 쓰는 칸만 읽음)
type Body = {
  name: string;
  dueAt?: string | null;
  answer: string;
  note?: string | null;
  enabled: boolean;
  reason?: string;
  heldBy?: string;
  pinnedTaskId: string | null;
  skipped: string[];
  projectId: string;
  title: string;
  milestoneId?: string;
};

type Handler = (
  s: Store,
  id: string,
  q: URLSearchParams,
  b: Body,
  h: Record<string, string>,
) => unknown;

const must = <T>(x: T | null | undefined): T => {
  if (x == null) throw new NotFound("없음");
  return x;
};

const version = (h: Record<string, string>) => {
  const v = h["if-match"]?.match(/^"v(\d+)"$/)?.[1];
  return v ? Number(v) : undefined;
};

const routes: [string, RegExp, Handler][] = [
  [
    "GET",
    /^\/v1\/projects$/,
    (s, _id, q) => ({
      items: s.listProjects({ includeTrashed: q.get("includeTrashed") === "true" }).map(toProject),
    }),
  ],
  [
    "POST",
    /^\/v1\/projects$/,
    (s, _id, _q, b) => toProject(must(s.getProject(s.createProject(me, b.name)))),
  ],
  ["DELETE", /^\/v1\/projects\/([^/]+)$/, (s, id) => void s.trashProject(me, id)],
  [
    "POST",
    /^\/v1\/projects\/([^/]+)\/revive$/,
    (s, id) => {
      s.reviveProject(me, id);
      return toProject(must(s.getProject(id)));
    },
  ],
  [
    "GET",
    /^\/v1\/projects\/([^/]+)\/milestones$/,
    (s, id) => ({
      items: s.listMilestones(id).map(toMilestone),
    }),
  ],
  [
    "POST",
    /^\/v1\/projects\/([^/]+)\/milestones$/,
    (s, id, _q, b) => toMilestone(must(s.getMilestone(s.createMilestone(me, id, b.name, b.dueAt)))),
  ],
  [
    "PATCH",
    /^\/v1\/milestones\/([^/]+)$/,
    (s, id, _q, b, h) => {
      const before = s.getMilestone(id);
      if (!before) throw new NotFound("마일스톤이 없음");
      const v = version(h);
      if (v !== undefined && v !== before.version) throw new VersionMismatch();
      s.updateMilestone(me, id, b, v);
      return toMilestone(must(s.getMilestone(id)));
    },
  ],
  ["DELETE", /^\/v1\/milestones\/([^/]+)$/, (s, id) => void s.trashMilestone(me, id)],
  ["GET", /^\/v1\/tasks$/, (s) => ({ items: s.listTasks().map(toTask), nextCursor: null })],
  [
    "POST",
    /^\/v1\/tasks$/,
    (s, _id, _q, b) =>
      toTask(
        must(
          s.getTask(
            s.createTask(me, {
              projectId: b.projectId,
              title: b.title,
              milestoneId: b.milestoneId,
              dueAt: b.dueAt ?? undefined,
            }),
          ),
        ),
      ),
  ],
  [
    "PATCH",
    /^\/v1\/tasks\/([^/]+)$/,
    (s, id, _q, b) => {
      s.updateTask(me, id, b as TaskPatch);
      return toTask(must(s.getTask(id)));
    },
  ],
  ["DELETE", /^\/v1\/tasks\/([^/]+)$/, (s, id) => void s.trash(me, id)],
  [
    "PUT",
    /^\/v1\/tasks\/([^/]+)\/block$/,
    (s, id, _q, b) => {
      s.block(me, id, b.reason as BlockedReason, b.heldBy);
      return toTask(must(s.getTask(id)));
    },
  ],
  [
    "DELETE",
    /^\/v1\/tasks\/([^/]+)\/block$/,
    (s, id) => {
      s.unblock(me, id);
      return toTask(must(s.getTask(id)));
    },
  ],
  [
    "POST",
    /^\/v1\/tasks\/([^/]+)\/revive$/,
    (s, id) => {
      s.revive(me, id);
      return toTask(must(s.getTask(id)));
    },
  ],
  [
    "GET",
    /^\/v1\/changes$/,
    (s, _id, q) => ({
      items: s.listChanges({ limit: Number(q.get("limit") ?? 200) }).map(toChange),
      nextCursor: null,
    }),
  ],
  ["GET", /^\/v1\/today$/, (s) => buildToday(s, kstDate(new Date()), new Date())],
  [
    "PUT",
    /^\/v1\/today$/,
    (s, _id, _q, b) => {
      const day = kstDate(new Date());
      s.setDay(day, b);
      return buildToday(s, day, new Date());
    },
  ],
  ["GET", /^\/v1\/decisions$/, (s) => ({ items: s.listDecisions({ limit: 200 }).map(toDecision) })],
  [
    "POST",
    /^\/v1\/tasks\/([^/]+)\/decision\/answer$/,
    (s, id, _q, b) => {
      s.answerDecision(me, id, b.answer, b.note);
      return toDecision(must(s.getDecision(id)));
    },
  ],
  [
    "GET",
    /^\/v1\/handoff$/,
    (s, _id, q) => {
      if (!s.isOn("handoff")) throw new RuleViolation("switch-off", "이어하기 스위치가 꺼져 있음");
      const scope = Object.fromEntries(q.entries());
      const out = buildHandoff(s, scope, new Date());
      if (!out) throw new NotFound("대상이 없음");
      return out;
    },
  ],
  [
    "GET",
    /^\/v1\/usage$/,
    (s) => {
      const until = kstDate(new Date());
      const since = kstDate(new Date(Date.parse(`${until}T00:00:00+09:00`) - 6 * 86_400_000));
      return { items: s.usage(since, until) };
    },
  ],
  ["GET", /^\/v1\/settings$/, (s) => ({ items: s.listSettings() })],
  ["PUT", /^\/v1\/settings\/([^/]+)$/, (s, id, _q, b) => s.setSetting(me, id, b.enabled, b.reason)],
];

export const demoCall: DemoCall = async (method, url, body, headers): Promise<DemoReply> => {
  ready ??= boot();
  const s = await ready;
  const u = new URL(url, "http://demo");
  for (const [verb, re, fn] of routes) {
    const m = verb === method ? u.pathname.match(re) : null;
    if (!m) continue;
    try {
      s.markOpened(kstDate(new Date()));
      const out = fn(s, m[1] ?? "", u.searchParams, (body ?? {}) as Body, headers);
      return out === undefined ? { status: 204, json: null } : { status: 200, json: out };
    } catch (err) {
      if (err instanceof AppError) {
        return { status: err.status, json: { title: err.title, detail: err.message } };
      }
      console.error(err);
      return { status: 500, json: null };
    }
  }
  const bad = new BadInput(`시연판에 없는 주소: ${method} ${u.pathname}`);
  return { status: 404, json: { title: bad.title, detail: bad.message } };
};
