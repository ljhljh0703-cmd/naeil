// 백업 명령
//   npm run backup -- run              지금 백업 + 그 백업으로 복원 연습 + 오래된 백업 정리 (매일 자동 실행이 부름)
//   npm run backup -- list             백업 목록
//   npm run backup -- drill [파일|latest]  복원 연습만 (실제 자료는 그대로)
//   npm run backup -- restore <파일|latest> 되살리기. 서버가 꺼져 있을 때만 (맥: scripts/macos/restore.sh 가 끄고 켬)
// 맥 배포본에서는 node "<배포본>/dist/cli/backup.js" run 처럼 부른다.
import { basename, isAbsolute, join } from "node:path";
import {
  backupDirFor,
  drill,
  listBackups,
  makeBackup,
  prune,
  restore,
  writeDrillResult,
} from "../backup.js";
import { loadConfig } from "../config.js";
import { openDb } from "../db/connection.js";
import { loadEnv } from "../paths.js";
import { ledgerPathFor, syncRevocations } from "../revocations.js";

loadEnv();
const config = loadConfig();
if (config.dbPath === ":memory:") {
  console.error("메모리 자료는 백업하지 않음");
  process.exit(1);
}
const dir = backupDirFor(config.dbPath);
const ledger = ledgerPathFor(config.dbPath);
const keep = Number(process.env.NAEIL_BACKUP_KEEP ?? 14);
const [cmd, arg] = process.argv.slice(2);

function pick(which: string | undefined): string {
  const all = listBackups(dir);
  if (!which || which === "latest") {
    const last = all.at(-1);
    if (!last) throw new Error(`백업이 없음: ${dir}`);
    return last.file;
  }
  return isAbsolute(which) ? which : join(dir, which);
}

function printDrill(r: Awaited<ReturnType<typeof drill>>) {
  for (const c of r.checks)
    console.log(
      `  ${c.ok ? "통과" : "실패"}  ${c.name}${c.detail && !c.ok ? `  (${c.detail})` : ""}`,
    );
  console.log(r.ok ? "복원 연습 통과" : "복원 연습 실패");
}

async function serverUp(): Promise<boolean> {
  try {
    const res = await fetch(`http://${config.host}:${config.port}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.status > 0;
  } catch {
    return false;
  }
}

try {
  console.log(`자료 파일: ${config.dbPath}\n백업 폴더: ${dir}`);
  if (cmd === "run") {
    const db = openDb(config.dbPath);
    syncRevocations(db, ledger);
    const m = await makeBackup(db, dir);
    db.close();
    console.log(
      `백업: ${m.file} (${m.bytes} 바이트, 할 일 ${m.counts.tasks}, 프로젝트 ${m.counts.projects})`,
    );
    const r = await drill(join(dir, m.file), ledger);
    writeDrillResult(dir, r);
    printDrill(r);
    const removed = prune(dir, keep);
    if (removed.length > 0) console.log(`오래된 백업 정리: ${removed.join(", ")}`);
    if (!r.ok) process.exit(1);
  } else if (cmd === "list") {
    for (const b of listBackups(dir)) {
      const m = b.manifest;
      console.log(
        `${basename(b.file)}  ${m ? `할 일 ${m.counts.tasks}, 프로젝트 ${m.counts.projects}, ${m.bytes} 바이트` : "기록표 없음"}`,
      );
    }
  } else if (cmd === "drill") {
    const r = await drill(pick(arg), ledger);
    writeDrillResult(dir, r);
    printDrill(r);
    if (!r.ok) process.exit(1);
  } else if (cmd === "restore" && arg) {
    if (await serverUp()) {
      throw new Error(
        `서버가 켜져 있음 (${config.host}:${config.port}). 끄고 다시 하세요. 맥 자동 실행이면 bash scripts/macos/restore.sh`,
      );
    }
    const file = pick(arg);
    const r = await restore(file, config.dbPath, ledger);
    console.log(`되살림: ${basename(file)} → ${config.dbPath}`);
    if (r.movedTo) console.log(`되살리기 전 자료는 지우지 않고 옮겨 둠: ${r.movedTo}`);
    if (r.reapplied.length > 0)
      console.log(`폐기 명부로 다시 막은 출입증: ${r.reapplied.join(", ")}`);
  } else {
    console.error("쓰는 법: backup run | list | drill [파일|latest] | restore <파일|latest>");
    process.exit(1);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
