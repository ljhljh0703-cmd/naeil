// 화면 → 서버. 화면은 「author」 출입증으로 부른다.
import type { BlockedReason, Status, Task } from "./today.js";

export type Project = { id: string; name: string };

// 서버가 돌려주는 할 일 전체 (명세서 Task)
export type ApiTask = Task & {
  milestoneId: string | null;
  source: string;
  sourceRef: string | null;
  externalText: boolean;
  body: string | null;
  updatedAt: string;
  deletedAt: string | null;
};

export type Change = {
  id: number;
  at: string;
  actor: string;
  session: string | null;
  entity: "project" | "milestone" | "task";
  entityId: string;
  action: string;
  details: Record<string, unknown> | null;
};

const KEY_STORE = "naeil.key";

export function getKey(): string | null {
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

async function call<T>(
  method: string,
  url: string,
  body?: unknown,
  extra: Record<string, string> = {},
) {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${getKey() ?? ""}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...extra,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const p = (await res.json().catch(() => null)) as { title?: string; detail?: string } | null;
    throw new ApiError(res.status, p?.detail ?? p?.title ?? `오류 ${res.status}`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

// 만들기는 누를 때마다 새 열쇠를 붙인다. 두 번 눌려도 하나만 생긴다.
const once = () => ({ "idempotency-key": crypto.randomUUID() });

type Page<T> = { items: T[]; nextCursor: string | null };

export const api = {
  projects: () => call<{ items: Project[] }>("GET", "/v1/projects").then((r) => r.items),
  createProject: (name: string) => call<Project>("POST", "/v1/projects", { name }, once()),
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
  createTask: (input: { projectId: string; title: string; dueAt?: string }) =>
    call<ApiTask>("POST", "/v1/tasks", input, once()),
  setStatus: (id: string, status: Status) => call<ApiTask>("PATCH", `/v1/tasks/${id}`, { status }),
  block: (id: string, reason: BlockedReason) =>
    call<ApiTask>("PUT", `/v1/tasks/${id}/block`, { reason }),
  unblock: (id: string) => call<ApiTask>("DELETE", `/v1/tasks/${id}/block`),
  trash: (id: string) => call<null>("DELETE", `/v1/tasks/${id}`),
  revive: (id: string) => call<ApiTask>("POST", `/v1/tasks/${id}/revive`),
  // 상세의 「바뀐 기록」 칸도 여기서 거른다 (최근 200줄)
  changes: (limit = 200) =>
    call<Page<Change>>("GET", `/v1/changes?limit=${limit}`).then((r) => r.items),
};
