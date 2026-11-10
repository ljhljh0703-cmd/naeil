// M0-4: 매일 백업, 복원 연습, 복원. 그리고 「백업에서 되살려도 폐기한 출입증은 막힌 채로」.
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createKey, findKey, revokeKey } from "../src/auth.js";
import {
  backupDirFor,
  drill,
  listBackups,
  makeBackup,
  prune,
  restore,
  writeDrillResult,
} from "../src/backup.js";
import { backupState } from "../src/backup-files.js";
import { openDb } from "../src/db/connection.js";
import { Store } from "../src/db/store.js";
import { addToLedger, ledgerPathFor, readLedger, syncRevocations } from "../src/revocations.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "naeil-backup-"));
  dirs.push(dir);
  const dbPath = join(dir, "naeil.db");
  const db = openDb(dbPath);
  const store = new Store(db);
  const projectId = store.createProject("test", "백업 시험");
  store.createTask("test", { projectId, title: "첫 할 일" });
  return {
    dir,
    dbPath,
    db,
    store,
    projectId,
    backups: backupDirFor(dbPath, {}),
    ledger: ledgerPathFor(dbPath),
  };
}
const at = (s: string) => new Date(s);

describe("백업", () => {
  it("켜진 채로 뜨고, 기록표에 지문과 줄 수가 남는다", async () => {
    const { db, backups } = setup();
    const m = await makeBackup(db, backups, at("2026-11-10T04:17:00Z"));
    expect(m.file).toBe("naeil-20261110T041700Z.db");
    expect(m.integrity).toBe("ok");
    expect(m.counts).toMatchObject({ projects: 1, tasks: 1 });
    expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(join(backups, `${m.file}.json`))).toBe(true);
    // 백업은 파일 하나 + 기록표. 곁 파일(-wal, -shm)이나 쓰다 만 파일이 남지 않는다
    expect(readdirSync(backups).sort()).toEqual([m.file, `${m.file}.json`]);
  });

  it("곁 파일(-wal)에만 있는 최신 변경까지 들어간다", async () => {
    const { db, store, projectId, backups } = setup();
    db.pragma("wal_autocheckpoint = 0");
    store.createTask("test", { projectId, title: "곁 파일에만 있는 할 일" });
    const m = await makeBackup(db, backups, at("2026-11-10T04:18:00Z"));
    expect(m.counts.tasks).toBe(2);
  });

  it("최근 것만 남기고 이 이름 모양의 파일만 지운다", async () => {
    const { db, backups } = setup();
    for (let d = 1; d <= 5; d++) await makeBackup(db, backups, at(`2026-11-0${d}T04:00:00Z`));
    writeFileSync(join(backups, "작가가-둔-파일.db"), "x");
    const removed = prune(backups, 3);
    expect(removed).toEqual(["naeil-20261101T040000Z.db", "naeil-20261102T040000Z.db"]);
    expect(listBackups(backups).map((b) => b.file.slice(-28))).toHaveLength(3);
    expect(existsSync(join(backups, "작가가-둔-파일.db"))).toBe(true);
  });
});

describe("폐기한 출입증은 백업에서 되살려도 막힌 채로", () => {
  it("명부 없이 되살리면 폐기한 출입증이 다시 통한다 (고치기 전 구멍 재현)", async () => {
    const { db, dbPath, backups } = setup();
    const key = createKey(db, "codex");
    const m = await makeBackup(db, backups, at("2026-11-10T04:00:00Z"));
    revokeKey(db, "codex"); // 명부에 적지 않음
    db.close();
    await restore(join(backups, m.file), dbPath, join(backups, "없는-명부.json"));
    const again = openDb(dbPath);
    expect(findKey(again, key)).not.toBeNull();
    again.close();
  });

  it("명부에 적고 되살리면 다시 막힌다", async () => {
    const { db, dbPath, backups, ledger } = setup();
    const key = createKey(db, "codex");
    const m = await makeBackup(db, backups, at("2026-11-10T04:00:00Z"));
    const revoked = revokeKey(db, "codex");
    expect(revoked).not.toBeNull();
    if (revoked) addToLedger(ledger, [revoked]);
    db.close();
    const r = await restore(join(backups, m.file), dbPath, ledger);
    expect(r.reapplied).toEqual(["codex"]);
    const again = openDb(dbPath);
    expect(findKey(again, key)).toBeNull();
    again.close();
  });

  it("명부가 생기기 전에 폐기한 것은 켤 때 명부로 옮겨 적는다", () => {
    const { db, ledger } = setup();
    createKey(db, "claude");
    revokeKey(db, "claude");
    expect(readLedger(ledger)).toEqual([]);
    const r = syncRevocations(db, ledger);
    expect(r.recorded).toBe(1);
    expect(readLedger(ledger).map((x) => x.name)).toEqual(["claude"]);
    // 두 번 해도 늘지 않는다
    expect(syncRevocations(db, ledger).recorded).toBe(0);
  });

  it("명부에는 잠근 값만 있고 출입증 원문은 없다", () => {
    const { db, ledger } = setup();
    const key = createKey(db, "claude");
    const r = revokeKey(db, "claude");
    if (r) addToLedger(ledger, [r]);
    const text = JSON.stringify(readLedger(ledger));
    expect(text).not.toContain(key);
    expect(text).not.toContain(key.slice(3));
  });
});

describe("복원 연습", () => {
  it("통과: 무결성, 지문, 줄 수, 폐기 명부, 앱으로 열기", async () => {
    const { db, backups, ledger } = setup();
    createKey(db, "codex");
    const r0 = revokeKey(db, "codex");
    if (r0) addToLedger(ledger, [r0]);
    const m = await makeBackup(db, backups, at("2026-11-10T04:00:00Z"));
    const r = await drill(join(backups, m.file), ledger);
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.ok).toBe(true);
    // 연습이 백업 폴더에 곁 파일을 남기지 않는다
    expect(readdirSync(backups).filter((f) => f.endsWith("-wal") || f.endsWith("-shm"))).toEqual(
      [],
    );
  });

  it("뜬 뒤 파일이 바뀌면(망가지면) 실패로 알린다", async () => {
    const { db, backups, ledger } = setup();
    const m = await makeBackup(db, backups, at("2026-11-10T04:00:00Z"));
    const file = join(backups, m.file);
    writeFileSync(file, "망가진 파일");
    const r = await drill(file, ledger);
    expect(r.ok).toBe(false);
  });

  it("실제 자료 파일은 건드리지 않는다", async () => {
    const { db, dbPath, backups, ledger } = setup();
    const m = await makeBackup(db, backups, at("2026-11-10T04:00:00Z"));
    const before = readdirSync(join(dbPath, ".."));
    await drill(join(backups, m.file), ledger);
    expect(readdirSync(join(dbPath, ".."))).toEqual(before);
    expect(new Store(db).listProjects({}).length).toBe(1);
  });
});

describe("복원", () => {
  it("지금 자료는 지우지 않고 옆 폴더로 옮겨 둔 뒤 되살린다", async () => {
    const { db, dbPath, store, projectId, backups, ledger } = setup();
    const m = await makeBackup(db, backups, at("2026-11-10T04:00:00Z"));
    store.createTask("test", { projectId, title: "백업 뒤에 넣은 할 일" });
    db.close();
    const r = await restore(join(backups, m.file), dbPath, ledger, at("2026-11-10T09:00:00Z"));
    expect(r.movedTo).toBe(join(backups, "before-restore-20261110T090000Z"));
    expect(existsSync(join(r.movedTo ?? "", "naeil.db"))).toBe(true);
    const again = openDb(dbPath);
    expect((again.prepare("SELECT count(*) AS n FROM tasks").get() as { n: number }).n).toBe(1);
    again.close();
    // 옮겨 둔 자료에는 백업 뒤에 넣은 할 일이 그대로
    const old = openDb(join(r.movedTo ?? "", "naeil.db"));
    expect((old.prepare("SELECT count(*) AS n FROM tasks").get() as { n: number }).n).toBe(2);
    old.close();
  });

  it("망가진 백업으로는 되살리지 않고, 지금 자료도 그대로 둔다", async () => {
    const { db, dbPath, backups, ledger } = setup();
    const bad = join(backups, "naeil-20261110T040000Z.db");
    await makeBackup(db, backups, at("2026-11-10T04:00:00Z"));
    writeFileSync(bad, "망가진 파일");
    db.close();
    await expect(restore(bad, dbPath, ledger)).rejects.toThrow();
    expect(existsSync(dbPath)).toBe(true);
  });
});

describe("상태 확인의 백업 칸", () => {
  it("없음, 정상, 오래됨, 연습 실패, 끔", async () => {
    const { db, backups } = setup();
    expect(backupState(undefined)).toBe("off");
    expect(backupState(backups)).toBe("none");
    await makeBackup(db, backups, at("2026-11-10T04:00:00Z"));
    expect(backupState(backups, at("2026-11-10T20:00:00Z"))).toBe("ok");
    expect(backupState(backups, at("2026-11-12T04:00:00Z"))).toBe("stale");
    writeDrillResult(backups, { at: "x", backup: "x", ok: false, checks: [] });
    expect(backupState(backups, at("2026-11-10T20:00:00Z"))).toBe("failed");
  });

  it("상태 확인 응답에 실린다 (알리기만, ok 는 그대로)", async () => {
    const { db, dbPath, backups } = setup();
    const app = buildApp({
      db,
      dbPath,
      backupDir: backups,
      clock: () => at("2026-11-10T20:00:00Z"),
    });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, checks: { backup: "none" } });
  });
});
