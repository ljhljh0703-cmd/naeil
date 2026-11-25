// 화면 → 서버. 화면은 「author」 API 키로 부른다.

import { demoCall, isDemo } from "./demo-hook.js";
import { newKey } from "./ids.js";
import type { BlockedReason, Status, Task } from "./today.js";

export type Project = { id: string; name: string; deletedAt?: string | null };

export type Milestone = {
  id: string;
  projectId: string;
  name: string;
  dueAt: string | null;
  doneWhen?: string | null;
  etag: string;
  createdAt: string;
  updatedAt: string;
};

// 서버가 돌려주는 할 일 전체 (명세서 Task)
export type ApiTask = Task & {
  milestoneId: string | null;
  source: string;
  sourceRef: string | null;
  externalText: boolean;
  body: string | null;
  updatedAt: string;
  deletedAt: string | null;
  owner?: "author" | "ai";
  sourceUrl?: string | null;
  progressNote?: string | null;
};

export type Decision = {
  id: string;
  taskId: string;
  question: string;
  options: string[];
  recommended: string | null;
  basis: string | null;
  askedBy: string;
  askedAt: string;
  answer: string | null;
  note: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
};

export type Setting = {
  name: "handoff";
  label: string;
  enabled: boolean;
  reason: string | null;
  changedBy: string | null;
  changedKind: string | null;
  changedAt: string | null;
};

// 날짜별 사용 기록 (M1-5). 처음 연 시각은 사람 API 키의 그날 첫 요청
export type UsageDay = {
  day: string;
  firstOpenedAt: string | null;
  authorChanges: number;
  decisions: number;
  aiChanges: number;
  imports: number;
};

export type Notice = {
  kind: "switch-off";
  name: string;
  label: string;
  changedBy: string | null;
  reason: string | null;
  changedAt: string | null;
};

export type Change = {
  id: number;
  at: string;
  actor: string;
  actorKind?: "human" | "ai" | "ci" | null;
  session: string | null;
  entity: "project" | "milestone" | "task";
  entityId: string;
  action: string;
  details: Record<string, unknown> | null;
};

const KEY_STORE = "naeil.key";

export function getKey(): string | null {
  // 시연판은 API 키 없이 바로 열림
  if (isDemo) return "demo";
  try {
    return localStorage.getItem(KEY_STORE);
  } catch {
    return null;
  }
}

export function setKey(key: string | null) {
  try {
    if (key) localStorage.setItem(KEY_STORE, key);
    else localStorage.removeItem(KEY_STORE);
  } catch {
    // 저장이 막힌 창이면 이번 창에서만 쓴다
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// 서버에 닿지 못했을 때(꺼짐, 주소 틀림, 연결 끊김) 브라우저는 영어 「Failed to fetch」만 준다. 우리 말로 바꾼다
export const OFFLINE =
  "서버에 연결되지 않습니다. 맥에서 서버가 켜져 있는지 확인한 뒤 다시 시도해 주세요.";

async function call<T>(
  method: string,
  url: string,
  body?: unknown,
  extra: Record<string, string> = {},
) {
  let res: Response;
  try {
    if (demoCall) {
      const r = await demoCall(method, url, body, extra);
      res = new Response(r.status === 204 ? null : JSON.stringify(r.json), { status: r.status });
    } else
      res = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${getKey() ?? ""}`,
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...extra,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
  } catch (err) {
    if (demoCall) {
      console.error(err);
      throw new ApiError(500, "시연판 안에서 오류가 났습니다. 새로 고쳐 주세요.");
    }
    throw new ApiError(0, OFFLINE);
  }
  if (!res.ok) {
    if (res.status >= 500) {
      throw new ApiError(
        res.status,
        "서버 오류로 저장되지 않았습니다. 잠시 뒤 다시 시도해 주세요.",
      );
    }
    const p = (await res.json().catch(() => null)) as { title?: string; detail?: string } | null;
    throw new ApiError(res.status, p?.detail ?? p?.title ?? `오류 ${res.status}`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

// 만들기에는 재시도 열쇠를 붙인다. 화면이 열쇠를 넘기면(같은 입력의 다시 시도) 그 열쇠를 다시 쓴다.
// 응답만 못 받고 서버에는 저장된 경우에도 다시 시도가 두 번째 것을 만들지 않는다.
const once = (key?: string) => ({ "idempotency-key": key ?? newKey() });

type Page<T> = { items: T[]; nextCursor: string | null };

export type Today = {
  day: string;
  now: ApiTask | null;
  pinnedTaskId: string | null;
  skipped: string[];
  waitingOnMe: ApiTask[];
  dueSoon: ApiTask[];
  decisions?: Decision[];
  notices?: Notice[];
  laterCount?: number;
};

export const api = {
  projects: () => call<{ items: Project[] }>("GET", "/v1/projects").then((r) => r.items),
  createProject: (name: string, key?: string) =>
    call<Project>("POST", "/v1/projects", { name }, once(key)),
  // 휴지통에 든 프로젝트 (안의 마일스톤과 할 일도 같이 들어가 있음)
  trashedProjects: () =>
    call<{ items: Project[] }>("GET", "/v1/projects?includeTrashed=true").then((r) =>
      r.items.filter((p) => p.deletedAt),
    ),
  renameProject: (id: string, name: string) =>
    call<Project>("PATCH", `/v1/projects/${id}`, { name }),
  trashProject: (id: string) => call<null>("DELETE", `/v1/projects/${id}`),
  reviveProject: (id: string) => call<Project>("POST", `/v1/projects/${id}/revive`),
  async allTasks(): Promise<ApiTask[]> {
    const out: ApiTask[] = [];
    let cursor: string | null = null;
    do {
      const q: string = cursor ? `&cursor=${cursor}` : "";
      const page: Page<ApiTask> = await call("GET", `/v1/tasks?limit=200${q}`);
      out.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return out;
  },
  createTask: (input: { projectId: string; title: string; dueAt?: string; milestoneId?: string }) =>
    call<ApiTask>("POST", "/v1/tasks", input, once()),
  // 같은 입력을 다시 보낼 때 같은 열쇠를 쓰는 판
  createTaskOnce: (
    input: { projectId: string; title: string; dueAt?: string; milestoneId?: string },
    key: string,
  ) => call<ApiTask>("POST", "/v1/tasks", input, once(key)),
  setStatus: (id: string, status: Status) => call<ApiTask>("PATCH", `/v1/tasks/${id}`, { status }),
  rename: (id: string, title: string) => call<ApiTask>("PATCH", `/v1/tasks/${id}`, { title }),
  block: (id: string, reason: BlockedReason) =>
    call<ApiTask>("PUT", `/v1/tasks/${id}/block`, { reason }),
  unblock: (id: string) => call<ApiTask>("DELETE", `/v1/tasks/${id}/block`),
  trash: (id: string) => call<null>("DELETE", `/v1/tasks/${id}`),
  revive: (id: string) => call<ApiTask>("POST", `/v1/tasks/${id}/revive`),
  setMilestone: (id: string, milestoneId: string | null) =>
    call<ApiTask>("PATCH", `/v1/tasks/${id}`, { milestoneId }),
  // 마일스톤은 프로젝트마다 한 번씩 읽는다 (혼자 쓰는 판이라 프로젝트 수가 적다)
  async allMilestones(projects: Project[]): Promise<Milestone[]> {
    const lists = await Promise.all(
      projects.map((p) =>
        call<{ items: Milestone[] }>("GET", `/v1/projects/${p.id}/milestones`).then((r) => r.items),
      ),
    );
    return lists.flat();
  },
  createMilestone: (projectId: string, input: { name: string; dueAt?: string | null }) =>
    call<Milestone>("POST", `/v1/projects/${projectId}/milestones`, input, once()),
  // 목록에서 받은 판 표시(etag)를 같이 보낸다. 다른 곳에서 먼저 바뀌었으면 412
  updateMilestone: (
    m: Milestone,
    patch: { name?: string; dueAt?: string | null; doneWhen?: string | null },
  ) => call<Milestone>("PATCH", `/v1/milestones/${m.id}`, patch, { "if-match": m.etag }),
  trashMilestone: (id: string) => call<null>("DELETE", `/v1/milestones/${id}`),
  // 결정함 (M1-4): 열린 질문과 최근 답
  decisions: () =>
    call<{ items: Decision[] }>("GET", "/v1/decisions?limit=200").then((r) => r.items),
  answer: (taskId: string, answer: string) =>
    call<Decision>("POST", `/v1/tasks/${taskId}/decision/answer`, { answer }),
  setProgress: (id: string, progressNote: string | null) =>
    call<ApiTask>("PATCH", `/v1/tasks/${id}`, { progressNote }),
  handoff: (scope: { taskId?: string; milestoneId?: string; projectId?: string }) => {
    const [k, v] = Object.entries(scope)[0] ?? [];
    return call<{ title: string; text: string }>("GET", `/v1/handoff?${k}=${v}`);
  },
  settings: () => call<{ items: Setting[] }>("GET", "/v1/settings").then((r) => r.items),
  setSetting: (name: string, enabled: boolean) =>
    call<Setting>("PUT", `/v1/settings/${name}`, { enabled }),
  // 서버가 계산한 오늘 (M1-7). 고정과 건너뛰기도 서버에 날짜별로
  today: () => call<Today>("GET", "/v1/today"),
  setToday: (state: { pinnedTaskId: string | null; skipped: string[] }) =>
    call<Today>("PUT", "/v1/today", state),
  usage: () => call<{ items: UsageDay[] }>("GET", "/v1/usage").then((r) => r.items),
  // 상세의 「바뀐 기록」 칸도 여기서 거른다 (최근 200줄)
  changes: (limit = 200) =>
    call<Page<Change>>("GET", `/v1/changes?limit=${limit}`).then((r) => r.items),
};
