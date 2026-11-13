// 윈도우 PowerShell 스크립트를 리눅스에서 지키는 것들. 실제로 도는지는 자동 검사의 윈도우 일(ci-verify.ps1)이 본다.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(__dirname, "..", "scripts", "windows");
const files = readdirSync(DIR).filter((f) => f.endsWith(".ps1"));
const code = (f: string) =>
  readFileSync(join(DIR, f), "utf8")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n");

describe("윈도우 스크립트", () => {
  it("모두 있음", () => {
    for (const f of [
      "common",
      "deploy",
      "status",
      "rollback",
      "restore",
      "uninstall",
      "phone",
      "ci-verify",
    ])
      expect(files).toContain(`${f}.ps1`);
  });

  it("머리표(BOM) 있는 UTF-8. 없으면 윈도우 PowerShell 5.1 이 한글을 깨뜨려 읽음", () => {
    for (const f of files)
      expect(readFileSync(join(DIR, f)).subarray(0, 3), f).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });

  it("5.1 에 없는 문법(??, ?., &&, ||, 삼항)을 쓰지 않음", () => {
    for (const f of files) {
      const c = code(f)
        .replace(/'[^'\n]*'/g, "''")
        .replace(/"[^"\n]*"/g, '""');
      expect(c, f).not.toMatch(/\?\?|\?\.|&&|\|\||\s\?\s[^:]+\s:\s/);
    }
  });

  it("배포가 복사하는 실행기 파일이 저장소에 있음", () => {
    const deploy = readFileSync(join(DIR, "deploy.ps1"), "utf8");
    for (const m of deploy.matchAll(/scripts\\([\w-]+\.mjs)/g))
      expect(existsSync(join(__dirname, "..", "scripts", m[1] ?? "")), m[1]).toBe(true);
  });

  it("서버는 이 컴퓨터 안(127.0.0.1)에만 열고, 폰은 tailscale serve 로", () => {
    const svc = readFileSync(join(__dirname, "..", "scripts", "service.mjs"), "utf8");
    expect(svc).toContain('NAEIL_HOST: "127.0.0.1"');
    expect(readFileSync(join(DIR, "phone.ps1"), "utf8")).toContain("serve --bg $Port");
  });

  it("정션(current)은 바로가기만 지움. 판 폴더 안까지 지우는 Remove-Item 을 쓰지 않음", () => {
    expect(code("common.ps1")).toContain("[System.IO.Directory]::Delete($Current)");
    for (const f of files) expect(code(f), f).not.toMatch(/Remove-Item[^\n]*\$Current/);
  });
});
