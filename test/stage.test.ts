// 오늘 화면에서 다음 단계 숨기기 (작가 결정 2026-11-16): 원장의 마일스톤 칸, 지금 단계 뒤의 열린 일은 오늘 목록에서 뺌
import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createKey } from "../src/auth.js";
import { openDb } from "../src/db/connection.js";
import { Store } from "../src/db/store.js";
import { IMPORTER, parseVaultLedger, todaySheet } from "../src/importer.js";
import { expectSpec } from "./spec-check.js";

let db: Database.Database;
let store: Store;
let app: FastifyInstance;
let key: string;
let project: string;
const at = new Date("2026-11-16T03:00:00Z");
const me = { actor: "author", kind: "human" as const, session: null };

const plan = (m2Ai = "할 일") =>
  parseVaultLedger(
    JSON.stringify({
      출처: "naeil-plan",
      할일: [
        {
          번호: "a",
          제목: "합치기",
          몫: "작가",
          종류: "할 일",
          상태: "할 일",
          마일스톤: "M1 실제로 쓰기",
        },
        {
          번호: "b",
          제목: "AI 배포",
          몫: "AI",
          종류: "할 일",
          상태: "할 일",
          마일스톤: "M1 실제로 쓰기",
        },
        { 번호: "c", 제목: "권한표", 몫: "AI", 종류: "할 일", 상태: m2Ai, 마일스톤: "M2 AI 경계" },
        {
          번호: "d",
          제목: "M2 에서 정할 것",
          몫: "작가",
          종류: "결정",
          상태: "결정 대기",
          선택지: ["가", "나"],
          마일스톤: "M2 AI 경계",
        },
        {
          번호: "e",
          제목: "M3 작가 일",
          몫: "작가",
          종류: "할 일",
          상태: "할 일",
          마일스톤: "M3 운영 연결",
        },
        { 번호: "f", 제목: "마일스톤 없는 일", 몫: "작가", 종류: "할 일", 상태: "할 일" },
      ],
    }),
  ).items;

const id = (ref: string) => store.findBySource("vault-naeil-plan", ref)?.id as string;

beforeEach(() => {
  db = openDb(":memory:");
  store = new Store(db, "me", () => at);
  app = buildApp({ db, clock: () => at });
  key = createKey(db, "author");
  project = store.ensureProject(IMPORTER, "내일은내일");
  store.importItems(IMPORTER, "vault-naeil-plan", project, plan());
});

const today = async () => {
  const res = await app.inject({
    method: "GET",
    url: "/v1/today",
    headers: { authorization: `Bearer ${key}` },
  });
  expectSpec(res, "GET", "/v1/today");
  return res.json();
};

describe("원장의 마일스톤 칸", () => {
  it("처음 나온 순서대로 마일스톤을 만들고 할 일을 넣음, 다시 가져와도 그대로", () => {
    const ms = store.listMilestones(project).map((m) => m.name);
    expect(ms).toEqual(["M1 실제로 쓰기", "M2 AI 경계", "M3 운영 연결"]);
    expect(store.getTask(id("c"))?.milestone_id).toBe(store.listMilestones(project)[1]?.id);
    expect(store.getTask(id("f"))?.milestone_id).toBeNull();
    const again = store.importItems(IMPORTER, "vault-naeil-plan", project, plan());
    expect(again).toMatchObject({ created: 0, updated: 0, same: 6 });
    expect(store.listMilestones(project)).toHaveLength(3);
  });

  it("작업판에서 옮긴 마일스톤은 출처가 안 바뀌면 덮지 않음, 출처에서 바꾸면 옮김", () => {
    const [m1, , m3] = store.listMilestones(project);
    store.updateTask(me, id("c"), { milestoneId: m1?.id as string });
    store.importItems(IMPORTER, "vault-naeil-plan", project, plan());
    expect(store.getTask(id("c"))?.milestone_id).toBe(m1?.id);
    const moved = plan().map((it) => (it.ref === "c" ? { ...it, milestone: "M3 운영 연결" } : it));
    store.importItems(IMPORTER, "vault-naeil-plan", project, moved);
    expect(store.getTask(id("c"))?.milestone_id).toBe(m3?.id);
  });
});

describe("오늘 화면에서 다음 단계 숨기기", () => {
  it("지금 단계(M1) 뒤의 열린 일과 그 결정은 오늘 목록에서 빠지고 수만 남음", async () => {
    const t = await today();
    expect(["합치기", "마일스톤 없는 일"]).toContain(t.now.title);
    expect(t.waitingOnMe.map((x: { title: string }) => x.title)).toEqual([]);
    expect(t.decisions).toEqual([]);
    expect(t.laterCount).toBe(3);
    const sheet = todaySheet(store, at);
    expect(sheet).not.toContain("권한표");
    expect(sheet).toContain("다음 단계(뒤 마일스톤) 할 일 3개는 숨김");
  });

  it("M1 이 다 끝나면 M2 가 지금 단계가 되어 보임", async () => {
    store.updateTask(me, id("a"), { status: "done" });
    store.updateTask(me, id("b"), { status: "done" });
    const t = await today();
    expect(t.decisions.map((d: { taskId: string }) => d.taskId)).toEqual([id("d")]);
    expect(t.laterCount).toBe(1);
    expect(todaySheet(store, at)).toContain("권한표");
  });

  it("오늘 고정한 일은 뒤 단계여도 보임", async () => {
    const put = await app.inject({
      method: "PUT",
      url: "/v1/today",
      headers: { authorization: `Bearer ${key}` },
      payload: { pinnedTaskId: id("e"), skipped: [] },
    });
    expect(put.statusCode).toBe(200);
    const t = await today();
    expect(t.now.title).toBe("M3 작가 일");
    expect(t.laterCount).toBe(2);
  });
});
