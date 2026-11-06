// 설정은 코드에 박지 않고 바깥(환경 변수)에서 받는다. 맥, 윈도우 어디로 옮겨도 코드는 그대로.
import { existsSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { defaultDataDir, ROOT } from "./paths.js";

export type Config = {
  host: string;
  port: number;
  // 늘 절대경로 (메모리 자료면 ":memory:")
  dbPath: string;
  // 켤 때 알려 줄 것 (자료 파일 자리 등)
  notes: string[];
};

export type ConfigContext = {
  root: string;
  platform: NodeJS.Platform;
  home?: string;
  exists: (path: string) => boolean;
};

const DEFAULT_CONTEXT: ConfigContext = {
  root: ROOT,
  platform: process.platform,
  exists: existsSync,
};

// 예전 기본값(.env.example 의 data/naeil.db). 이미 이 자리에 자료가 있으면 그대로 쓴다.
export const LEGACY_DB = join("data", "naeil.db");

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  ctx: ConfigContext = DEFAULT_CONTEXT,
): Config {
  const port = Number(env.NAEIL_PORT ?? 3700);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`NAEIL_PORT 값이 잘못됨: ${env.NAEIL_PORT}`);
  }
  const notes: string[] = [];
  let dbPath: string;
  const given = env.NAEIL_DB?.trim();
  if (given === ":memory:") {
    dbPath = given;
  } else if (given) {
    // 상대경로는 「켠 폴더」가 아닌 저장소 뿌리 기준. 다른 폴더에서 켜도 빈 작업판이 새로 생기지 않는다.
    dbPath = isAbsolute(given) ? given : resolve(ctx.root, given);
    if (!isAbsolute(given)) notes.push(`NAEIL_DB 가 상대경로라 저장소 기준으로 읽음: ${dbPath}`);
  } else if (ctx.exists(join(ctx.root, LEGACY_DB))) {
    dbPath = join(ctx.root, LEGACY_DB);
  } else {
    dbPath = join(defaultDataDir(ctx.platform, env, ctx.home), "naeil.db");
  }
  if (dbPath !== ":memory:" && !relative(ctx.root, dbPath).startsWith("..")) {
    notes.push(
      "자료 파일이 저장소 폴더 안에 있음. 같은 컴퓨터의 AI 세션이 파일을 직접 열 수 있으니 저장소 밖으로 옮기길 권함 (운영 안내서 참고)",
    );
  }
  // 기본은 이 컴퓨터 안에서만 열림. 폰 접속은 Tailscale 주소로만 연다.
  return { host: env.NAEIL_HOST ?? "127.0.0.1", port, dbPath, notes };
}
