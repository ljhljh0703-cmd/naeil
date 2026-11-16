// M1-7 바닥 묶음: API 키 종류, 변경 기록 거르기, 모르는 조건 거절, 서버가 주는 오늘, 외부 입력 표시 강제
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createKey, findKey } from "../src/auth.js";
import { openDb } from "../src/db/connection.js";
import { Store } from "../src/db/store.js";
import { expectSpec } from "./spec-check.js";

let db: Database.Database;
let app: FastifyInstance;
let author: string;
let claude: string;
let ci: string;
// 한국 11/16 12:00
let clockAt = new Date("2026-11-16T03:00:00Z");

beforeEach(() => {
  db = openDb(":memory:");
  clockAt = new Date("2026-11-16T03:00:00Z");
  app = buildApp({ db, clock: () => clockAt });
  author = createKey(db, "author");
  claude = createKey(db, "claude");
  ci = createKey(db, "ci-naeil", "me", "ci");
});

async function call(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  specPath: string,
  opts: { url?: string; key?: string; body?: unknown } = {},
) {
  const res = await app.inject({
    method,
    url: opts.url ?? specPath,
    headers: { authorization: `Bearer ${opts.key ?? author}` },
    ...(opts.body !== undefined ? { payload: opts.body as object } : {}),
  });
  expectSpec(res, method, specPath);
  return res;
}

const newProject = async (key = author) =>
  (await call("POST", "/v1/projects", { key, body: { name: "프로젝트" } })).json().id as string;
const newTask = async (projectId: string, extra: Record<string, unknown> = {}, key = author) =>
  (await call("POST", "/v1/tasks", { key, body: { projectId, title: "할 일", ...extra } })).json();

describe("API 키 종류", () => {
  it("이름으로 정하는 기본값: author 사람, claude, codex AI. 밝히면 그 종류", () => {
    expect(findKey(db, author)?.kind).toBe("human");
    expect(findKey(db, claude)?.kind).toBe("ai");
    expect(findKey(db, ci)?.kind).toBe("ci");
    expect(() => createKey(db, "phone", "me", "robot" as never)).toThrow();
  });

  it("변경 기록에 그때 API 키 종류가 남고, 종류로 거를 수 있다", async () => {
    const p = await newProject();
    await newTask(p, {}, claude);
    const all = (await call("GET", "/v1/changes")).json().items;
    expect(all.map((c: { actor: string; actorKind: string }) => [c.actor, c.actorKind])).toEqual([
      ["claude", "ai"],
      ["author", "human"],
    ]);
    const ai = (await call("GET", "/v1/changes", { url: "/v1/changes?actorKind=ai" })).json().items;
    expect(ai).toHaveLength(1);
    expect(ai[0].actor).toBe("claude");
    // 명령줄 등 API 키 없이 바꾼 것은 종류 null
    new Store(db).createProject("cli", "명령줄");
    expect((await call("GET", "/v1/changes")).json().items[0].actorKind).toBeNull();
  });

  it("005 를 올리면 기존 API 키는 사람, claude 와 codex 만 AI. 기존 기록도 그 종류로 채움", () => {
    const old = new Database(":memory:");
    for (const f of [
      "001_init",
      "002_keys_idempotency_session",
      "003_entity_versions",
      "004_trashed_with",
    ])
      old.exec(readFileSync(`migrations/${f}.up.sql`, "utf8"));
    const t = "2026-11-01T00:00:00.000Z";
    for (const [id, name] of [
      ["1", "author"],
      ["2", "codex"],
      ["3", "phone"],
    ])
      old
        .prepare("INSERT INTO api_keys (id, name, key_hash, created_at) VALUES (?, ?, ?, ?)")
        .run(id, name, `h${id}`, t);
    old
      .prepare(
        "INSERT INTO change_log (at, actor, entity, entity_id, action) VALUES (?, 'codex', 'task', 'x', 'create')",
      )
      .run(t);
    old.exec(readFileSync("migrations/005_kinds_today.up.sql", "utf8"));
    expect(old.prepare("SELECT name, kind FROM api_keys ORDER BY id").all()).toEqual([
      { name: "author", kind: "human" },
      { name: "codex", kind: "ai" },
      { name: "phone", kind: "human" },
    ]);
    expect(old.prepare("SELECT actor_kind FROM change_log").get()).toEqual({ actor_kind: "ai" });
  });
});

describe("변경 기록 거르기", () => {
  it("항목 하나, 항목 종류, 날짜로 거른다 (한국 날짜)", async () => {
    const p = await newProject();
    clockAt = new Date("2026-11-17T03:00:00Z"); // 다음 날
    const a = (await newTask(p)).id;
    const b = (await newTask(p)).id;
    const get = async (q: string) =>
      (await call("GET", "/v1/changes", { url: `/v1/changes?${q}` })).json().items as {
        entityId: string;
      }[];
    expect((await get(`entityId=${a}`)).map((c) => c.entityId)).toEqual([a]);
    expect(await get("entity=project")).toHaveLength(1);
    expect(await get("entity=task")).toHaveLength(2);
    expect(await get("since=2026-11-17")).toHaveLength(2);
    expect(await get("until=2026-11-16")).toHaveLength(1);
    expect(await get("since=2026-11-16&until=2026-11-16")).toHaveLength(1);
    expect((await get(`entity=task&entityId=${b}`)).map((c) => c.entityId)).toEqual([b]);
  });

  it("한국 날짜 경계: 한국 0시 직전은 전날", async () => {
    clockAt = new Date("2026-11-16T14:59:59Z"); // 한국 11/16 23:59:59
    await newProject();
    clockAt = new Date("2026-11-16T15:00:00Z"); // 한국 11/17 0시
    await newProject();
    const at = async (q: string) =>
      (await call("GET", "/v1/changes", { url: `/v1/changes?${q}` })).json().items.length;
    expect(await at("until=2026-11-16")).toBe(1);
    expect(await at("since=2026-11-17")).toBe(1);
  });

  it("틀린 날짜와 모르는 종류는 400", async () => {
    for (const q of ["since=2026-13-01", "since=어제", "entity=decision", "actorKind=robot"]) {
      expect((await call("GET", "/v1/changes", { url: `/v1/changes?${q}` })).statusCode).toBe(400);
    }
  });
});

describe("모르는 조건은 거절", () => {
  it("명세서에 없는 조건 이름은 400 (전에는 말없이 200)", async () => {
    for (const url of [
      "/v1/tasks?projectID=x",
      "/v1/projects?trash=1",
      "/v1/changes?who=claude",
      "/v1/today?date=2026-11-16",
    ]) {
      const spec = url.split("?")[0] as string;
      const res = await call("GET", spec, { url });
      expect(res.statusCode, url).toBe(400);
    }
  });

  it("아는 조건은 그대로 됨", async () => {
    expect(
      (await call("GET", "/v1/projects", { url: "/v1/projects?includeTrashed=true" })).statusCode,
    ).toBe(200);
  });
});

describe("외부 입력 표시 강제", () => {
  it("직접 쓴 것이 아니면 보내는 쪽이 빼도 외부 입력", async () => {
    const p = await newProject();
    const t = await newTask(p, { source: "github", sourceRef: "o/r#1", externalText: false });
    expect(t.externalText).toBe(true);
    const u = await newTask(p, { source: "github", sourceRef: "o/r#2" });
    expect(u.externalText).toBe(true);
  });
  it("직접 쓴 것은 밝힌 대로", async () => {
    const p = await newProject();
    expect((await newTask(p)).externalText).toBe(false);
    expect((await newTask(p, { externalText: true })).externalText).toBe(true);
  });
});

describe("서버가 주는 오늘", () => {
  it("지금 할 것, 내가 정할 것, 마감 가까운 것을 서버가 계산", async () => {
    const p = await newProject();
    const old = (await newTask(p, { title: "오래된 일" })).id;
    clockAt = new Date("2026-11-16T04:00:00Z");
    const soon = (await newTask(p, { title: "마감 가까운 일", dueAt: "2026-11-18T23:59:59+09:00" }))
      .id;
    const decide = (await newTask(p, { title: "정할 일" })).id;
    await call("PUT", "/v1/tasks/{taskId}/block", {
      url: `/v1/tasks/${decide}/block`,
      body: { reason: "my_decision" },
    });
    const today = (await call("GET", "/v1/today")).json();
    expect(today.day).toBe("2026-11-16");
    expect(today.now.id).toBe(soon);
    expect(today.waitingOnMe.map((t: { id: string }) => t.id)).toEqual([decide]);
    expect(today.dueSoon.map((t: { id: string }) => t.id)).toEqual([soon]);
    expect(today.now.id).not.toBe(old);
  });

  it("고정과 건너뛰기는 서버에 날짜별로 남아 다른 기기와 AI 도 같은 것을 봄", async () => {
    const p = await newProject();
    const a = (await newTask(p, { title: "가" })).id;
    clockAt = new Date("2026-11-16T03:00:01Z");
    const b = (await newTask(p, { title: "나" })).id;
    expect((await call("GET", "/v1/today")).json().now.id).toBe(a);
    const pinned = await call("PUT", "/v1/today", { body: { pinnedTaskId: b, skipped: [] } });
    expect(pinned.json().now.id).toBe(b);
    // AI API 키로 읽어도 같은 것
    expect((await call("GET", "/v1/today", { key: claude })).json().now.id).toBe(b);
    const skipped = await call("PUT", "/v1/today", {
      body: { pinnedTaskId: null, skipped: [a, a] },
    });
    expect(skipped.json()).toMatchObject({ pinnedTaskId: null, skipped: [a] });
    expect(skipped.json().now.id).toBe(b);
    // 다음 날은 처음부터
    clockAt = new Date("2026-11-17T03:00:00Z");
    expect((await call("GET", "/v1/today")).json()).toMatchObject({
      day: "2026-11-17",
      skipped: [],
      pinnedTaskId: null,
    });
    // 날짜를 밝혀 지난 날을 읽을 수 있음
    expect(
      (await call("GET", "/v1/today", { url: "/v1/today?day=2026-11-16" })).json().skipped,
    ).toEqual([a]);
  });

  it("틀린 날짜와 모르는 본문 칸은 400, 할 일이 없으면 지금 할 것 null", async () => {
    expect((await call("GET", "/v1/today", { url: "/v1/today?day=11-16" })).statusCode).toBe(400);
    expect(
      (await call("PUT", "/v1/today", { body: { pinnedTaskId: null, skipped: [], x: 1 } }))
        .statusCode,
    ).toBe(400);
    expect((await call("GET", "/v1/today")).json().now).toBeNull();
  });

  it("다른 작업 공간의 고정은 보이지 않음", async () => {
    new Store(db, "other").setDay("2026-11-16", { pinnedTaskId: "x", skipped: ["y"] });
    expect((await call("GET", "/v1/today")).json()).toMatchObject({
      pinnedTaskId: null,
      skipped: [],
    });
  });
});
