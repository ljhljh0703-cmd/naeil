// AI 세션 잡기와 놓기 (M2-2): 서버가 번호를 발급하고, 번호가 없거나 지난 번호인 AI 요청은 거절
import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createKey } from "../src/auth.js";
import { openDb } from "../src/db/connection.js";
import { HOLD_MS, Store } from "../src/db/store.js";
import { expectSpec } from "./spec-check.js";

let db: Database.Database;
let app: FastifyInstance;
let now = new Date("2026-11-25T03:00:00Z");
const keys: Record<string, string> = {};
let task: string;

const call = (
  who: string,
  method: string,
  url: string,
  opts: { body?: unknown; hold?: string } = {},
) =>
  app.inject({
    method: method as "GET",
    url,
    headers: {
      authorization: `Bearer ${keys[who]}`,
      ...(opts.hold ? { "x-naeil-hold": opts.hold } : {}),
    },
    ...(opts.body === undefined ? {} : { payload: opts.body as object }),
  });
const hold = async (who = "claude", h?: string) => {
  const res = await call(who, "POST", `/v1/tasks/${task}/hold`, { hold: h });
  return res;
};
const patch = (who: string, body: object, h?: string) =>
  call(who, "PATCH", `/v1/tasks/${task}`, { body, hold: h });

beforeEach(async () => {
  now = new Date("2026-11-25T03:00:00Z");
  db = openDb(":memory:");
  app = buildApp({ db, clock: () => now });
  keys.author = createKey(db, "author");
  keys.claude = createKey(db, "claude");
  keys.codex = createKey(db, "codex");
  const p = (await call("author", "POST", "/v1/projects", { body: { name: "잡기" } })).json().id;
  task = (await call("author", "POST", "/v1/tasks", { body: { projectId: p, title: "일" } })).json()
    .id;
});

describe("잡기", () => {
  it("잡으면 번호가 나오고 할 일은 AI 작업 중. 할 일 응답에는 번호가 없다", async () => {
    const res = await hold();
    expect(res.statusCode).toBe(200);
    expectSpec(res, "POST", "/v1/tasks/{taskId}/hold");
    const t = (await call("author", "GET", `/v1/tasks/${task}`)).json();
    expect(t.blockedReason).toBe("ai_working");
    expect(t.heldBy).toBe("claude");
    expect(t.holdExpiresAt).toBe(res.json().expiresAt);
    expect(JSON.stringify(t)).not.toContain(res.json().holdId);
  });

  it("잡은 세션은 번호를 넣어 고친다. 번호 없이, 다른 번호로는 409 held", async () => {
    const { holdId } = (await hold()).json();
    expect((await patch("claude", { title: "고침" }, holdId)).statusCode).toBe(200);
    const noId = await patch("codex", { title: "끼어듦" });
    expect(noId.statusCode).toBe(409);
    expect(noId.json().type).toContain("held");
    expectSpec(noId, "PATCH", "/v1/tasks/{taskId}");
    expect((await patch("claude", { title: "번호 빠짐" })).statusCode).toBe(409);
    expect((await hold("codex")).statusCode).toBe(409);
  });

  it("놓은 뒤 늦게 온 옛 번호 요청은 409 hold-stale, 번호 없는 요청은 다시 받는다", async () => {
    const { holdId } = (await hold()).json();
    expect(
      (await call("claude", "DELETE", `/v1/tasks/${task}/hold`, { hold: holdId })).statusCode,
    ).toBe(204);
    const late = await patch("claude", { title: "늦은 요청" }, holdId);
    expect(late.statusCode).toBe(409);
    expect(late.json().type).toContain("hold-stale");
    expect((await patch("codex", { title: "새 요청" })).statusCode).toBe(200);
    const t = (await call("author", "GET", `/v1/tasks/${task}`)).json();
    expect(t.blockedReason).toBeNull();
    expect(t.title).toBe("새 요청");
  });

  it("남이 다시 잡은 뒤 옛 번호는 새 잡기를 덮지 못한다", async () => {
    const first = (await hold("claude")).json().holdId;
    await call("claude", "DELETE", `/v1/tasks/${task}/hold`, { hold: first });
    const second = (await hold("codex")).json().holdId;
    expect((await patch("claude", { title: "옛 세션" }, first)).statusCode).toBe(409);
    expect(
      (await call("claude", "DELETE", `/v1/tasks/${task}/hold`, { hold: first })).statusCode,
    ).toBe(409);
    expect((await patch("codex", { title: "새 세션" }, second)).statusCode).toBe(200);
  });

  it("2시간 안 쓰면 저절로 끝나고, 쓰면 늘어난다", async () => {
    const { holdId } = (await hold()).json();
    now = new Date(now.getTime() + HOLD_MS - 60_000);
    expect((await patch("claude", { title: "늘림" }, holdId)).statusCode).toBe(200);
    now = new Date(now.getTime() + HOLD_MS - 60_000);
    expect((await hold("codex")).statusCode).toBe(409); // 늘어나서 아직 살아 있음
    now = new Date(now.getTime() + 2 * 60_000);
    expect((await patch("claude", { title: "시간 지남" }, holdId)).json().type).toContain(
      "hold-stale",
    );
    expect((await hold("codex")).statusCode).toBe(200);
  });

  it("같은 번호로 다시 잡으면 시간만 늘고 번호는 그대로", async () => {
    const a = (await hold()).json();
    now = new Date(now.getTime() + 60_000);
    const b = (await hold("claude", a.holdId)).json();
    expect(b.holdId).toBe(a.holdId);
    expect(b.expiresAt > a.expiresAt).toBe(true);
  });

  it("사람은 잡기와 상관없이 고치고 남의 잡기도 놓는다", async () => {
    await hold();
    expect((await patch("author", { title: "작가가 고침" })).statusCode).toBe(200);
    expect((await call("author", "DELETE", `/v1/tasks/${task}/hold`)).statusCode).toBe(204);
    expect((await call("author", "GET", `/v1/tasks/${task}`)).json().blockedReason).toBeNull();
  });

  it("완료하면 잡기가 끝나 옛 번호는 거절, 끝난 일은 잡지 않는다", async () => {
    const { holdId } = (await hold()).json();
    expect((await patch("claude", { status: "done" }, holdId)).json().status).toBe("done");
    expect(
      (await call("claude", "POST", `/v1/tasks/${task}/revive`, { hold: holdId })).statusCode,
    ).toBe(409);
    expect((await hold()).statusCode).toBe(422);
  });

  it("놓기는 다시 보내도 같다", async () => {
    expect((await call("claude", "DELETE", `/v1/tasks/${task}/hold`)).statusCode).toBe(204);
    expect((await call("claude", "DELETE", `/v1/tasks/${task}/hold`)).statusCode).toBe(204);
  });

  it("다른 이유로 멈춘 일은 잡지 않는다", async () => {
    await call("author", "PUT", `/v1/tasks/${task}/block`, { body: { reason: "external" } });
    expect((await hold()).statusCode).toBe(422);
  });

  it("요청함으로 온 AI 요청도 잡힌 일이면 거절", async () => {
    await hold();
    const s = new Store(db, "me", () => now);
    expect(() =>
      s.updateTask({ actor: "claude-cloud", kind: "ai", session: null }, task, { title: "요청함" }),
    ).toThrow(/다른 세션이 잡은 일/);
  });
});

describe("잡기와 기록은 한 묶음", () => {
  it("기록이 실패하면 잡기도 남지 않는다", async () => {
    db.exec(`CREATE TRIGGER fail_hold BEFORE INSERT ON change_log WHEN NEW.action = 'hold'
             BEGIN SELECT RAISE(ABORT, '기록 저장 실패 주입'); END`);
    expect((await hold()).statusCode).toBe(500);
    const t = new Store(db).getTask(task);
    expect(t?.hold_id).toBeNull();
    expect(t?.blocked_reason).toBeNull();
  });
});
