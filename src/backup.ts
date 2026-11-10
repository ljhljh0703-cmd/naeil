// 백업, 복원 연습, 복원.
// - 백업: 켜진 서버가 쓰는 중에도 SQLite 백업 기능으로 한 순간의 모습을 통째로 뜬다(곁 파일 내용 포함)
// - 복원 연습: 뜬 백업을 임시 폴더에 되살려 실제로 열어 보고, 숫자가 맞는지, 폐기한 출입증이 막혀 있는지 본다.
//   실제 자료 파일은 건드리지 않는다
// - 복원: 서버를 끈 상태에서만. 지금 자료는 지우지 않고 옆 폴더로 옮겨 둔다
import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import Database from "better-sqlite3";
import { buildApp } from "./app.js";
import { hashKey } from "./auth.js";
import {
  backupDirFor,
  COUNTED,
  type Counts,
  type DrillResult,
  listBackups,
  type Manifest,
  stamp,
} from "./backup-files.js";
import { openDb } from "./db/connection.js";
import { readLedger, syncRevocations } from "./revocations.js";

export type { DrillResult, Manifest };
export { backupDirFor, listBackups };

const sha256File = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

// 백업 파일을 읽기 전용으로 열어 상태를 잰다
export function inspect(file: string): Omit<Manifest, "file" | "createdAt" | "bytes" | "sha256"> {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const integrity = (db.pragma("integrity_check", { simple: true }) as string) ?? "?";
    const migrations = (
      db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as {
        version: string;
      }[]
    ).map((r) => r.version);
    const counts = Object.fromEntries(
      COUNTED.map((t) => [
        t,
        (db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n,
      ]),
    ) as Counts;
    return { integrity, migrations, counts };
  } finally {
    db.close();
  }
}

export async function makeBackup(
  db: Database.Database,
  dir: string,
  now: Date = new Date(),
): Promise<Manifest> {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `naeil-${stamp(now)}.db`);
  if (existsSync(file)) throw new Error(`같은 이름의 백업이 이미 있음: ${file}`);
  const tmp = `${file}.part`;
  await db.backup(tmp);
  // 백업은 파일 하나로 끝나게 한다 (곁 파일 -wal, -shm 없이). 되살릴 때 서버가 다시 곁 파일 방식으로 연다
  const one = new Database(tmp);
  one.pragma("journal_mode = DELETE");
  one.close();
  const facts = inspect(tmp);
  if (facts.integrity !== "ok") {
    unlinkSync(tmp);
    throw new Error(`뜬 백업이 깨져 있음: ${facts.integrity}`);
  }
  renameSync(tmp, file);
  const manifest: Manifest = {
    file: basename(file),
    createdAt: now.toISOString(),
    bytes: statSync(file).size,
    sha256: sha256File(file),
    ...facts,
  };
  writeFileSync(`${file}.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

// 최근 keep 개만 남긴다 (이 이름 모양의 파일만 지움)
export function prune(dir: string, keep: number): string[] {
  const all = listBackups(dir);
  const old = all.slice(0, Math.max(0, all.length - keep));
  for (const b of old) {
    unlinkSync(b.file);
    if (existsSync(`${b.file}.json`)) unlinkSync(`${b.file}.json`);
  }
  return old.map((b) => basename(b.file));
}

// 복원 연습: 임시 폴더에 되살려 앱으로 열어 본다
export async function drill(backupFile: string, ledgerPath: string): Promise<DrillResult> {
  const checks: DrillResult["checks"] = [];
  const check = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const work = mkdtempSync(join(tmpdir(), "naeil-drill-"));
  try {
    const manifestPath = `${backupFile}.json`;
    const manifest = existsSync(manifestPath)
      ? (JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest)
      : null;
    check("백업 기록표 있음", manifest !== null);
    if (manifest) {
      const sum = sha256File(backupFile);
      check("파일 지문이 뜰 때와 같음", sum === manifest.sha256);
    }
    const facts = inspect(backupFile);
    check("백업 파일 무결성", facts.integrity === "ok", facts.integrity);
    if (manifest) {
      const same = COUNTED.every((t) => facts.counts[t] === manifest.counts[t]);
      check("줄 수가 뜰 때와 같음", same, JSON.stringify(facts.counts));
    }

    // 실제로 되살리듯 복사해 앱으로 연다 (표 구조가 옛 판이면 여기서 최신으로 올라간다)
    const restored = join(work, "naeil.db");
    const src = new Database(backupFile, { readonly: true, fileMustExist: true });
    await src.backup(restored);
    src.close();
    const db = openDb(restored);
    try {
      // 진짜 명부의 사본을 임시 사본에 적용해 본다 (진짜 명부와 자료는 그대로)
      const workLedger = join(work, "revoked-keys.json");
      if (existsSync(ledgerPath)) copyFileSync(ledgerPath, workLedger);
      syncRevocations(db, workLedger);
      const ledger = readLedger(ledgerPath);
      const alive = ledger.filter(
        (r) =>
          (
            db
              .prepare(
                "SELECT count(*) AS n FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL",
              )
              .get(r.keyHash) as { n: number }
          ).n > 0,
      );
      check(
        "폐기 명부를 적용하면 폐기한 출입증이 모두 막힘",
        alive.length === 0,
        `명부 ${ledger.length}건, 살아 남은 것 ${alive.map((r) => r.name).join(", ") || "없음"}`,
      );

      // 앱으로 열어 상태 확인과 목록 한 번 (임시 출입증은 임시 사본에만 만들고 버림)
      const app = buildApp({ db, dbPath: restored });
      const health = await app.inject({ method: "GET", url: "/health" });
      check("되살린 자료로 상태 확인 200", health.statusCode === 200, health.body);
      const temp = `nk_drill_${randomUUID()}`;
      db.prepare(
        "INSERT INTO api_keys (id, workspace_id, name, key_hash, created_at) VALUES (?, 'me', ?, ?, ?)",
      ).run(
        randomUUID(),
        `drill-${randomUUID().slice(0, 8)}`,
        hashKey(temp),
        new Date().toISOString(),
      );
      const list = await app.inject({
        method: "GET",
        url: "/v1/projects?includeTrashed=true",
        headers: { authorization: `Bearer ${temp}` },
      });
      const n = list.statusCode === 200 ? (list.json() as { items: unknown[] }).items.length : -1;
      check(
        "되살린 자료로 프로젝트 목록이 열리고 수가 맞음",
        n === facts.counts.projects,
        `${list.statusCode}, ${n}개`,
      );
      await app.close();
    } finally {
      db.close();
    }
  } catch (err) {
    check("연습 중 오류 없음", false, (err as Error).message);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return {
    at: new Date().toISOString(),
    backup: basename(backupFile),
    ok: checks.every((c) => c.ok),
    checks,
  };
}

export function writeDrillResult(dir: string, result: DrillResult): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "last-drill.json"), `${JSON.stringify(result, null, 2)}\n`);
}

// 복원: 서버가 꺼진 상태에서만 부른다.
// 순서 (11-10 맥 확인에서 Codex 가 짚은 「중간에 실패하면 원래 자료로 안 돌아옴」을 막는 순서)
//   1) 준비: 백업을 옆 임시 파일로 되살려 표 구조 올리기, 폐기 명부 적용, 무결성까지 끝낸다. 여기서 실패하면 지금 자료는 손대지 않은 그대로
//   2) 바꿔 끼우기: 지금 자료(곁 파일 포함)를 before-restore 폴더로 옮기고 준비한 파일을 제자리에 놓는다.
//      여기서 실패하면 옮긴 원래 자료를 제자리로 되돌린 뒤 실패를 알린다
// inject 는 시험에서 단계마다 일부러 실패를 넣는 자리
export type RestoreStage = "prepared" | "moved";
export async function restore(
  backupFile: string,
  dbPath: string,
  ledgerPath: string,
  now: Date = new Date(),
  inject?: (stage: RestoreStage) => void,
): Promise<{ movedTo: string | null; reapplied: string[] }> {
  const facts = inspect(backupFile);
  if (facts.integrity !== "ok") throw new Error(`백업 파일이 깨져 있음: ${facts.integrity}`);
  const sidecars = (f: string) => [f, `${f}-wal`, `${f}-shm`];
  const staging = `${dbPath}.restoring`;
  const clean = (f: string) => {
    for (const x of sidecars(f)) if (existsSync(x)) unlinkSync(x);
  };

  // 1) 준비
  clean(staging);
  let reapplied: string[] = [];
  try {
    const src = new Database(backupFile, { readonly: true, fileMustExist: true });
    try {
      await src.backup(staging);
    } finally {
      src.close();
    }
    const db = openDb(staging);
    try {
      reapplied = syncRevocations(db, ledgerPath).reapplied;
      const after = db.pragma("integrity_check", { simple: true });
      if (after !== "ok") throw new Error(`되살린 자료가 깨져 있음: ${after}`);
      db.pragma("wal_checkpoint(TRUNCATE)");
    } finally {
      db.close();
    }
    inject?.("prepared");
  } catch (err) {
    clean(staging);
    throw err;
  }

  // 2) 바꿔 끼우기
  let movedTo: string | null = null;
  const moved: string[] = [];
  try {
    const current = sidecars(dbPath).filter((f) => existsSync(f));
    if (current.length > 0) {
      movedTo = join(dirname(dbPath), "backups", `before-restore-${stamp(now)}`);
      mkdirSync(movedTo, { recursive: true });
      for (const f of current) {
        renameSync(f, join(movedTo, basename(f)));
        moved.push(f);
      }
    }
    inject?.("moved");
    for (const x of sidecars(staging).slice(1)) if (existsSync(x)) unlinkSync(x);
    renameSync(staging, dbPath);
  } catch (err) {
    // 원래 자료를 제자리로. 준비한 파일은 바꿔 끼우기(마지막 이름 바꾸기)가 성공해야만 제자리에 들어가므로
    // 여기서 dbPath 에 있는 것은 언제나 원래 자료다. 지우지 않는다
    for (const f of moved) {
      const from = join(movedTo as string, basename(f));
      if (existsSync(from)) renameSync(from, f);
    }
    clean(staging);
    throw new Error(`되살리기 바꿔 끼우기 실패, 원래 자료로 되돌림: ${(err as Error).message}`);
  }
  return { movedTo, reapplied };
}
