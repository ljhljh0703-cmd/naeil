// 날짜별 사용 기록 (M1-5): 처음 연 시각, 작가가 바꾼 수, 고른 결정 수, AI 가 바꾼 수, 가져오기 수
import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createKey } from "../src/auth.js";
import { openDb } from "../src/db/connection.js";
import { Store } from "../src/db/store.js";
import { IMPORTER } from "../src/importer.js";
import { expectSpec } from "./spec-check.js";

let db: Database.Database;
let app: FastifyInstance;
let author: string;
let claude: string;
let at = new Date("2026-11-16T00:30:00Z"); // 한국 11/16 09:30

beforeEach(() => {
  db = openDb(":memory:");
  at = new Date("2026-11-16T00:30:00Z");
  app = buildApp({ db, clock: () => at });
  author = createKey(db, "author");
  claude = createKey(db, "claude");
});

const call = async (
  method: "GET" | "POST" | "PATCH" | "PUT",
  spec: string,
  url: string,
  key: string,
  body?: unknown,
) => {
  const res = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${key}` },
    ...(body !== undefined ? { payload: body as object } : {}),
  });
  expectSpec(res, method, spec);
  return res;
};

describe("날짜별 사용 기록", () => {
  it("처음 연 시각은 사람 출입증의 그날 첫 요청만, AI 출입증은 세지 않음", async () => {
    at = new Date("2026-11-15T23:00:00Z"); // 한국 11/16 08:00, AI 가 먼저
    await call("GET", "/v1/projects", "/v1/projects", claude);
    at = new Date("2026-11-16T00:30:00Z"); // 09:30 작가
    await call("GET", "/v1/today", "/v1/today", author);
    at = new Date("2026-11-16T05:00:00Z"); // 14:00 작가 또
    await call("GET", "/v1/today", "/v1/today", author);
    const u = (
      await call("GET", "/v1/usage", "/v1/usage?since=2026-11-16&until=2026-11-16", author)
    ).json();
    expect(u.items).toEqual([
      expect.objectContaining({ day: "2026-11-16", firstOpenedAt: "2026-11-16T00:30:00.000Z" }),
    ]);
  });

  it("작가가 바꾼 수, 고른 결정 수, AI 가 바꾼 수, 가져오기 수를 나눠 셈 (한국 날짜)", async () => {
    const p = (await call("POST", "/v1/projects", "/v1/projects", author, { name: "가" })).json()
      .id;
    const t = (
      await call("POST", "/v1/tasks", "/v1/tasks", claude, { projectId: p, title: "일" })
    ).json().id;
    await call("PUT", "/v1/tasks/{taskId}/decision", `/v1/tasks/${t}/decision`, claude, {
      question: "?",
    });
    await call(
      "POST",
      "/v1/tasks/{taskId}/decision/answer",
      `/v1/tasks/${t}/decision/answer`,
      author,
      {
        answer: "응",
      },
    );
    const s = new Store(db, "me", () => at);
    s.importItems(IMPORTER, "github", p, [
      { ref: "o/r#1", title: "이슈", state: "open", owner: "ai" },
    ]);
    at = new Date("2026-11-16T15:30:00Z"); // 한국 11/17 00:30
    await call("PATCH", "/v1/tasks/{taskId}", `/v1/tasks/${t}`, author, { status: "done" });
    const u = (
      await call("GET", "/v1/usage", "/v1/usage?since=2026-11-15&until=2026-11-17", author)
    ).json();
    expect(
      u.items.map((d: Record<string, unknown>) => [
        d.day,
        d.authorChanges,
        d.decisions,
        d.aiChanges,
        d.imports,
      ]),
    ).toEqual([
      ["2026-11-15", 0, 0, 0, 0],
      ["2026-11-16", 2, 1, 2, 1],
      ["2026-11-17", 1, 0, 0, 0],
    ]);
  });

  it("기본은 오늘까지 7일, 거꾸로 된 기간과 93일 넘는 기간은 400", async () => {
    const u = (await call("GET", "/v1/usage", "/v1/usage", author)).json();
    expect(u.items.map((d: { day: string }) => d.day)).toEqual([
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
      "2026-11-16",
    ]);
    expect(
      (await call("GET", "/v1/usage", "/v1/usage?since=2026-11-17&until=2026-11-16", author))
        .statusCode,
    ).toBe(400);
    expect(
      (await call("GET", "/v1/usage", "/v1/usage?since=2026-01-01&until=2026-11-16", author))
        .statusCode,
    ).toBe(400);
  });
});
