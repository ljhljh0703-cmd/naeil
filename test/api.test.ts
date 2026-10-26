import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createKey, revokeKey } from "../src/auth.js";
import { openDb } from "../src/db/connection.js";
import { Store } from "../src/db/store.js";
import { toFastifyPath } from "../src/spec.js";
import { expectSpec, specOperations } from "./spec-check.js";

// 명세서의 19개 동작을 모두 구현한다.
const NOT_YET: string[] = [];

let db: Database.Database;
let app: FastifyInstance;
let authorKey: string;
let claudeKey: string;

const H = (key: string, extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${key}`,
  ...extra,
});

async function call(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  specPath: string,
  opts: { url?: string; key?: string; headers?: Record<string, string>; body?: unknown } = {},
) {
  const res = await app.inject({
    method,
    url: opts.url ?? specPath,
    headers: opts.key === "" ? opts.headers : H(opts.key ?? authorKey, opts.headers),
    ...(opts.body !== undefined ? { payload: opts.body as object } : {}),
  });
  expectSpec(res, method, specPath); // 모든 응답을 명세서와 대조
  return res;
}

async function newProject(name = "내일은내일") {
  const res = await call("POST", "/v1/projects", { body: { name } });
  return res.json().id as string;
}

async function newTask(projectId: string, extra: Record<string, unknown> = {}) {
  const res = await call("POST", "/v1/tasks", { body: { projectId, title: "할 일", ...extra } });
  return res.json().id as string;
}

beforeEach(() => {
  db = openDb(":memory:");
  app = buildApp({ db });
  authorKey = createKey(db, "author");
  claudeKey = createKey(db, "claude");
});

describe("명세서와 코드", () => {
  it("명세서의 동작은 전부 만들었거나 「아직」 목록에 있다", () => {
    const missing = specOperations()
      .filter((o) => !NOT_YET.includes(`${o.method} ${o.path}`))
      .filter((o) => !app.hasRoute({ method: o.method as "GET", url: toFastifyPath(o.path) }));
    expect(missing).toEqual([]);
  });

  it("「아직」 목록에 있는데 만들어진 것은 없다 (목록 정리)", () => {
    const done = NOT_YET.filter((s) => {
      const [method, path] = s.split(" ") as [string, string];
      return app.hasRoute({ method: method as "GET", url: toFastifyPath(path) });
    });
    expect(done).toEqual([]);
  });
});

describe("출입증", () => {
  it("상태 확인은 출입증 없이 열린다", async () => {
    const res = await call("GET", "/health", { key: "" });
    expect(res.json()).toEqual({ ok: true });
  });

  it("출입증이 없거나 틀리면 401, 오류 모양은 하나", async () => {
    const none = await call("GET", "/v1/tasks", { key: "" });
    expect(none.statusCode).toBe(401);
    expect(none.headers["www-authenticate"]).toBe("Bearer");
    const wrong = await call("GET", "/v1/tasks", { key: "nk_틀림" });
    expect(wrong.statusCode).toBe(401);
  });

  it("주소 글자를 바꿔 써도 출입증 검사를 건너뛰지 못한다", async () => {
    for (const url of ["/%761/tasks", "/v%31/tasks", "/v1/%74asks"]) {
      const res = await app.inject({ method: "GET", url });
      expect([401, 404], url).toContain(res.statusCode);
    }
  });

  it("폐기한 출입증은 바로 막힌다", async () => {
    revokeKey(db, "claude");
    const res = await call("GET", "/v1/tasks", { key: claudeKey });
    expect(res.statusCode).toBe(401);
  });

  it("「누가」는 출입증이 정하고, 세션 이름표는 덧붙는다", async () => {
    const p = await newProject();
    await call("POST", "/v1/tasks", {
      key: claudeKey,
      headers: { "x-naeil-session": "session-3", "x-naeil-actor": "author" },
      body: { projectId: p, title: "AI가 만든 일" },
    });
    const ch = await call("GET", "/v1/changes", { url: "/v1/changes?limit=1" });
    expect(ch.json().items[0]).toMatchObject({
      actor: "claude",
      session: "session-3",
      action: "create",
    });
  });

  it("세션 이름표 모양이 틀리면 400", async () => {
    const p = await newProject();
    const res = await call("POST", "/v1/tasks", {
      headers: { "x-naeil-session": "Session 3!" },
      body: { projectId: p, title: "x" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("할 일 만들기·보기", () => {
  it("만들면 201 · 새 주소 · 기본값", async () => {
    const p = await newProject();
    const res = await call("POST", "/v1/tasks", { body: { projectId: p, title: "서버 띄우기" } });
    expect(res.statusCode).toBe(201);
    expect(res.headers.location).toBe(`/v1/tasks/${res.json().id}`);
    expect(res.json()).toMatchObject({ status: "todo", source: "direct", externalText: false });
  });

  it("명세서에 없는 칸을 보내면 지우지 않고 거절한다", async () => {
    const p = await newProject();
    const res = await call("POST", "/v1/tasks", {
      body: { projectId: p, title: "x", owner: "me" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
  });

  it("없는 프로젝트에 만들면 400", async () => {
    const res = await call("POST", "/v1/tasks", {
      body: { projectId: "00000000-0000-4000-8000-000000000000", title: "x" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("같은 이슈를 두 번 가져오면 409", async () => {
    const p = await newProject();
    const body = {
      projectId: p,
      title: "제보",
      source: "github",
      sourceRef: "a/b#1",
      externalText: true,
    };
    await call("POST", "/v1/tasks", { body });
    const again = await call("POST", "/v1/tasks", { body });
    expect(again.statusCode).toBe(409);
  });

  it("하나 보기는 판 표시(ETag)를 준다 · 없는 번호는 404", async () => {
    const id = await newTask(await newProject());
    const res = await call("GET", "/v1/tasks/{taskId}", { url: `/v1/tasks/${id}` });
    expect(res.headers.etag).toBe('"v1"');
    const none = await call("GET", "/v1/tasks/{taskId}", {
      url: "/v1/tasks/00000000-0000-4000-8000-000000000000",
    });
    expect(none.statusCode).toBe(404);
  });

  it("번호 모양이 틀리면 400", async () => {
    const res = await call("GET", "/v1/tasks/{taskId}", { url: "/v1/tasks/abc" });
    expect(res.statusCode).toBe(400);
  });
});

describe("같은 요청 두 번 막기", () => {
  it("같은 열쇠 + 같은 내용 → 하나만 생기고 처음 응답을 다시 준다", async () => {
    const p = await newProject();
    const opts = {
      headers: { "idempotency-key": "retry-0001" },
      body: { projectId: p, title: "한 번만" },
    };
    const a = await call("POST", "/v1/tasks", opts);
    const b = await call("POST", "/v1/tasks", opts);
    expect(b.statusCode).toBe(201);
    expect(b.headers["idempotent-replayed"]).toBe("true");
    expect(b.json().id).toBe(a.json().id);
    const list = await call("GET", "/v1/tasks");
    expect(list.json().items).toHaveLength(1);
  });

  it("같은 열쇠 + 다른 내용 → 422", async () => {
    const p = await newProject();
    await call("POST", "/v1/tasks", {
      headers: { "idempotency-key": "retry-0002" },
      body: { projectId: p, title: "A" },
    });
    const b = await call("POST", "/v1/tasks", {
      headers: { "idempotency-key": "retry-0002" },
      body: { projectId: p, title: "B" },
    });
    expect(b.statusCode).toBe(422);
  });

  it("출입증이 다르면 같은 열쇠도 따로 센다", async () => {
    const p = await newProject();
    const opts = {
      headers: { "idempotency-key": "retry-0003" },
      body: { projectId: p, title: "각자" },
    };
    await call("POST", "/v1/tasks", opts);
    await call("POST", "/v1/tasks", { ...opts, key: claudeKey });
    const list = await call("GET", "/v1/tasks");
    expect(list.json().items).toHaveLength(2);
  });

  it("24시간이 지나면 열쇠를 잊는다", async () => {
    let now = new Date("2026-10-26T00:00:00Z");
    const timed = buildApp({ db, clock: () => now });
    const p = (
      await timed.inject({
        method: "POST",
        url: "/v1/projects",
        headers: H(authorKey),
        payload: { name: "p" },
      })
    ).json().id;
    const send = () =>
      timed.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: H(authorKey, { "idempotency-key": "retry-0004" }),
        payload: { projectId: p, title: "x" },
      });
    const a = await send();
    now = new Date("2026-10-27T00:00:01Z");
    const b = await send();
    expect(b.json().id).not.toBe(a.json().id);
  });
});

describe("고치기·덮어쓰기 막기", () => {
  it("If-Match 없이 고치면 그냥 고친다 · 판 번호가 오른다", async () => {
    const id = await newTask(await newProject());
    const res = await call("PATCH", "/v1/tasks/{taskId}", {
      url: `/v1/tasks/${id}`,
      body: { status: "doing" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("doing");
    expect(res.headers.etag).toBe('"v2"');
  });

  it("읽은 뒤 다른 세션이 먼저 고쳤으면 412", async () => {
    const id = await newTask(await newProject());
    const url = `/v1/tasks/${id}`;
    const read = await call("GET", "/v1/tasks/{taskId}", { url });
    const tag = read.headers.etag as string;
    await call("PATCH", "/v1/tasks/{taskId}", {
      url,
      key: claudeKey,
      body: { title: "Claude가 먼저" },
    });
    const late = await call("PATCH", "/v1/tasks/{taskId}", {
      url,
      headers: { "if-match": tag },
      body: { title: "늦음" },
    });
    expect(late.statusCode).toBe(412);
    const now = await call("GET", "/v1/tasks/{taskId}", { url });
    expect(now.json().title).toBe("Claude가 먼저");
  });

  it("맞는 판 표시를 보내면 고쳐진다", async () => {
    const id = await newTask(await newProject());
    const url = `/v1/tasks/${id}`;
    const res = await call("PATCH", "/v1/tasks/{taskId}", {
      url,
      headers: { "if-match": '"v1"' },
      body: { title: "새 제목" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("빈 고치기는 400", async () => {
    const id = await newTask(await newProject());
    const res = await call("PATCH", "/v1/tasks/{taskId}", { url: `/v1/tasks/${id}`, body: {} });
    expect(res.statusCode).toBe(400);
  });
});

describe("멈춤·휴지통·되살리기", () => {
  it("끝난 일에 멈춤을 걸면 422", async () => {
    const id = await newTask(await newProject());
    await call("PATCH", "/v1/tasks/{taskId}", { url: `/v1/tasks/${id}`, body: { status: "done" } });
    const res = await call("PUT", "/v1/tasks/{taskId}/block", {
      url: `/v1/tasks/${id}/block`,
      body: { reason: "tech" },
    });
    expect(res.statusCode).toBe(422);
  });

  it("멈추고 풀기 · 「내가 정할 것」 거르기", async () => {
    const p = await newProject();
    const id = await newTask(p);
    await newTask(p);
    const b = await call("PUT", "/v1/tasks/{taskId}/block", {
      url: `/v1/tasks/${id}/block`,
      body: { reason: "my_decision" },
    });
    expect(b.json().blockedReason).toBe("my_decision");
    const mine = await call("GET", "/v1/tasks", { url: "/v1/tasks?blockedReason=my_decision" });
    expect(mine.json().items.map((t: { id: string }) => t.id)).toEqual([id]);
    const u = await call("DELETE", "/v1/tasks/{taskId}/block", { url: `/v1/tasks/${id}/block` });
    expect(u.json().blockedReason).toBeNull();
  });

  it("AI가 하는 중일 때만 잡은 세션", async () => {
    const id = await newTask(await newProject());
    const bad = await call("PUT", "/v1/tasks/{taskId}/block", {
      url: `/v1/tasks/${id}/block`,
      body: { reason: "external", heldBy: "codex" },
    });
    expect(bad.statusCode).toBe(422);
    const ok = await call("PUT", "/v1/tasks/{taskId}/block", {
      url: `/v1/tasks/${id}/block`,
      body: { reason: "ai_working", heldBy: "codex" },
    });
    expect(ok.json().heldBy).toBe("codex");
  });

  it("휴지통 → 목록에서 빠짐 → 되살리기", async () => {
    const id = await newTask(await newProject());
    const del = await call("DELETE", "/v1/tasks/{taskId}", { url: `/v1/tasks/${id}` });
    expect(del.statusCode).toBe(204);
    expect((await call("GET", "/v1/tasks")).json().items).toHaveLength(0);
    expect(
      (await call("GET", "/v1/tasks", { url: "/v1/tasks?includeTrashed=true" })).json().items,
    ).toHaveLength(1);
    const again = await call("DELETE", "/v1/tasks/{taskId}", { url: `/v1/tasks/${id}` });
    expect(again.statusCode).toBe(404);
    const rev = await call("POST", "/v1/tasks/{taskId}/revive", { url: `/v1/tasks/${id}/revive` });
    expect(rev.json().deletedAt).toBeNull();
  });
});

describe("목록 나누기 (커서)", () => {
  it("5개를 2개씩 받으면 3번에 끝나고, 겹치거나 빠지는 게 없다", async () => {
    const p = await newProject();
    const made = [];
    for (let i = 0; i < 5; i++) made.push(await newTask(p, { title: `일 ${i}` }));
    const seen: string[] = [];
    let url = "/v1/tasks?limit=2";
    let pages = 0;
    for (;;) {
      const res = await call("GET", "/v1/tasks", { url });
      pages++;
      seen.push(...res.json().items.map((t: { id: string }) => t.id));
      const next = res.json().nextCursor;
      if (!next) break;
      url = `/v1/tasks?limit=2&cursor=${next}`;
    }
    expect(pages).toBe(3);
    expect(seen.sort()).toEqual(made.sort());
  });

  it("커서가 망가졌으면 400", async () => {
    const res = await call("GET", "/v1/tasks", { url: "/v1/tasks?cursor=%%%" });
    expect(res.statusCode).toBe(400);
  });

  it("변경 기록도 최신부터 커서로", async () => {
    const p = await newProject();
    await newTask(p);
    await newTask(p);
    const first = await call("GET", "/v1/changes", { url: "/v1/changes?limit=2" });
    expect(first.json().items).toHaveLength(2);
    const second = await call("GET", "/v1/changes", {
      url: `/v1/changes?limit=2&cursor=${first.json().nextCursor}`,
    });
    expect(second.json().items.map((c: { entity: string }) => c.entity)).toEqual(["project"]);
    expect(second.json().nextCursor).toBeNull();
  });
});

describe("검토에서 나온 구멍 (2026-10-26)", () => {
  it("고쳐 쓴 커서는 서버 오류(500)가 아닌 400", async () => {
    const bad = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    for (const c of [bad({ c: {}, i: "x" }), bad(1), bad({ i: "zzz" })]) {
      const res = await call("GET", "/v1/tasks", { url: `/v1/tasks?cursor=${c}` });
      expect(res.statusCode, c).toBe(400);
    }
    const ch = await call("GET", "/v1/changes", { url: `/v1/changes?cursor=${bad({ i: true })}` });
    expect(ch.statusCode).toBe(400);
  });

  it("빈 잡은 세션은 400", async () => {
    const id = await newTask(await newProject());
    const res = await call("PUT", "/v1/tasks/{taskId}/block", {
      url: `/v1/tasks/${id}/block`,
      body: { reason: "external", heldBy: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("마감 시각은 세계 표준시로 바꿔 저장", async () => {
    const p = await newProject();
    const res = await call("POST", "/v1/tasks", {
      body: { projectId: p, title: "x", dueAt: "2026-10-25T05:00:00+09:00" },
    });
    expect(res.json().dueAt).toBe("2026-10-24T20:00:00.000Z");
  });

  it("본문의 형이 틀리면 바꾸지 않고 거절", async () => {
    const p = await newProject();
    for (const body of [
      { projectId: p, title: 123 },
      { projectId: p, title: ["배열"] },
      { projectId: p, title: "x", externalText: "true" },
    ]) {
      const res = await call("POST", "/v1/tasks", { body });
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
    }
  });

  it("If-Match: 약한 표시는 안 맞음, 여러 개 중 하나 맞으면 통과", async () => {
    const id = await newTask(await newProject());
    const url = `/v1/tasks/${id}`;
    const weak = await call("PATCH", "/v1/tasks/{taskId}", {
      url,
      headers: { "if-match": 'W/"v1"' },
      body: { title: "a" },
    });
    expect(weak.statusCode).toBe(412);
    const list = await call("PATCH", "/v1/tasks/{taskId}", {
      url,
      headers: { "if-match": '"v9", "v1"' },
      body: { title: "b" },
    });
    expect(list.statusCode).toBe(200);
  });

  it("같은 열쇠로 칸 순서만 바꿔 다시 보내면 처음 응답", async () => {
    const p = await newProject();
    const h = { "idempotency-key": "retry-order" };
    const a = await call("POST", "/v1/tasks", {
      headers: h,
      body: { projectId: p, title: "순서" },
    });
    const b = await call("POST", "/v1/tasks", {
      headers: h,
      body: { title: "순서", projectId: p },
    });
    expect(b.statusCode).toBe(201);
    expect(b.json().id).toBe(a.json().id);
  });

  it("서버 틀이 내는 오류도 종류 이름이 맞다 (415)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: { ...H(authorKey), "content-type": "application/xml" },
      payload: "x",
    });
    expect(res.statusCode).toBe(415);
    expect(res.json().type).toContain("#unsupported-type");
  });

  it("멈춘 게 없는데 풀거나, 살아 있는 걸 되살리면 아무것도 안 바뀜", async () => {
    const id = await newTask(await newProject());
    await call("DELETE", "/v1/tasks/{taskId}/block", { url: `/v1/tasks/${id}/block` });
    await call("POST", "/v1/tasks/{taskId}/revive", { url: `/v1/tasks/${id}/revive` });
    const res = await call("GET", "/v1/tasks/{taskId}", { url: `/v1/tasks/${id}` });
    expect(res.headers.etag).toBe('"v1"');
  });
});

describe("프로젝트", () => {
  it("만들기·목록·하나 보기", async () => {
    const id = await newProject("젤리 패닉");
    const list = await call("GET", "/v1/projects");
    expect(list.json().items.map((p: { name: string }) => p.name)).toEqual(["젤리 패닉"]);
    const one = await call("GET", "/v1/projects/{projectId}", { url: `/v1/projects/${id}` });
    expect(one.json().name).toBe("젤리 패닉");
  });
});

describe("프로젝트·마일스톤", () => {
  const missingId = "00000000-0000-4000-8000-000000000000";
  const projectPath = "/v1/projects/{projectId}";
  const listPath = "/v1/projects/{projectId}/milestones";
  const milestonePath = "/v1/milestones/{milestoneId}";
  const fixture = () => {
    const store = new Store(db);
    const projectId = store.createProject("fixture", "샘플 프로젝트");
    const milestoneId = store.createMilestone("fixture", projectId, "샘플 목표");
    return { store, projectId, milestoneId };
  };
  const changesFor = (id: string) =>
    db.prepare("SELECT * FROM change_log WHERE entity_id = ? ORDER BY id").all(id) as {
      entity: string;
      action: string;
      actor: string;
      session: string | null;
    }[];

  it("프로젝트 PATCH: 이름을 바꾸고 판 표시·변경 기록 한 줄을 돌려준다", async () => {
    const { projectId } = fixture();
    const res = await call("PATCH", projectPath, {
      url: `/v1/projects/${projectId}`,
      body: { name: "바뀐 프로젝트" },
      headers: { "x-naeil-session": "session-2" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("바뀐 프로젝트");
    expect(res.headers.etag).toBe('"v2"');
    expect(changesFor(projectId)).toHaveLength(2);
    expect(changesFor(projectId).at(-1)).toMatchObject({
      entity: "project",
      action: "update",
      actor: "author",
      session: "session-2",
    });
  });

  it("프로젝트 PATCH: 빈 본문·잘못된 이름·추가 칸은 400이며 바뀌지 않는다", async () => {
    const { store, projectId } = fixture();
    const before = store.getProject(projectId);
    for (const body of [
      {},
      { name: "" },
      { name: 123 },
      { name: "x".repeat(101) },
      { name: "x", extra: true },
    ]) {
      const res = await call("PATCH", projectPath, { url: `/v1/projects/${projectId}`, body });
      expect(res.statusCode).toBe(400);
    }
    expect(store.getProject(projectId)).toEqual(before);
    expect(changesFor(projectId)).toHaveLength(1);
  });

  it("프로젝트 PATCH: GET에서 읽은 판으로 수정하며 오래된·약한 판은 412", async () => {
    const { projectId } = fixture();
    const url = `/v1/projects/${projectId}`;
    const read = await call("GET", projectPath, { url });
    expect(read.headers.etag).toBe('"v1"');
    const ok = await call("PATCH", projectPath, {
      url,
      body: { name: "둘째" },
      headers: { "if-match": read.headers.etag as string },
    });
    expect(ok.statusCode).toBe(200);
    for (const tag of ['"v1"', 'W/"v2"']) {
      const bad = await call("PATCH", projectPath, {
        url,
        body: { name: "덮어쓰기" },
        headers: { "if-match": tag },
      });
      expect(bad.statusCode).toBe(412);
    }
    const multi = await call("PATCH", projectPath, {
      url,
      body: { name: "셋째" },
      headers: { "if-match": '"old", "v2"' },
    });
    expect(multi.statusCode).toBe(200);
    const star = await call("PATCH", projectPath, {
      url,
      body: { name: "넷째" },
      headers: { "if-match": "*" },
    });
    expect(star.statusCode).toBe(200);
    expect(changesFor(projectId)).toHaveLength(4);
  });

  it("프로젝트 DELETE: 프로젝트만 휴지통에 넣고 하위 행은 보존한다", async () => {
    const { store, projectId, milestoneId } = fixture();
    const taskId = store.createTask("fixture", { projectId, milestoneId, title: "샘플 할 일" });
    const beforeTask = store.getTask(taskId);
    const beforeMilestone = db.prepare("SELECT * FROM milestones WHERE id = ?").get(milestoneId);
    const res = await call("DELETE", projectPath, { url: `/v1/projects/${projectId}` });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    expect(store.getProject(projectId)).toBeUndefined();
    expect(store.getProject(projectId, { includeTrashed: true })?.deleted_at).toBeTruthy();
    expect(store.getTask(taskId)).toEqual(beforeTask);
    expect(db.prepare("SELECT * FROM milestones WHERE id = ?").get(milestoneId)).toEqual(
      beforeMilestone,
    );
    expect((await call("GET", "/v1/projects")).json().items).toEqual([]);
    expect(
      (await call("GET", "/v1/projects", { url: "/v1/projects?includeTrashed=true" })).json().items,
    ).toHaveLength(1);
    expect(changesFor(projectId).at(-1)).toMatchObject({ entity: "project", action: "trash" });
    expect(changesFor(projectId)).toHaveLength(2);
  });

  it("프로젝트 DELETE·PATCH: 없는 번호와 휴지통 번호는 404", async () => {
    const { projectId } = fixture();
    expect(
      (await call("DELETE", projectPath, { url: `/v1/projects/${projectId}` })).statusCode,
    ).toBe(204);
    for (const id of [missingId, projectId]) {
      expect((await call("DELETE", projectPath, { url: `/v1/projects/${id}` })).statusCode).toBe(
        404,
      );
      expect(
        (await call("PATCH", projectPath, { url: `/v1/projects/${id}`, body: { name: "x" } }))
          .statusCode,
      ).toBe(404);
    }
    expect(changesFor(projectId)).toHaveLength(2);
  });

  it("마일스톤 GET: 해당 프로젝트만 마감 순서로, 마감 없는 것은 뒤로", async () => {
    const { store, projectId, milestoneId } = fixture();
    const later = store.createMilestone("fixture", projectId, "나중", "2026-11-03T00:00:00Z");
    const earlier = store.createMilestone(
      "fixture",
      projectId,
      "먼저",
      "2026-11-02T08:00:00+09:00",
    );
    const otherProject = store.createProject("fixture", "다른 프로젝트");
    store.createMilestone("fixture", otherProject, "다른 목표", "2026-11-01T00:00:00Z");
    const res = await call("GET", listPath, { url: `/v1/projects/${projectId}/milestones` });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((m: { id: string }) => m.id)).toEqual([
      earlier,
      later,
      milestoneId,
    ]);
    expect(res.json().items.every((m: { etag: string }) => m.etag === '"v1"')).toBe(true);
  });

  it("마일스톤 GET: 없는 프로젝트는 404, 틀린 번호는 400", async () => {
    expect(
      (await call("GET", listPath, { url: `/v1/projects/${missingId}/milestones` })).statusCode,
    ).toBe(404);
    expect(
      (await call("GET", listPath, { url: "/v1/projects/not-uuid/milestones" })).statusCode,
    ).toBe(400);
  });

  it("마일스톤 POST: 201, UTC 마감, 생성 기록 한 줄", async () => {
    const { projectId } = fixture();
    const res = await call("POST", listPath, {
      url: `/v1/projects/${projectId}/milestones`,
      body: { name: "새 목표", dueAt: "2026-11-02T08:00:00+09:00" },
      headers: { "x-naeil-session": "session-2" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      projectId,
      name: "새 목표",
      dueAt: "2026-11-01T23:00:00.000Z",
      deletedAt: null,
      etag: '"v1"',
    });
    expect(changesFor(res.json().id)).toHaveLength(1);
    expect(changesFor(res.json().id)[0]).toMatchObject({
      entity: "milestone",
      action: "create",
      actor: "author",
      session: "session-2",
    });
  });

  it("마일스톤 POST: 마감 생략과 null 모두 허용한다", async () => {
    const { projectId } = fixture();
    for (const body of [{ name: "생략" }, { name: "없음", dueAt: null }]) {
      const res = await call("POST", listPath, {
        url: `/v1/projects/${projectId}/milestones`,
        body,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().dueAt).toBeNull();
    }
  });

  it("마일스톤 POST: 잘못된 본문은 400이고 행이나 기록을 만들지 않는다", async () => {
    const { projectId } = fixture();
    const count = () => db.prepare("SELECT count(*) AS n FROM change_log").get();
    const before = count();
    for (const body of [
      {},
      { name: "" },
      { name: 123 },
      { name: "x", extra: true },
      { name: "x", dueAt: "not-a-date" },
    ]) {
      const res = await call("POST", listPath, {
        url: `/v1/projects/${projectId}/milestones`,
        body,
      });
      expect(res.statusCode).toBe(400);
    }
    expect(count()).toEqual(before);
  });

  it("마일스톤 POST: 같은 요청은 한 번만, 다른 본문이나 프로젝트 재사용은 422", async () => {
    const { projectId } = fixture();
    const opts = {
      url: `/v1/projects/${projectId}/milestones`,
      headers: { "idempotency-key": "milestone-retry-1" },
      body: { name: "한 번만" },
    };
    const a = await call("POST", listPath, opts);
    expect(a.statusCode).toBe(201);
    const b = await call("POST", listPath, opts);
    expect(b.statusCode).toBe(201);
    expect(b.json()).toEqual(a.json());
    expect(b.headers["idempotent-replayed"]).toBe("true");
    expect(changesFor(a.json().id)).toHaveLength(1);
    const changed = await call("POST", listPath, { ...opts, body: { name: "다른 내용" } });
    expect(changed.statusCode).toBe(422);
    const other = await newProject("다른 프로젝트");
    expect(
      (await call("POST", listPath, { ...opts, url: `/v1/projects/${other}/milestones` }))
        .statusCode,
    ).toBe(422);
  });

  it("마일스톤 POST·GET: 없는·휴지통 프로젝트는 404", async () => {
    const { projectId } = fixture();
    expect(
      (await call("DELETE", projectPath, { url: `/v1/projects/${projectId}` })).statusCode,
    ).toBe(204);
    for (const id of [missingId, projectId]) {
      expect(
        (
          await call("POST", listPath, {
            url: `/v1/projects/${id}/milestones`,
            body: { name: "x" },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (await call("GET", listPath, { url: `/v1/projects/${id}/milestones` })).statusCode,
      ).toBe(404);
    }
  });

  it("마일스톤 PATCH: 이름·마감을 고치며 null은 마감 제거, 생략은 유지", async () => {
    const { milestoneId } = fixture();
    const url = `/v1/milestones/${milestoneId}`;
    const a = await call("PATCH", milestonePath, {
      url,
      body: { name: "새 이름", dueAt: "2026-11-02T08:00:00+09:00" },
    });
    expect(a.statusCode).toBe(200);
    expect(a.json()).toMatchObject({
      name: "새 이름",
      dueAt: "2026-11-01T23:00:00.000Z",
      etag: '"v2"',
    });
    const b = await call("PATCH", milestonePath, { url, body: { name: "다음 이름" } });
    expect(b.json().dueAt).toBe(a.json().dueAt);
    const c = await call("PATCH", milestonePath, {
      url,
      body: { dueAt: null },
      headers: { "x-naeil-session": "session-4" },
    });
    expect(c.json()).toMatchObject({ name: "다음 이름", dueAt: null, etag: '"v4"' });
    expect(c.headers.etag).toBe('"v4"');
    expect(changesFor(milestoneId)).toHaveLength(4);
    expect(changesFor(milestoneId).at(-1)).toMatchObject({
      entity: "milestone",
      action: "update",
      session: "session-4",
    });
  });

  it("마일스톤 PATCH: 빈 본문·잘못된 칸은 400", async () => {
    const { milestoneId } = fixture();
    for (const body of [
      {},
      { name: "" },
      { name: 123 },
      { dueAt: "bad" },
      { projectId: missingId },
    ]) {
      const res = await call("PATCH", milestonePath, {
        url: `/v1/milestones/${milestoneId}`,
        body,
      });
      expect(res.statusCode).toBe(400);
    }
    expect(changesFor(milestoneId)).toHaveLength(1);
  });

  it("마일스톤 PATCH: 목록의 판 표시로 수정하고 충돌 뒤 다시 읽는다", async () => {
    const { projectId, milestoneId } = fixture();
    const url = `/v1/milestones/${milestoneId}`;
    const read = await call("GET", listPath, { url: `/v1/projects/${projectId}/milestones` });
    expect(read.statusCode).toBe(200);
    const tag = read.json().items[0].etag;
    expect(tag).toBe('"v1"');
    expect(
      (
        await call("PATCH", milestonePath, {
          url,
          body: { name: "둘째" },
          headers: { "if-match": tag },
        })
      ).statusCode,
    ).toBe(200);
    for (const old of [tag, 'W/"v2"']) {
      expect(
        (
          await call("PATCH", milestonePath, {
            url,
            body: { name: "덮어쓰기" },
            headers: { "if-match": old },
          })
        ).statusCode,
      ).toBe(412);
    }
    const again = await call("GET", listPath, { url: `/v1/projects/${projectId}/milestones` });
    expect(again.json().items[0]).toMatchObject({ name: "둘째", etag: '"v2"' });
    expect(
      (
        await call("PATCH", milestonePath, {
          url,
          body: { name: "셋째" },
          headers: { "if-match": '"old", "v2"' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call("PATCH", milestonePath, {
          url,
          body: { name: "넷째" },
          headers: { "if-match": "*" },
        })
      ).statusCode,
    ).toBe(200);
    expect(changesFor(milestoneId)).toHaveLength(4);
  });

  it("마일스톤 DELETE: 204, 목록 제외, 할 일 연결 보존", async () => {
    const { store, projectId, milestoneId } = fixture();
    const taskId = store.createTask("fixture", { projectId, milestoneId, title: "연결 보존" });
    const before = store.getTask(taskId);
    const res = await call("DELETE", milestonePath, { url: `/v1/milestones/${milestoneId}` });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    expect(
      (await call("GET", listPath, { url: `/v1/projects/${projectId}/milestones` })).json().items,
    ).toEqual([]);
    expect(store.getTask(taskId)).toEqual(before);
    expect(changesFor(milestoneId)).toHaveLength(2);
    expect(changesFor(milestoneId).at(-1)).toMatchObject({ entity: "milestone", action: "trash" });
  });

  it("마일스톤 DELETE·PATCH: 없는·휴지통 번호는 404", async () => {
    const { milestoneId } = fixture();
    expect(
      (await call("DELETE", milestonePath, { url: `/v1/milestones/${milestoneId}` })).statusCode,
    ).toBe(204);
    for (const id of [missingId, milestoneId]) {
      expect(
        (await call("DELETE", milestonePath, { url: `/v1/milestones/${id}` })).statusCode,
      ).toBe(404);
      expect(
        (await call("PATCH", milestonePath, { url: `/v1/milestones/${id}`, body: { name: "x" } }))
          .statusCode,
      ).toBe(404);
    }
    expect(changesFor(milestoneId)).toHaveLength(2);
  });

  it("6개 동작: 다른 작업 공간의 번호는 404이며 원본은 그대로", async () => {
    const other = new Store(db, "other");
    const p = other.createProject("fixture", "다른 공간");
    const m = other.createMilestone("fixture", p, "다른 목표");
    const checks = [
      ["PATCH", projectPath, `/v1/projects/${p}`, { name: "x" }],
      ["DELETE", projectPath, `/v1/projects/${p}`, undefined],
      ["GET", listPath, `/v1/projects/${p}/milestones`, undefined],
      ["POST", listPath, `/v1/projects/${p}/milestones`, { name: "x" }],
      ["PATCH", milestonePath, `/v1/milestones/${m}`, { name: "x" }],
      ["DELETE", milestonePath, `/v1/milestones/${m}`, undefined],
    ] as const;
    for (const [method, path, url, body] of checks) {
      expect((await call(method, path, { url, body })).statusCode).toBe(404);
    }
    expect(other.getProject(p)?.name).toBe("다른 공간");
    expect(changesFor(p)).toHaveLength(1);
    expect(changesFor(m)).toHaveLength(1);
  });

  it("6개 동작: 출입증 없이 401, 잘못된 번호는 400", async () => {
    const { projectId, milestoneId } = fixture();
    const checks = [
      ["PATCH", projectPath, `/v1/projects/${projectId}`, { name: "x" }],
      ["DELETE", projectPath, `/v1/projects/${projectId}`, undefined],
      ["GET", listPath, `/v1/projects/${projectId}/milestones`, undefined],
      ["POST", listPath, `/v1/projects/${projectId}/milestones`, { name: "x" }],
      ["PATCH", milestonePath, `/v1/milestones/${milestoneId}`, { name: "x" }],
      ["DELETE", milestonePath, `/v1/milestones/${milestoneId}`, undefined],
    ] as const;
    for (const [method, path, url, body] of checks) {
      expect((await call(method, path, { url, body, key: "" })).statusCode).toBe(401);
      const badUrl = url.replace(projectId, "bad-id").replace(milestoneId, "bad-id");
      expect((await call(method, path, { url: badUrl, body })).statusCode).toBe(400);
    }
  });
});
