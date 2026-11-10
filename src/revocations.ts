// 폐기한 출입증 명부. 자료 파일 「밖」에 따로 둔다.
// 왜: 폐기하기 전에 뜬 백업으로 되살리면, 그 백업 안의 출입증은 아직 살아 있다.
// 명부가 자료 파일과 같이 되돌아가지 않도록 옆 파일로 두고, 켤 때와 되살릴 때마다 다시 적용한다.
// 담는 것은 잠근 값(sha256)뿐. 출입증 원문은 어디에도 없다.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type Database from "better-sqlite3";

export type Revocation = { keyHash: string; name: string; revokedAt: string };
type Ledger = { version: 1; revoked: Revocation[] };

export const ledgerPathFor = (dbPath: string) => join(dirname(dbPath), "revoked-keys.json");

export function readLedger(path: string): Revocation[] {
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf8")) as Ledger;
  if (data.version !== 1 || !Array.isArray(data.revoked)) {
    throw new Error(`폐기 명부 모양이 틀림: ${path}`);
  }
  return data.revoked;
}

function writeLedger(path: string, revoked: Revocation[]): void {
  // 반쯤 쓴 파일이 남지 않게 옆에 쓰고 바꿔 끼운다
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ version: 1, revoked }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}

export function addToLedger(path: string, items: Revocation[]): number {
  const have = readLedger(path);
  const known = new Set(have.map((r) => r.keyHash));
  const fresh = items.filter((r) => !known.has(r.keyHash));
  if (fresh.length > 0) writeLedger(path, [...have, ...fresh]);
  return fresh.length;
}

// 자료 파일과 명부를 양쪽으로 맞춘다.
// 명부 → 자료: 명부에 있는데 자료에서 살아 있는 출입증을 폐기 (백업에서 되살린 경우)
// 자료 → 명부: 자료에서 폐기됐는데 명부에 없는 것을 명부에 추가 (명부가 생기기 전에 폐기한 것)
export function syncRevocations(
  db: Database.Database,
  ledgerPath: string,
): { reapplied: string[]; recorded: number } {
  const ledger = readLedger(ledgerPath);
  const reapplied: string[] = [];
  const revoke = db.prepare(
    "UPDATE api_keys SET revoked_at = ? WHERE key_hash = ? AND revoked_at IS NULL",
  );
  db.transaction(() => {
    for (const r of ledger) {
      if (revoke.run(r.revokedAt, r.keyHash).changes > 0) reapplied.push(r.name);
    }
  })();
  const inDb = db
    .prepare("SELECT key_hash, name, revoked_at FROM api_keys WHERE revoked_at IS NOT NULL")
    .all() as { key_hash: string; name: string; revoked_at: string }[];
  const recorded = addToLedger(
    ledgerPath,
    inDb.map((r) => ({ keyHash: r.key_hash, name: r.name, revokedAt: r.revoked_at })),
  );
  return { reapplied, recorded };
}
