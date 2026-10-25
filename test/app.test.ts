import { describe, expect, it } from "vitest";
import { buildApp, TAGLINE } from "../src/app.js";
import { loadConfig } from "../src/config.js";

describe("기본 서버", () => {
  it("첫 주소가 이름과 한 줄 소개를 준다", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: "naeil", tagline: TAGLINE });
  });

  it("상태 확인 주소가 ok를 준다", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.json()).toEqual({ ok: true });
  });
});

describe("설정", () => {
  it("기본값은 이 컴퓨터 안에서만 열린다", () => {
    expect(loadConfig({})).toEqual({ host: "127.0.0.1", port: 3700, dbPath: "data/naeil.db" });
  });

  it("잘못된 포트는 막는다", () => {
    expect(() => loadConfig({ NAEIL_PORT: "abc" })).toThrow();
  });
});
