// 화면 → 서버. 화면은 「author」 출입증으로 부른다.
import type { BlockedReason, Status, Task } from "./today.js";

export type Project = { id: string; name: string };
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

export const api = {
  projects: () => call<{ items: Project[] }>("GET", "/v1/projects").then((r) => r.items),
  createProject: (name: string) => call<Project>("POST", "/v1/projects", { name }, once()),
  async allTasks(): Promise<(Task & { deletedAt: string | null })[]> {
    const out: (Task & { deletedAt: string | null })[] = [];
    let cursor: string | null = null;
    do {
      const q: string = cursor ? `&cursor=${cursor}` : "";
      const page: { items: (Task & { deletedAt: string | null })[]; nextCursor: string | null } =
        await call("GET", `/v1/tasks?limit=200${q}`);
      out.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return out;
  },
  createTask: (input: { projectId: string; title: string; dueAt?: string }) =>
    call<Task>("POST", "/v1/tasks", input, once()),
  setStatus: (id: string, status: Status) => call<Task>("PATCH", `/v1/tasks/${id}`, { status }),
  block: (id: string, reason: BlockedReason) =>
    call<Task>("PUT", `/v1/tasks/${id}/block`, { reason }),
  unblock: (id: string) => call<Task>("DELETE", `/v1/tasks/${id}/block`),
  trash: (id: string) => call<null>("DELETE", `/v1/tasks/${id}`),
  changes: (limit = 6) =>
    call<{ items: Change[] }>("GET", `/v1/changes?limit=${limit}`).then((r) => r.items),
};
