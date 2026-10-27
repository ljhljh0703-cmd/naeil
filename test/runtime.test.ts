import { describe, expect, it } from "vitest";
import { checkNode, compareVersions, MIN_SAFE } from "../src/runtime.js";

describe("실행 환경 점검", () => {
  it("버전 비교", () => {
    expect(compareVersions("v22.23.4", "22.23.4")).toBe(0);
    expect(compareVersions("22.9.0", "22.23.4")).toBeLessThan(0);
    expect(compareVersions("22.24.0", "22.23.4")).toBeGreaterThan(0);
  });

  it("보안 수정 전 버전은 막는다", () => {
    expect(checkNode("v22.23.3").ok).toBe(false);
    expect(checkNode("v22.23.4").ok).toBe(true);
    expect(checkNode("v24.22.1").ok).toBe(true);
  });

  it("지원이 끝난 줄은 막는다", () => {
    expect(checkNode("v20.19.0").ok).toBe(false);
    expect(checkNode("v25.1.0").ok).toBe(false);
  });

  it("고정 버전(.node-version)이 최소 버전 이상", async () => {
    const { readFileSync } = await import("node:fs");
    const pinned = readFileSync(new URL("../.node-version", import.meta.url), "utf8").trim();
    expect(checkNode(`v${pinned}`).ok).toBe(true);
    expect(MIN_SAFE[22]).toBeDefined();
  });
});
