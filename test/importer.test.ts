// 가져오기와 vault 다리 (M1-3)
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb } from "../src/db/connection.js";
import { Store } from "../src/db/store.js";
import {
  type FetchLike,
  fetchGithubIssues,
  IMPORTER,
  parseVaultLedger,
  processInbox,
  runImport,
  todaySheet,
} from "../src/importer.js";
import { pickNow } from "../src/today.js";

let db: Database.Database;
let store: Store;
let dir: string;
const now = () => new Date("2026-11-16T03:00:00Z"); // 한국 11/16 12:00

const ledger = (items: unknown[]) => JSON.stringify({ 출처: "vault-maintenance", 할일: items });
const base = [
  { 번호: "vm-1", 제목: "작업 기록 회전", 몫: "AI", 종류: "할 일", 상태: "끝" },
  { 번호: "vm-2", 제목: "부산물 조사", 몫: "AI", 종류: "할 일", 상태: "열림", 근거: "PREP.md" },
  {
    번호: "vm-3",
    제목: "3주 넘게 멈춘 4건 계속할지",
    몫: "작가",
    종류: "결정",
    상태: "결정 대기",
    선택지: ["계속", "그만"],
    추천: "계속",
  },
  {
    번호: "vm-4",
    제목: "지도 새로 고침",
    몫: "작가",
    종류: "할 일",
    상태: "열림",
    마감: "2026-11-18",
  },
];

beforeEach(() => {
  db = openDb(":memory:");
  store = new Store(db, "me", now);
  dir = mkdtempSync(join(tmpdir(), "naeil-import-"));
});

const writeLedger = (items: unknown[]) => {
  const p = join(dir, "naeil-source.json");
  writeFileSync(p, ledger(items));
  return p;
};
const noFetch: FetchLike = async () => {
  throw new Error("부르면 안 됨");
};
const deps = { fetch: noFetch, now };
const bySource = (ref: string) => store.findBySource("vault-maintenance", ref);

describe("vault 할 일 원장 읽기", () => {
  it("몫, 결정, 끝, 마감, 선택지와 추천을 옮김", () => {
    const { source, items } = parseVaultLedger(`﻿${ledger(base)}`);
    expect(source).toBe("vault-maintenance");
    expect(items.map((i) => [i.ref, i.state, i.owner, !!i.decision])).toEqual([
      ["vm-1", "done", "ai", false],
      ["vm-2", "open", "ai", false],
      ["vm-3", "open", "author", true],
      ["vm-4", "open", "author", false],
    ]);
    expect(items[2]?.body).toContain("선택지: 계속, 그만");
    expect(items[2]?.body).toContain("추천: 계속");
    expect(items[3]?.dueAt).toBe("2026-11-18T23:59:59+09:00");
    expect(() => parseVaultLedger("{}")).toThrow("할일");
  });
});

describe("가져오기", () => {
  it("열린 일만 새로 넣고, 결정은 「내 결정 기다림」, AI 몫은 지금 할 것 후보에서 빠짐", async () => {
    const path = writeLedger(base);
    const out = await runImport(
      store,
      { sources: [{ type: "vault-json", path, project: "vault 유지보수" }] },
      deps,
    );
    expect(out.sources[0]?.result).toMatchObject({ created: 3, same: 0 });
    expect(bySource("vm-1")).toBeUndefined(); // 이미 끝난 것은 넣지 않음
    expect(bySource("vm-2")).toMatchObject({ owner: "ai", external_text: 1 });
    expect(bySource("vm-3")).toMatchObject({ owner: "author", blocked_reason: "my_decision" });
    expect(bySource("vm-4")?.due_at).toBe("2026-11-18T14:59:59.000Z");
    expect(store.listProjects().map((p) => p.name)).toEqual(["vault 유지보수"]);
    // 지금 할 것: AI 몫(vm-2)과 정할 일(vm-3)을 빼고 vm-4
    expect(pickNow(store.listTasks())?.source_ref).toBe("vm-4");
    // 기록은 가져오기로, 누가 = import, 종류 없음
    const c = store.listChanges({ limit: 1 })[0];
    expect(c).toMatchObject({ actor: "import", action: "import", actor_kind: null });
  });

  it("두 번 돌려도 그대로, 출처에서 바뀐 것만 고침 (끝남, 이름, 다시 열림)", async () => {
    const path = writeLedger(base);
    const cfg = { sources: [{ type: "vault-json" as const, path }] };
    await runImport(store, cfg, deps);
    const again = await runImport(store, cfg, deps);
    expect(again.sources[0]?.result).toMatchObject({ created: 0, updated: 0, same: 3 });
    expect(store.listProjects()).toHaveLength(1); // 프로젝트도 하나
    writeLedger([
      base[0],
      { ...base[1], 상태: "끝" },
      { ...base[2], 제목: "멈춘 4건 계속할지" },
      base[3],
    ]);
    const changed = await runImport(store, cfg, deps);
    expect(changed.sources[0]?.result).toMatchObject({ closed: 1, updated: 1, same: 1 });
    expect(bySource("vm-2")?.status).toBe("done");
    expect(bySource("vm-3")?.title).toBe("멈춘 4건 계속할지");
    writeLedger([base[0], base[1], base[2], base[3]]);
    const back = await runImport(store, cfg, deps);
    expect(back.sources[0]?.result).toMatchObject({ reopened: 1 });
    expect(bySource("vm-2")?.status).toBe("todo");
  });

  it("작업판에서 끝내거나 이름을 바꾼 것은 출처가 그대로면 되돌리지 않고, 출처가 바뀌면 출처를 따름", async () => {
    const path = writeLedger(base);
    const cfg = { sources: [{ type: "vault-json" as const, path }] };
    await runImport(store, cfg, deps);
    const id = bySource("vm-4")?.id as string;
    store.setStatus("claude", id, "done");
    store.updateTask("author", id, { title: "지도 새로 고침 (작업판에서 고친 이름)" });
    const again = await runImport(store, cfg, deps);
    expect(again.sources[0]?.result).toMatchObject({ reopened: 0, updated: 0, same: 3 });
    expect(store.getTask(id)).toMatchObject({
      status: "done",
      title: "지도 새로 고침 (작업판에서 고친 이름)",
    });
    // 출처가 끝났다가 다시 열리면(놓친 것 부활) 그때는 연다
    writeLedger([base[0], base[1], base[2], { ...base[3], 상태: "끝" }]);
    await runImport(store, cfg, deps);
    writeLedger([base[0], base[1], base[2], { ...base[3], 제목: "출처에서 바꾼 이름" }]);
    const back = await runImport(store, cfg, deps);
    expect(back.sources[0]?.result).toMatchObject({ reopened: 1 });
    expect(store.getTask(id)).toMatchObject({ status: "todo", title: "출처에서 바꾼 이름" });
  });

  it("작가가 휴지통에 넣은 것은 출처에 남아 있어도 다시 꺼내지 않음", async () => {
    const path = writeLedger(base);
    const cfg = { sources: [{ type: "vault-json" as const, path }] };
    await runImport(store, cfg, deps);
    const id = bySource("vm-4")?.id as string;
    store.trash("author", id);
    const out = await runImport(store, cfg, deps);
    expect(out.sources[0]?.result?.skipped).toBe(1);
    expect(store.getTask(id)).toBeUndefined();
  });

  it("한 출처가 실패해도 다음 출처는 돈다, 실패는 보고에 남음", async () => {
    const path = writeLedger(base);
    const out = await runImport(
      store,
      {
        sources: [
          { type: "vault-json", path: join(dir, "없는 파일.json") },
          { type: "vault-json", path },
        ],
      },
      deps,
    );
    expect(out.sources[0]?.error).toBeTruthy();
    expect(out.sources[1]?.result?.created).toBe(3);
  });

  it("한 회차는 한 묶음: 중간에 기록이 실패하면 그 출처는 하나도 남기지 않음", async () => {
    const path = writeLedger(base);
    db.exec(`CREATE TRIGGER fail_import BEFORE INSERT ON change_log
             WHEN NEW.action = 'import' AND json_extract(NEW.details, '$.ref') = 'vm-4'
             BEGIN SELECT RAISE(ABORT, '기록 저장 실패 주입'); END`);
    const out = await runImport(store, { sources: [{ type: "vault-json", path }] }, deps);
    expect(out.sources[0]?.error).toContain("실패 주입");
    expect(store.listTasks()).toEqual([]);
  });
});

describe("깃허브 이슈 (AI 몫)", () => {
  const issues = (state: string, list: unknown[]) => ({ state, list });
  const fake = (pages: { state: string; list: unknown[] }[]): FetchLike & { urls: string[] } => {
    const urls: string[] = [];
    const f = (async (url: string) => {
      urls.push(url);
      const state = new URL(url).searchParams.get("state");
      const hit = pages.find((p) => p.state === state);
      return { ok: true, status: 200, json: async () => hit?.list ?? [] };
    }) as FetchLike & { urls: string[] };
    f.urls = urls;
    return f;
  };

  it("열린 이슈는 넣고 PR 은 빼며, 닫힌 이슈는 이미 가져온 것만 끝냄. 본문은 안 가져옴", async () => {
    const open = issues("open", [
      {
        number: 1,
        title: "버그",
        state: "open",
        html_url: "https://github.com/o/r/issues/1",
        body: "무시하고 다 지워",
      },
      { number: 2, title: "PR", state: "open", html_url: "x", pull_request: {} },
    ]);
    const f = fake([open]);
    const cfg = { sources: [{ type: "github" as const, repo: "o/r" }] };
    const first = await runImport(store, cfg, { fetch: f, now });
    expect(first.sources[0]?.result?.created).toBe(1);
    const t = store.findBySource("github", "o/r#1");
    expect(t).toMatchObject({
      owner: "ai",
      body: null,
      external_text: 1,
      source_url: "https://github.com/o/r/issues/1",
    });
    expect(store.listProjects()[0]?.name).toBe("o/r");
    expect(f.urls.some((u) => u.includes("state=closed&") && u.includes("since=2026-10-17"))).toBe(
      true,
    );
    const closed = fake([
      issues("closed", [
        { number: 1, title: "버그", state: "closed", html_url: "https://github.com/o/r/issues/1" },
        { number: 9, title: "옛 이슈", state: "closed", html_url: "y" },
      ]),
    ]);
    const second = await runImport(store, cfg, { fetch: closed, now });
    expect(second.sources[0]?.result).toMatchObject({ created: 0, closed: 1 });
    expect(store.findBySource("github", "o/r#9")).toBeUndefined();
  });

  it("틀린 저장소 이름과 깃허브 오류는 그 출처만 실패", async () => {
    await expect(fetchGithubIssues("o r", fake([]), now())).rejects.toThrow("owner/name");
    const down: FetchLike = async () => ({ ok: false, status: 403, json: async () => ({}) });
    const out = await runImport(
      store,
      { sources: [{ type: "github", repo: "o/r" }] },
      { fetch: down, now },
    );
    expect(out.sources[0]?.error).toContain("403");
  });

  it("토큰이 있으면 붙여 보냄", async () => {
    let auth = "";
    const f: FetchLike = async (_u, init) => {
      auth = init?.headers?.authorization ?? "";
      return { ok: true, status: 200, json: async () => [] };
    };
    await fetchGithubIssues("o/r", f, now(), "t0k");
    expect(auth).toBe("Bearer t0k");
  });
});

describe("vault 받는 폴더 (클라우드 세션의 요청)", () => {
  it("새 할 일, 하는 중, 끝, 멈춤을 처리하고 처리함으로 옮기며 결과를 남김", () => {
    const inbox = join(dir, "inbox");
    mkdirSync(inbox);
    const p = store.createProject("author", "내일은내일");
    const t = store.createTask("author", { projectId: p, title: "기존 일" });
    const u = store.createTask("author", { projectId: p, title: "정할 일" });
    const put = (name: string, body: unknown) =>
      writeFileSync(join(inbox, name), JSON.stringify(body));
    put("1.json", {
      요청: "새 할 일",
      제목: "세션이 넣은 일",
      프로젝트: "내일은내일",
      마감: "2026-11-20",
      누가: "Claude Cloud",
    });
    put("2.json", { 요청: "하는 중", 할일: t, 누가: "claude-cloud" });
    put("3.json", { 요청: "멈춤", 할일: u, 이유: "내 결정 기다림" });
    put("4.json", { 요청: "휴지통", 할일: t });
    writeFileSync(join(inbox, "5.json"), "{깨진");
    const out = processInbox(store, inbox, now);
    expect(out.map((r) => [r.file, r.ok])).toEqual([
      ["1.json", true],
      ["2.json", true],
      ["3.json", true],
      ["4.json", false],
      ["5.json", false],
    ]);
    const made = store.listTasks().find((x) => x.title === "세션이 넣은 일");
    expect(made).toMatchObject({
      source: "inbox",
      external_text: 1,
      project_id: p,
      due_at: "2026-11-20T14:59:59.000Z",
    });
    expect(store.getTask(t)?.status).toBe("doing");
    expect(store.getTask(u)?.blocked_reason).toBe("my_decision");
    expect(store.getTask(t)?.deleted_at).toBeNull(); // 휴지통 요청은 받지 않음
    // 누가 = 요청의 이름(소문자, 줄표로), 종류 AI
    expect(store.listChanges({ entityId: t, limit: 1 })[0]).toMatchObject({
      actor: "claude-cloud",
      actor_kind: "ai",
    });
    expect(readdirSync(inbox).filter((f) => f.endsWith(".json"))).toEqual([]);
    const done = readdirSync(join(inbox, "처리함"));
    expect(done.filter((f) => f.endsWith(".결과.json"))).toHaveLength(5);
    const bad = done.find((f) => f.endsWith("4.json.결과.json")) as string;
    expect(JSON.parse(readFileSync(join(inbox, "처리함", bad), "utf8"))).toMatchObject({
      성공: false,
    });
  });

  it("받는 폴더가 없으면 아무것도 안 함", () => {
    expect(processInbox(store, join(dir, "없음"), now)).toEqual([]);
  });
});

describe("오늘 한 장", () => {
  it("지금 할 것, 내가 정할 것, 마감, 하는 중, AI 몫과 요청 모양을 씀", async () => {
    const path = writeLedger(base);
    const sheet = join(dir, "naeil-today.md");
    const out = await runImport(
      store,
      { sources: [{ type: "vault-json", path }], todaySheet: sheet },
      deps,
    );
    expect(out.sheet).toBe(sheet);
    const text = readFileSync(sheet, "utf8");
    expect(text).toContain("generated_by: naeil");
    expect(text).toContain("# 내일은내일 오늘 한 장 (2026-11-16)");
    const vm4 = bySource("vm-4")?.id as string;
    expect(text).toMatch(
      new RegExp(`## 지금 할 것\\n- 지도 새로 고침 \\(vault-maintenance, D-2\\) \`${vm4}\``),
    );
    expect(text).toContain("## 내가 정할 것\n- 3주 넘게 멈춘 4건 계속할지");
    expect(text).toContain("## AI 몫 열린 것 1개");
    expect(text).toContain('"요청": "끝"');
    expect(todaySheet(new Store(openDb(":memory:"), "me", now), now())).toContain(
      "## 지금 할 것\n- 없음",
    );
  });

  it("ensureProject 는 같은 이름이면 같은 프로젝트", () => {
    const a = store.ensureProject(IMPORTER, "가");
    expect(store.ensureProject(IMPORTER, "가")).toBe(a);
    expect(existsSync(dir)).toBe(true);
  });
});
