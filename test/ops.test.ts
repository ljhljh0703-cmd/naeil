// M0-2: 배포용 서버가 어느 폴더에서 켜도 같은 파일을 찾고, 상태 확인이 자료 파일까지 보는지.
import { copyFileSync, existsSync, mkdtempSync, renameSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { LEGACY_DB, loadConfig } from "../src/config.js";
import { openDb } from "../src/db/connection.js";
import { RESTART_EXIT_CODE, selfCheckAction } from "../src/health.js";
import {
  defaultDataDir,
  findRoot,
  MIGRATIONS_DIR,
  ROOT,
  SPEC_PATH,
  VERSION,
  WEB_DIR,
} from "../src/paths.js";
import { expectSpec } from "./spec-check.js";

const dirs: string[] = [];
const scratch = () => {
  const d = mkdtempSync(join(tmpdir(), "naeil-ops-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("고정 파일 자리", () => {
  it("저장소 뿌리에서 표 구조 파일, 명세서를 찾는다", () => {
    expect(existsSync(join(ROOT, "package.json"))).toBe(true);
    expect(existsSync(join(MIGRATIONS_DIR, "001_init.up.sql"))).toBe(true);
    expect(existsSync(SPEC_PATH)).toBe(true);
    expect(WEB_DIR).toBe(join(ROOT, "web", "dist"));
  });

  it("구운 판 자리(dist 아래)에서 올라가도 같은 뿌리", () => {
    expect(findRoot(join(ROOT, "dist", "db"))).toBe(ROOT);
    expect(findRoot(join(ROOT, "src", "db"))).toBe(ROOT);
  });
});

describe("자료 파일 자리", () => {
  const ctx = (exists: (p: string) => boolean = () => false) => ({
    root: "/repo",
    platform: "darwin" as const,
    home: "/Users/me",
    exists,
  });

  it("상대경로는 켠 폴더가 아닌 저장소 기준으로 읽고, 알려 준다", () => {
    const c = loadConfig({ NAEIL_DB: "data/naeil.db" }, ctx());
    expect(c.dbPath).toBe("/repo/data/naeil.db");
    expect(c.notes.some((n) => n.includes("상대경로"))).toBe(true);
  });

  it("절대경로는 그대로", () => {
    expect(loadConfig({ NAEIL_DB: "/srv/naeil/a.db" }, ctx()).dbPath).toBe("/srv/naeil/a.db");
  });

  it("설정이 없고 예전 자리에 자료가 있으면 그 파일을 그대로 쓴다 (빈 작업판으로 갈아타지 않음)", () => {
    const c = loadConfig(
      {},
      ctx((p) => p === join("/repo", LEGACY_DB)),
    );
    expect(c.dbPath).toBe("/repo/data/naeil.db");
    expect(c.notes.some((n) => n.includes("저장소 폴더 안"))).toBe(true);
  });

  it("설정도 예전 자료도 없으면 저장소 밖 앱 자료 폴더", () => {
    const c = loadConfig({}, ctx());
    expect(c.dbPath).toBe("/Users/me/Library/Application Support/naeil/naeil.db");
    expect(c.notes).toEqual([]);
  });

  it("운영체제별 기본 자리", () => {
    expect(defaultDataDir("darwin", {}, "/Users/me")).toBe(
      "/Users/me/Library/Application Support/naeil",
    );
    expect(defaultDataDir("linux", {}, "/home/me")).toBe("/home/me/.local/share/naeil");
    expect(defaultDataDir("linux", { XDG_DATA_HOME: "/x" }, "/home/me")).toBe("/x/naeil");
    expect(
      defaultDataDir("win32", { APPDATA: "C:\\Users\\me\\AppData\\Roaming" }, "C:\\Users\\me"),
    ).toContain("naeil");
  });

  it("메모리 자료는 그대로", () => {
    expect(loadConfig({ NAEIL_DB: ":memory:" }, ctx()).dbPath).toBe(":memory:");
  });
});

describe("상태 확인이 자료 파일까지 본다", () => {
  const start = () => {
    const dir = scratch();
    const dbPath = join(dir, "naeil.db");
    const db = openDb(dbPath);
    return { dir, dbPath, db, app: buildApp({ db, dbPath }) };
  };
  const health = async (app: ReturnType<typeof buildApp>) => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expectSpec(res, "GET", "/health");
    return res;
  };

  it("정상이면 200", async () => {
    const { app } = start();
    const res = await health(app);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: true,
      version: VERSION,
      checks: { db: "ok", web: "off", backup: "off" },
    });
  });

  it("켜진 채 파일이 지워지면 503 missing", async () => {
    const { app, dbPath } = start();
    for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) if (existsSync(f)) unlinkSync(f);
    const res = await health(app);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ ok: false, checks: { db: "missing" } });
  });

  it("켜진 채 다른 파일(백업본)로 바뀌면 503 replaced", async () => {
    const { app, db, dbPath, dir } = start();
    db.pragma("wal_checkpoint(TRUNCATE)");
    const backup = join(dir, "backup.db");
    copyFileSync(dbPath, backup);
    renameSync(backup, dbPath);
    const res = await health(app);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ ok: false, checks: { db: "replaced" } });
  });

  it("자료 연결이 닫혀 읽기가 실패하면 503 error", async () => {
    const { app, db } = start();
    db.close();
    const res = await health(app);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ ok: false, checks: { db: "error" } });
  });
});

describe("화면을 굽지 않고 켰을 때", () => {
  it("첫 주소가 이유를 보여 주고, 상태 확인은 web missing", async () => {
    const app = buildApp({ webDir: join(scratch(), "없는-화면") });
    const page = await app.inject({ method: "GET", url: "/" });
    expect(page.statusCode).toBe(503);
    expect(page.body).toContain("npm run build");
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.json()).toEqual({
      ok: true,
      version: VERSION,
      checks: { db: "ok", web: "missing", backup: "off" },
    });
  });
});

describe("켜 둔 채 스스로 살피기", () => {
  it("다른 파일로 바뀌면 끄고 다시 켜 달라고 한다, 나머지는 켜 둔다", () => {
    expect(selfCheckAction("replaced")).toBe("restart");
    // 지워졌을 때 다시 켜면 빈 자료 파일이 새로 생겨 정상처럼 보인다
    expect(selfCheckAction("missing")).toBe("keep");
    expect(selfCheckAction("error")).toBe("keep");
    expect(selfCheckAction("ok")).toBe("keep");
    expect(RESTART_EXIT_CODE).not.toBe(0);
  });
});
