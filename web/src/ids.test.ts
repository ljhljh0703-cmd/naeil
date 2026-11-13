import { describe, expect, it } from "vitest";
import { newKey } from "./ids.js";

const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("다시 시도 열쇠", () => {
  it("randomUUID 가 있으면 그것을 쓴다", () => {
    expect(newKey({ randomUUID: () => "x", getRandomValues: (a) => a })).toBe("x");
  });
  it("평문 주소(randomUUID 없음)에서도 UUID 4판 모양", () => {
    // randomUUID 를 뺀 crypto (폰 평문 주소와 같음)
    const c: Pick<Crypto, "getRandomValues"> = {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    };
    const a = newKey(c);
    const b = newKey(c);
    expect(a).toMatch(UUID4);
    expect(b).toMatch(UUID4);
    expect(a).not.toBe(b);
  });
});
