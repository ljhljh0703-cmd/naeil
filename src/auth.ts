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

// 출입증 종류 (M1-7): 사람, AI 세션, 자동 검사. 「AI 가 바꿨다」 표시와 나중 권한표가 이 칸에 기댄다
export const KEY_KINDS = ["human", "ai", "ci"] as const;
export type KeyKind = (typeof KEY_KINDS)[number];

// 이름만 보고 정하는 기본값. 그 밖의 이름은 만드는 쪽이 종류를 밝힌다 (명령은 --kind 필수)
export const KNOWN_KINDS: Record<string, KeyKind> = { author: "human", claude: "ai", codex: "ai" };

export type KeyInfo = { name: string; workspace: string; kind: KeyKind };

export function createKey(
  db: Database.Database,
  name: string,
  workspace = "me",
  kind: KeyKind = KNOWN_KINDS[name] ?? "human",
): string {
  if (!KEY_NAME.test(name))
    throw new BadInput("이름은 영어 소문자로 시작, 소문자·숫자·- 만 (예 claude)");
  if (!KEY_KINDS.includes(kind)) throw new BadInput(`종류는 ${KEY_KINDS.join(", ")} 중 하나`);
  const key = PREFIX + randomBytes(32).toString("base64url");
  try {
    db.prepare(
      "INSERT INTO api_keys (id, workspace_id, name, key_hash, created_at, kind) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(randomUUID(), workspace, name, hashKey(key), new Date().toISOString(), kind);
  } catch (err) {
    if ((err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new BadInput(`「${name}」 출입증이 이미 있음. 먼저 폐기(revoke)한 뒤 새로 만드세요`);
    }
    throw err;
  }
  return key;
}

// 폐기하면 잠근 값을 돌려준다. 부르는 쪽이 폐기 명부(src/revocations.ts)에도 적는다.
export function revokeKey(
  db: Database.Database,
  name: string,
  workspace = "me",
): { keyHash: string; name: string; revokedAt: string } | null {
  const row = db
    .prepare(
      "SELECT key_hash FROM api_keys WHERE workspace_id = ? AND name = ? AND revoked_at IS NULL",
    )
    .get(workspace, name) as { key_hash: string } | undefined;
  if (!row) return null;
  const revokedAt = new Date().toISOString();
  db.prepare("UPDATE api_keys SET revoked_at = ? WHERE key_hash = ?").run(revokedAt, row.key_hash);
  return { keyHash: row.key_hash, name, revokedAt };
}

export function listKeys(db: Database.Database, workspace = "me") {
  return db
    .prepare(
      "SELECT name, kind, created_at, revoked_at FROM api_keys WHERE workspace_id = ? ORDER BY created_at",
    )
    .all(workspace) as {
    name: string;
    kind: KeyKind;
    created_at: string;
    revoked_at: string | null;
  }[];
}

export function findKey(db: Database.Database, key: string): KeyInfo | null {
  if (!key.startsWith(PREFIX)) return null;
  const row = db
    .prepare(
      "SELECT name, workspace_id, kind FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL",
    )
    .get(hashKey(key)) as { name: string; workspace_id: string; kind: KeyKind } | undefined;
  return row ? { name: row.name, workspace: row.workspace_id, kind: row.kind } : null;
}
