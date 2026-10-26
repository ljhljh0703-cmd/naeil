// 목록 나누기 커서 (작가 결정 2026-10-25: 커서). 속 내용은 서버만 읽는다.
import { BadInput } from "./errors.js";

export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

// 모양 검사까지 통과해야 쓴다. 고쳐 쓴 커서가 데이터베이스까지 가서 서버 오류(500)가 나지 않게.
export function decodeCursor<T>(
  cursor: string,
  valid: (v: Partial<Record<keyof T, unknown>> | null) => boolean,
): T {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    value = undefined;
  }
  const obj = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  if (!obj || !valid(obj as Partial<Record<keyof T, unknown>>)) {
    throw new BadInput("cursor 가 잘못됨. 앞 응답의 nextCursor 를 그대로 넣으세요");
  }
  return obj as T;
}
