// 도구별 출입증 (작가 결정 2026-10-25).
// - 도구마다 1장 (author = 화면, claude, codex). 세션마다 만들지 않는다
// - 키 원문은 만들 때 한 번만 보여 주고, 서버에는 잠근 값(sha256)만 저장
// - 서버는 키를 보고 「누가」를 스스로 정한다. 요청이 밝힌 이름은 믿지 않는다
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { BadInput } from "./errors.js";

export const KEY_NAME = /^[a-z][a-z0-9-]{0,31}$/;
const PREFIX = "nk_";

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export type KeyInfo = { name: string; workspace: string };

export function createKey(db: Database.Database, name: string, workspace = "me"): string {
  if (!KEY_NAME.test(name))
    throw new BadInput("이름은 영어 소문자로 시작, 소문자·숫자·- 만 (예 claude)");
  const key = PREFIX + randomBytes(32).toString("base64url");
  try {
    db.prepare(
      "INSERT INTO api_keys (id, workspace_id, name, key_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(randomUUID(), workspace, name, hashKey(key), new Date().toISOString());
  } catch (err) {
    if ((err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new BadInput(`「${name}」 출입증이 이미 있음. 먼저 폐기(revoke)한 뒤 새로 만드세요`);
    }
    throw err;
  }
  return key;
}

export function revokeKey(db: Database.Database, name: string, workspace = "me"): boolean {
  const res = db
    .prepare(
      "UPDATE api_keys SET revoked_at = ? WHERE workspace_id = ? AND name = ? AND revoked_at IS NULL",
    )
    .run(new Date().toISOString(), workspace, name);
  return res.changes > 0;
}

export function listKeys(db: Database.Database, workspace = "me") {
  return db
    .prepare(
      "SELECT name, created_at, revoked_at FROM api_keys WHERE workspace_id = ? ORDER BY created_at",
    )
    .all(workspace) as { name: string; created_at: string; revoked_at: string | null }[];
}

export function findKey(db: Database.Database, key: string): KeyInfo | null {
  if (!key.startsWith(PREFIX)) return null;
  const row = db
    .prepare("SELECT name, workspace_id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL")
    .get(hashKey(key)) as { name: string; workspace_id: string } | undefined;
  return row ? { name: row.name, workspace: row.workspace_id } : null;
}
