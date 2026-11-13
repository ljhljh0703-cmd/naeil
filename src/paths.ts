// 저장소 뿌리와 그 아래 고정 파일의 위치. 어느 폴더에서 켜든, 시험용(src)으로 돌든 구운 판(dist)으로 돌든 같은 곳을 가리킨다.
// 예전에는 파일마다 「../../migrations」처럼 자기 위치에서 상대로 찾아서, 구운 판(dist/src/…)에서는 한 칸씩 어긋났다.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// package.json 과 migrations 폴더가 같이 있는 곳까지 위로 올라간다
export function findRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "migrations"))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error(`저장소 뿌리를 못 찾음 (시작: ${start})`);
    dir = up;
  }
}

export const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));
export const MIGRATIONS_DIR = join(ROOT, "migrations");
export const SPEC_PATH = join(ROOT, "docs", "api", "openapi.yaml");
export const WEB_DIR = join(ROOT, "web", "dist");
export const ENV_FILE = join(ROOT, ".env");
// 켜져 있는 판. 배포본에도 package.json 이 같이 복사된다
export const VERSION: string = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

// 자료 파일의 기본 자리: 저장소 밖, 운영체제가 앱 자료를 두라고 정한 곳.
// 맥의 문서·데스크탑(아이클라우드 동기화)이 아닌 「라이브러리/Application Support」.
// 윈도우는 이 기기에만 두는 AppData\Local (Roaming 은 다른 기기로 따라다니는 설정용이라 자료 파일에 맞지 않음).
export function defaultDataDir(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  if (platform === "darwin") return join(home, "Library", "Application Support", "naeil");
  if (platform === "win32")
    return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "naeil");
  return join(env.XDG_DATA_HOME ?? join(home, ".local", "share"), "naeil");
}

// .env 는 켠 폴더가 아닌 저장소 뿌리에서 읽는다. 이미 있는 환경 변수는 덮지 않는다.
export function loadEnv(path: string = ENV_FILE): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}
