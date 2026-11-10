// 백업 폴더 읽기 (상태 확인이 쓴다). 앱(app.ts)에서도 불러 쓰므로 앱을 불러오지 않는다.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export const COUNTED = ["projects", "milestones", "tasks", "change_log", "api_keys"] as const;
export type Counts = Record<(typeof COUNTED)[number], number>;

export type Manifest = {
  file: string;
  createdAt: string;
  bytes: number;
  sha256: string;
  integrity: string;
  migrations: string[];
  counts: Counts;
};

export type DrillResult = {
  at: string;
  backup: string;
  ok: boolean;
  checks: { name: string; ok: boolean; detail?: string }[];
};

export const NAME = /^naeil-(\d{8}T\d{6}Z)\.db$/;
export const backupDirFor = (dbPath: string, env: NodeJS.ProcessEnv = process.env) =>
  env.NAEIL_BACKUP_DIR || join(dirname(dbPath), "backups");

export const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");

export function listBackups(dir: string): { file: string; manifest: Manifest | null }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => NAME.test(f))
    .sort()
    .map((f) => {
      const m = join(dir, `${f}.json`);
      return {
        file: join(dir, f),
        manifest: existsSync(m) ? (JSON.parse(readFileSync(m, "utf8")) as Manifest) : null,
      };
    });
}

// 상태 확인용: 최근 백업이 얼마나 오래됐는지, 마지막 연습이 통과했는지
export type BackupState = "ok" | "stale" | "none" | "failed" | "off";
export function backupState(
  dir: string | undefined,
  now: Date = new Date(),
  maxHours = 36,
): BackupState {
  if (!dir) return "off";
  const all = listBackups(dir);
  const last = all.at(-1);
  if (!last) return "none";
  const drillFile = join(dir, "last-drill.json");
  if (existsSync(drillFile)) {
    const d = JSON.parse(readFileSync(drillFile, "utf8")) as DrillResult;
    if (!d.ok) return "failed";
  }
  const m = NAME.exec(basename(last.file));
  const at = last.manifest?.createdAt ?? (m ? m[1] : null);
  const t = at ? Date.parse(at) : Number.NaN;
  if (Number.isNaN(t)) return "stale";
  return now.getTime() - t > maxHours * 3600_000 ? "stale" : "ok";
}
