// 판 표기가 한 곳에서만 바뀌지 않게: package.json, 명세서, 바뀐 내용 문서 맨 위가 같아야 한다
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { buildApp } from "../src/app.js";
import { ROOT, SPEC_PATH, VERSION } from "../src/paths.js";

describe("판 표기", () => {
  it("package.json, 명세서 info.version, CHANGELOG 맨 위 판이 같다", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
    const spec = parse(readFileSync(SPEC_PATH, "utf8")).info.version;
    const top = /^## (\d+\.\d+\.\d+)/m.exec(readFileSync(join(ROOT, "CHANGELOG.md"), "utf8"))?.[1];
    expect({ spec, changelog: top }).toEqual({ spec: pkg, changelog: pkg });
    expect(VERSION).toBe(pkg);
  });

  it("상태 확인이 켜져 있는 판을 알려 준다", async () => {
    const res = await buildApp().inject({ method: "GET", url: "/health" });
    expect(res.json().version).toBe(VERSION);
  });
});
