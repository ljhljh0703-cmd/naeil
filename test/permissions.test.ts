// 권한표와 사람 확인 대기 (M2-1): 명세서 동작마다 부를 수 있는 API 키 종류, AI 가 끝낸 외부 입력 할 일은 작가 확인

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createKey } from "../src/auth.js";
import { openDb } from "../src/db/connection.js";
import { Store } from "../src/db/store.js";
import { processInbox } from "../src/importer.js";
import { loadSpec } from "../src/spec.js";
import { expectSpec } from "./spec-check.js";

let db: Database.Database;
let app: FastifyInstance;
const keys: Record<string, string> = {};
let project: string;

const call = (who: string, method: string, url: string, body?: unknown) =>
  app.inject({
    method: method as "GET",
    url,
    headers: { authorization: `Bearer ${keys[who]}` },
    ...(body === undefined ? {} : { payload: body as object }),
  });

beforeEach(async () => {
  db = openDb(":memory:");
  app = buildApp({ db });
  keys.author = createKey(db, "author");
  keys.claude = createKey(db, "claude");
  keys.ci = createKey(db, "ci-check", "me", "ci");
  project = (await call("author", "POST", "/v1/projects", { name: "권한" })).json().id;
});

const ops = () =>
  Object.entries(loadSpec().paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([m]) => ["get", "post", "patch", "put", "delete"].includes(m))
      .map(([m, op]) => ({
        path,
        method: m,
        who: (op as { "x-naeil-who"?: string[] })["x-naeil-who"],
      })),
  );

describe("권한표는 명세서에 있다", () => {
  it("/v1 동작마다 x-naeil-who 가 있고 종류는 human, ai, ci 중에서", () => {
    for (const o of ops().filter((o) => o.path.startsWith("/v1/"))) {
      expect(o.who, `${o.method} ${o.path}`).toBeTruthy();
      for (const k of o.who ?? []) expect(["human", "ai", "ci"]).toContain(k);
    }
  });

  it("누구나 부를 수 없는 동작에는 403 응답이 적혀 있다", () => {
    const spec = loadSpec().paths as Record<string, Record<string, { responses: object }>>;
    for (const o of ops().filter((o) => o.who && o.who.length < 3)) {
      expect(
        Object.keys(spec[o.path]?.[o.method]?.responses ?? {}),
        `${o.method} ${o.path}`,
      ).toContain("403");
    }
  });

  it("작가 결정대로: AI 는 프로젝트 휴지통과 복원, 결정 답하기를 못 한다. 자동 검사는 읽기만", () => {
    const who = (m: string, p: string) => ops().find((o) => o.method === m && o.path === p)?.who;
    expect(who("delete", "/v1/projects/{projectId}")).toEqual(["human"]);
    expect(who("post", "/v1/projects/{projectId}/revive")).toEqual(["human"]);
    expect(who("post", "/v1/tasks/{taskId}/decision/answer")).toEqual(["human"]);
    for (const o of ops().filter((o) => o.path.startsWith("/v1/") && o.method !== "get")) {
      expect(o.who, `${o.method} ${o.path}`).not.toContain("ci");
    }
  });
});

describe("서버가 권한표대로 막는다", () => {
  it("AI API 키로 프로젝트를 휴지통에 넣으면 403", async () => {
    const res = await call("claude", "DELETE", `/v1/projects/${project}`);
    expect(res.statusCode).toBe(403);
    expect(res.json().type).toContain("forbidden-for-key-kind");
    expectSpec(res, "DELETE", "/v1/projects/{projectId}");
    expect(new Store(db).getProject(project)?.deleted_at).toBeNull();
  });

  it("본문이 틀려도 입력 검사보다 권한이 먼저 (403)", async () => {
    const task = (
      await call("author", "POST", "/v1/tasks", { projectId: project, title: "일" })
    ).json().id;
    await call("author", "PUT", `/v1/tasks/${task}/decision`, {
      question: "가 나?",
      options: ["가", "나"],
    });
    const res = await call("claude", "POST", `/v1/tasks/${task}/decision/answer`, { wrong: 1 });
    expect(res.statusCode).toBe(403);
  });

  it("자동 검사 API 키는 읽을 수 있고 쓰면 403", async () => {
    expect((await call("ci", "GET", "/v1/projects")).statusCode).toBe(200);
    const res = await call("ci", "POST", "/v1/tasks", { projectId: project, title: "일" });
    expect(res.statusCode).toBe(403);
    expectSpec(res, "POST", "/v1/tasks");
  });

  it("사람 API 키는 다 된다", async () => {
    expect((await call("author", "DELETE", `/v1/projects/${project}`)).statusCode).toBe(204);
    expect((await call("author", "POST", `/v1/projects/${project}/revive`)).statusCode).toBe(200);
  });
});

describe("사람 확인 대기", () => {
  const external = async () =>
    (
      await call("author", "POST", "/v1/tasks", {
        projectId: project,
        title: "깃허브에서 온 일",
        source: "github",
        sourceRef: "x#1",
      })
    ).json().id as string;

  it("AI 가 외부 입력 할 일을 완료로 바꾸면 끝나지 않고 작가에게 확인 질문이 생긴다", async () => {
    const task = await external();
    const res = await call("claude", "PATCH", `/v1/tasks/${task}`, { status: "done" });
    expect(res.statusCode).toBe(200);
    expectSpec(res, "PATCH", "/v1/tasks/{taskId}");
    expect(res.json().status).not.toBe("done");
    expect(res.json().blockedReason).toBe("my_decision");
    const d = await call("author", "GET", `/v1/tasks/${task}/decision`);
    expect(d.json().doneCheck).toBe(true);
    expect(d.json().options).toEqual(["완료", "다시 하기"]);
    const today = (await call("author", "GET", "/v1/today")).json();
    expect(today.decisions.map((x: { taskId: string }) => x.taskId)).toContain(task);
  });

  it("작가가 「완료」를 고르면 그때 끝난다", async () => {
    const task = await external();
    await call("claude", "PATCH", `/v1/tasks/${task}`, { status: "done" });
    const res = await call("author", "POST", `/v1/tasks/${task}/decision/answer`, {
      answer: "완료",
    });
    expect(res.statusCode).toBe(200);
    const t = (await call("author", "GET", `/v1/tasks/${task}`)).json();
    expect(t.status).toBe("done");
    expect(t.blockedReason).toBeNull();
  });

  it("「다시 하기」를 고르면 멈춤만 풀리고 끝나지 않는다", async () => {
    const task = await external();
    await call("claude", "PATCH", `/v1/tasks/${task}`, { status: "doing" });
    await call("claude", "PATCH", `/v1/tasks/${task}`, { status: "done" });
    await call("author", "POST", `/v1/tasks/${task}/decision/answer`, { answer: "다시 하기" });
    const t = (await call("author", "GET", `/v1/tasks/${task}`)).json();
    expect(t.status).toBe("doing");
    expect(t.blockedReason).toBeNull();
  });

  it("직접 만든 할 일은 AI 가 끝내도 바로 끝난다", async () => {
    const task = (
      await call("claude", "POST", "/v1/tasks", { projectId: project, title: "직접" })
    ).json().id;
    const res = await call("claude", "PATCH", `/v1/tasks/${task}`, { status: "done" });
    expect(res.json().status).toBe("done");
  });

  it("사람이 끝내면 외부 입력이어도 바로 끝난다", async () => {
    const task = await external();
    expect(
      (await call("author", "PATCH", `/v1/tasks/${task}`, { status: "done" })).json().status,
    ).toBe("done");
  });

  it("작가에게 다른 질문을 하는 중이면 AI 는 끝낼 수 없다 (422)", async () => {
    const task = await external();
    await call("claude", "PUT", `/v1/tasks/${task}/decision`, {
      question: "어느 쪽?",
      options: ["가", "나"],
    });
    const res = await call("claude", "PATCH", `/v1/tasks/${task}`, { status: "done" });
    expect(res.statusCode).toBe(422);
    expectSpec(res, "PATCH", "/v1/tasks/{taskId}");
  });

  it("요청함으로 AI 가 「완료」를 보내도 같은 규칙", async () => {
    const task = await external();
    const s = new Store(db);
    const dir = mkdtempSync(join(tmpdir(), "inbox-"));
    writeFileSync(
      join(dir, "a.json"),
      JSON.stringify({ 요청: "완료", 할일: task, 누가: "claude-cloud" }),
    );
    const [r] = processInbox(s, dir, () => new Date());
    expect(r?.message).toContain("사람 확인 대기");
    expect(s.getTask(task)?.status).not.toBe("done");
  });
});
