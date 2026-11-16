// 가져오기와 vault 다리 (M1-3, 2026-11-13 작가 결정 「vault 다리」 「AI 몫으로」)
//   1) 출처에서 일을 가져와 넣거나 고친다: vault 할 일 원장(JSON), 깃허브 이슈
//   2) vault 받는 폴더의 요청 파일을 처리한다: 클라우드 세션이 작업판에 닿는 길
//   3) vault 에 「오늘 한 장」을 쓴다: 클라우드 세션이 작업판을 읽는 길
// 저장은 늘 Store 를 거친다 (표를 직접 고치지 않음). 출처 쪽 실패는 그 출처만 실패로 남기고 다음 출처로 넘어간다.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import type { BlockedReason, ImportItem, ImportResult, Store, Task, Who } from "./db/store.js";
import { buildHandoff } from "./handoff.js";
import { dDay, dueSoon, kstDate, pickNow, waitingOnMe } from "./today.js";

export type SourceConfig =
  | { type: "vault-json"; path: string; project?: string }
  | { type: "github"; repo: string; project?: string };

export type ImportConfig = {
  sources?: SourceConfig[];
  todaySheet?: string; // vault 안 「오늘 한 장」 파일 경로
  inbox?: string; // vault 안 받는 폴더 경로
  handoffDir?: string; // vault 안 이어하기 한 장 폴더 (프로젝트마다 한 장, M1-4)
};

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type SourceReport = {
  source: string;
  project: string;
  result?: ImportResult;
  error?: string;
};

// 가져오기를 한 사람. 출입증 없이 명령줄에서 도는 일이라 종류는 비운다 (사람도 AI 도 아님)
export const IMPORTER: Who = { actor: "import", session: null, kind: null };

// ── vault 할 일 원장 ──
// skills/vault-maintenance/naeil-source.json 모양: { 출처, 할일: [{ 번호, 제목, 몫, 종류, 상태, 마감?, 선택지?, 추천?, 근거?, 끝나면?, 메모? }] }
type LedgerItem = Record<string, unknown>;

const DONE_STATES = new Set(["끝", "완료", "done"]);

export function parseVaultLedger(text: string): { source: string; items: ImportItem[] } {
  const data = JSON.parse(text.replace(/^﻿/, "")) as { 출처?: unknown; 할일?: unknown };
  const source = typeof data.출처 === "string" ? data.출처 : "vault";
  if (!Array.isArray(data.할일)) throw new Error("원장에 「할일」 목록이 없음");
  const items: ImportItem[] = [];
  for (const raw of data.할일 as LedgerItem[]) {
    const ref = str(raw.번호);
    const title = str(raw.제목);
    if (!ref || !title) continue;
    const state = DONE_STATES.has(str(raw.상태) ?? "") ? "done" : "open";
    const owner = str(raw.몫) === "AI" ? "ai" : "author";
    const decision = str(raw.종류) === "결정" && owner === "author";
    const lines: string[] = [];
    const add = (label: string, v: unknown) => {
      const s = Array.isArray(v) ? v.map(String).join(", ") : str(v);
      if (s) lines.push(`${label}: ${s}`);
    };
    add("상태", raw.상태);
    if (!decision) {
      add("선택지", raw.선택지);
      add("추천", raw.추천);
    }
    add("끝나면", raw.끝나면);
    add("근거", raw.근거);
    add("메모", raw.메모);
    items.push({
      ref,
      title: title.slice(0, 200),
      state,
      owner,
      decision,
      // 결정은 결정함으로: 선택지, 추천, 근거 (M1-4)
      options: decision && Array.isArray(raw.선택지) ? raw.선택지.map(String) : undefined,
      recommended: decision ? (str(raw.추천) ?? null) : undefined,
      basis: decision ? (str(raw.근거) ?? null) : undefined,
      dueAt: str(raw.마감) ? `${str(raw.마감)}T23:59:59+09:00` : null,
      body: lines.length ? lines.join("\n") : null,
      url: null,
    });
  }
  const name = slug(source);
  return { source: (name.startsWith("vault") ? name : `vault-${name}`).slice(0, 32), items };
}

// ── 깃허브 이슈 (AI 몫) ──
// 열린 이슈는 넣고, 최근 30일 안에 닫힌 이슈는 이미 가져온 것만 닫는다 (지난 이슈를 쌓지 않음).
// 이슈 본문은 가져오지 않는다 (바깥 글. 제목과 원문 주소만)
export async function fetchGithubIssues(
  repo: string,
  fetchImpl: FetchLike,
  now: Date,
  token?: string,
): Promise<ImportItem[]> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`저장소 이름은 owner/name: ${repo}`);
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "naeil-import",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const out: ImportItem[] = [];
  for (const [state, extra] of [
    ["open", ""],
    ["closed", `&since=${since}`],
  ] as const) {
    for (let page = 1; page <= 5; page++) {
      const res = await fetchImpl(
        `https://api.github.com/repos/${repo}/issues?state=${state}&per_page=100&page=${page}${extra}`,
        { headers },
      );
      if (!res.ok) throw new Error(`깃허브 ${repo} ${res.status}`);
      const list = (await res.json()) as {
        number: number;
        title: string;
        state: string;
        html_url: string;
        pull_request?: unknown;
      }[];
      for (const i of list) {
        if (i.pull_request) continue; // 검토 요청(PR)은 빼고 이슈만
        out.push({
          ref: `${repo}#${i.number}`,
          title: `${i.title}`.slice(0, 200) || `#${i.number}`,
          state: i.state === "closed" ? "done" : "open",
          owner: "ai",
          url: i.html_url,
          body: null,
        });
      }
      if (list.length < 100) break;
    }
  }
  return out;
}

// ── 한 번 돌리기 ──

export async function runImport(
  store: Store,
  config: ImportConfig,
  deps: { fetch: FetchLike; now: () => Date; githubToken?: string },
): Promise<{
  sources: SourceReport[];
  inbox: InboxReport[];
  sheet?: string;
  handoffs?: string[];
}> {
  const inbox = config.inbox ? processInbox(store, config.inbox, deps.now) : [];
  const sources: SourceReport[] = [];
  for (const src of config.sources ?? []) {
    let source = src.type === "github" ? "github" : "vault";
    let project = src.project ?? (src.type === "github" ? src.repo : "vault");
    try {
      let items: ImportItem[];
      if (src.type === "vault-json") {
        const parsed = parseVaultLedger(readFileSync(src.path, "utf8"));
        source = parsed.source;
        items = parsed.items;
        project = src.project ?? parsed.source;
      } else {
        items = await fetchGithubIssues(src.repo, deps.fetch, deps.now(), deps.githubToken);
      }
      // 이미 끝난 일은 새로 넣지 않는다 (지난 일로 작업판을 채우지 않음). 이미 있는 것만 끝냄으로 고친다
      const known = items.filter((i) => i.state === "open" || store.findBySource(source, i.ref));
      const projectId = store.ensureProject(IMPORTER, project);
      sources.push({
        source,
        project,
        result: store.importItems(IMPORTER, source, projectId, known),
      });
    } catch (err) {
      sources.push({ source, project, error: (err as Error).message });
    }
  }
  let sheet: string | undefined;
  if (config.todaySheet) {
    writeFileSync(config.todaySheet, todaySheet(store, deps.now()));
    sheet = config.todaySheet;
  }
  // 이어하기 한 장: 열린 일이 있는 프로젝트마다. 스위치를 끄면 쓰지 않는다 (기록은 계속 받음)
  const handoffs: string[] = [];
  if (config.handoffDir && store.isOn("handoff")) {
    mkdirSync(config.handoffDir, { recursive: true });
    const open = new Set(
      store
        .listTasks({ status: undefined })
        .filter((t) => t.status !== "done")
        .map((t) => t.project_id),
    );
    for (const p of store.listProjects()) {
      if (!open.has(p.id)) continue;
      const h = buildHandoff(store, { projectId: p.id }, deps.now());
      if (!h) continue;
      const file = join(config.handoffDir, `${fileName(p.name)}.md`);
      writeFileSync(
        file,
        `---\ngenerated_by: naeil\ngenerated_at: ${deps.now().toISOString()}\nproject_id: ${p.id}\n---\n${h.text}`,
      );
      handoffs.push(file);
    }
  }
  return { sources, inbox, sheet, handoffs };
}

// ── vault 받는 폴더: 클라우드 세션의 요청 ──
// 파일 하나 = 요청 하나 (JSON). 처리한 파일은 「처리함」 폴더로 옮기고 결과를 옆에 적는다.
//   { "요청": "새 할 일", "제목": "...", "프로젝트": "...", "마감": "2026-11-20", "누가": "claude-cloud" }
//   { "요청": "하는 중" | "끝" | "되살리기", "할일": "<할 일 번호>" }
//   { "요청": "멈춤", "할일": "<번호>", "이유": "내 결정 기다림" | "바깥 답 기다림" | "기술 문제" }
//   { "요청": "정할 것", "할일": "<번호>", "질문": "...", "선택지": ["가", "나"], "추천": "가", "근거": "..." }
//   { "요청": "어디까지", "할일": "<번호>", "한 줄": "..." }
// 휴지통에 넣기, 지우기, 프로젝트 바꾸기는 받지 않는다 (작가가 화면에서)
export type InboxReport = { file: string; ok: boolean; message: string };

const REASONS: Record<string, BlockedReason> = {
  "내 결정 기다림": "my_decision",
  "바깥 답 기다림": "external",
  "기술 문제": "tech",
};

export function processInbox(store: Store, dir: string, now: () => Date): InboxReport[] {
  if (!existsSync(dir)) return [];
  const done = join(dir, "처리함");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const out: InboxReport[] = [];
  for (const f of files) {
    const path = join(dir, f);
    let report: InboxReport;
    try {
      const req = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, "")) as Record<
        string,
        unknown
      >;
      report = { file: f, ok: true, message: applyRequest(store, req, f) };
    } catch (err) {
      report = { file: f, ok: false, message: (err as Error).message };
    }
    out.push(report);
    mkdirSync(done, { recursive: true });
    const stamp = now().toISOString().replace(/[:.]/g, "-");
    const target = join(done, `${stamp}-${basename(f)}`);
    renameSync(path, target);
    writeFileSync(
      `${target}.결과.json`,
      `${JSON.stringify({ 처리: now().toISOString(), 성공: report.ok, 결과: report.message }, null, 2)}\n`,
    );
  }
  return out;
}

function applyRequest(store: Store, req: Record<string, unknown>, file: string): string {
  const actor = (str(req.누가) ?? "inbox")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, 32);
  const who: Who = { actor: actor || "inbox", session: null, kind: "ai" };
  const kind = str(req.요청);
  if (kind === "새 할 일") {
    const title = str(req.제목);
    if (!title) throw new Error("제목이 없음");
    const projectId = store.ensureProject(who, str(req.프로젝트) ?? "받은 일");
    const due = str(req.마감);
    const id = store.createTask(who, {
      projectId,
      title: title.slice(0, 200),
      source: "inbox",
      sourceRef: file,
      dueAt: due ? `${due}T23:59:59+09:00` : undefined,
    });
    return `새 할 일 ${id}`;
  }
  const id = str(req.할일);
  if (!id) throw new Error("할일 번호가 없음");
  const task = store.getTask(id, { includeTrashed: kind === "되살리기" });
  if (!task) throw new Error(`할 일이 없음: ${id}`);
  if (kind === "끝") store.setStatus(who, id, "done");
  else if (kind === "하는 중") store.setStatus(who, id, "doing");
  else if (kind === "되살리기") store.revive(who, id);
  else if (kind === "정할 것") {
    const question = str(req.질문);
    if (!question) throw new Error("질문이 없음");
    store.askDecision(who, id, {
      question,
      options: Array.isArray(req.선택지) ? req.선택지.map(String) : [],
      recommended: str(req.추천) ?? null,
      basis: str(req.근거) ?? null,
    });
  } else if (kind === "어디까지")
    store.updateTask(who, id, { progressNote: str(req["한 줄"]) ?? null });
  else if (kind === "멈춤") {
    const reason = REASONS[str(req.이유) ?? "내 결정 기다림"];
    if (!reason) throw new Error(`이유는 ${Object.keys(REASONS).join(", ")} 중 하나`);
    store.block(who, id, reason);
  } else throw new Error(`모르는 요청: ${kind}`);
  return `${kind}: ${task.title}`;
}

// ── 오늘 한 장 (vault 에 씀. 클라우드 세션이 읽음) ──

export function todaySheet(store: Store, now: Date): string {
  const tasks = store.listTasks();
  const day = kstDate(now);
  const state = store.getDay(day);
  const pick = pickNow(tasks, { skipped: new Set(state.skipped), pinnedId: state.pinnedTaskId });
  const projects = new Map(store.listProjects().map((p) => [p.id, p.name]));
  const line = (t: Task) => {
    const bits = [projects.get(t.project_id) ?? "", t.due_at ? dLabel(dDay(t.due_at, now)) : ""]
      .filter(Boolean)
      .join(", ");
    const note = t.progress_note ? `\n  - 어디까지 했나: ${t.progress_note}` : "";
    const d = t.blocked_reason === "my_decision" ? store.getDecision(t.id) : undefined;
    const ask =
      d && !d.answered_at
        ? `\n  - 정할 것: ${d.question}${(JSON.parse(d.options) as string[]).length ? ` / 선택지: ${(JSON.parse(d.options) as string[]).join(", ")}` : ""}${d.recommended ? ` (추천 ${d.recommended})` : ""}`
        : "";
    return `- ${t.title}${bits ? ` (${bits})` : ""} \`${t.id}\`${note}${ask}`;
  };
  const doing = tasks.filter((t) => t.status === "doing" && !t.blocked_reason);
  const ai = tasks.filter((t) => t.owner === "ai" && t.status !== "done");
  const waiting = waitingOnMe(tasks);
  const soon = dueSoon(tasks, now);
  const section = (title: string, list: Task[], empty: string) =>
    [`## ${title}`, ...(list.length ? list.map(line) : [empty]), ""].join("\n");
  return [
    "---",
    "generated_by: naeil",
    `generated_at: ${now.toISOString()}`,
    "---",
    `# 내일은내일 오늘 한 장 (${day})`,
    "",
    "이 파일은 작업판이 한 시간마다 새로 씁니다. 고쳐도 다음에 덮어씁니다.",
    "작업판에 무언가 바꾸려면 받는 폴더에 요청 파일을 두세요 (모양은 맨 아래).",
    "",
    section("지금 할 것", pick ? [pick] : [], "- 없음"),
    section("내가 정할 것", waiting, "- 없음"),
    section("마감 가까운 것", soon, "- 없음"),
    section("하는 중", doing, "- 없음"),
    `## AI 몫 열린 것 ${ai.length}개`,
    ...ai.slice(0, 20).map(line),
    ai.length > 20 ? `- 그 밖 ${ai.length - 20}개` : "",
    "",
    "## 요청 파일 모양 (받는 폴더에 .json 하나씩)",
    "```json",
    '{ "요청": "새 할 일", "제목": "...", "프로젝트": "...", "마감": "2026-11-20", "누가": "claude-cloud" }',
    '{ "요청": "하는 중", "할일": "<위 목록의 번호>", "누가": "claude-cloud" }',
    '{ "요청": "끝", "할일": "<번호>", "누가": "claude-cloud" }',
    '{ "요청": "멈춤", "할일": "<번호>", "이유": "내 결정 기다림", "누가": "claude-cloud" }',
    '{ "요청": "정할 것", "할일": "<번호>", "질문": "...", "선택지": ["가", "나"], "추천": "가", "누가": "claude-cloud" }',
    '{ "요청": "어디까지", "할일": "<번호>", "한 줄": "...", "누가": "claude-cloud" }',
    "```",
    "",
  ].join("\n");
}

const dLabel = (d: number) => (d === 0 ? "오늘 마감" : d > 0 ? `D-${d}` : `${-d}일 지남`);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "ledger";
// 파일 이름에 못 쓰는 글자만 바꾼다 (한글 이름은 그대로)
const fileName = (s: string) =>
  s
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim()
    .slice(0, 80) || "project";
