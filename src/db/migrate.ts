// 표 구조 변경을 파일(migrations/NNN_이름.up.sql / .down.sql)로 남기고, 올리기·되돌리기를 한다.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));

type Migration = { version: string; up: string; down: string };

function loadMigrations(dir: string): Migration[] {
  const ups = readdirSync(dir)
    .filter((f) => f.endsWith(".up.sql"))
    .sort();
  return ups.map((up) => {
    const version = up.replace(".up.sql", "");
    return {
      version,
      up: readFileSync(join(dir, up), "utf8"),
      down: readFileSync(join(dir, `${version}.down.sql`), "utf8"),
    };
  });
}

function ensureTable(db: Database.Database): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
}

export function applied(db: Database.Database): string[] {
  ensureTable(db);
  return db
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all()
    .map((r) => (r as { version: string }).version);
}

export function migrateUp(db: Database.Database, dir = MIGRATIONS_DIR): string[] {
  const done = new Set(applied(db));
  const ran: string[] = [];
  for (const m of loadMigrations(dir)) {
    if (done.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.up);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        m.version,
        new Date().toISOString(),
      );
    })();
    ran.push(m.version);
  }
  return ran;
}

export function migrateDownOne(db: Database.Database, dir = MIGRATIONS_DIR): string | null {
  const last = applied(db).at(-1);
  if (!last) return null;
  const m = loadMigrations(dir).find((x) => x.version === last);
  if (!m) throw new Error(`되돌릴 파일이 없음: ${last}`);
  db.transaction(() => {
    db.exec(m.down);
    db.prepare("DELETE FROM schema_migrations WHERE version = ?").run(last);
  })();
  return last;
}
