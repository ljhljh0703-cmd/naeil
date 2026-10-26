// 같은 요청 두 번 막기 (작가 결정 2026-10-25: 지금 넣기).
// AI 세션이 끊겨 같은 「만들기」를 다시 보내도 한 번만 만들어지게 한다.
// - 같은 열쇠 + 같은 내용 → 처음 응답을 그대로 다시 준다
// - 같은 열쇠 + 다른 내용 → 422
// - 열쇠는 24시간 보관. 출입증마다 따로 센다. 성공한 응답(2xx)만 보관한다
import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { IdempotencyReused } from "./errors.js";

const KEEP_MS = 24 * 60 * 60 * 1000;

export type Stored = { status: number; body: unknown; location: string | null };

export function requestHash(method: string, url: string, body: unknown): string {
  return createHash("sha256")
    .update(`${method} ${url}\n${JSON.stringify(body ?? null)}`)
    .digest("hex");
}

export class IdempotencyStore {
  constructor(
    private db: Database.Database,
    private clock: () => Date = () => new Date(),
  ) {}

  // 보관 기간이 지난 것은 지우고, 같은 열쇠가 있으면 처음 응답을 돌려준다.
  find(workspace: string, keyName: string, idemKey: string, hash: string): Stored | null {
    const cutoff = new Date(this.clock().getTime() - KEEP_MS).toISOString();
    this.db.prepare("DELETE FROM idempotency_keys WHERE created_at < ?").run(cutoff);
    const row = this.db
      .prepare(
        "SELECT request_hash, status_code, response_body, location FROM idempotency_keys WHERE workspace_id = ? AND key_name = ? AND idem_key = ?",
      )
      .get(workspace, keyName, idemKey) as
      | {
          request_hash: string;
          status_code: number;
          response_body: string;
          location: string | null;
        }
      | undefined;
    if (!row) return null;
    if (row.request_hash !== hash) throw new IdempotencyReused();
    return { status: row.status_code, body: JSON.parse(row.response_body), location: row.location };
  }

  save(workspace: string, keyName: string, idemKey: string, hash: string, res: Stored): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO idempotency_keys (workspace_id, key_name, idem_key, request_hash, status_code, response_body, location, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        workspace,
        keyName,
        idemKey,
        hash,
        res.status,
        JSON.stringify(res.body),
        res.location,
        this.clock().toISOString(),
      );
  }
}
