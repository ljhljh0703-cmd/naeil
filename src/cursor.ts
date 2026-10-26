// 목록 나누기 커서 (작가 결정 2026-10-25: 커서). 속 내용은 서버만 읽는다.
import { BadInput } from "./errors.js";

export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeCursor<T>(cursor: string): T {
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as T;
  } catch {
    throw new BadInput("cursor 가 잘못됨. 앞 응답의 nextCursor 를 그대로 넣으세요");
  }
}
