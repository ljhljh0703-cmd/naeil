// AI 도구 연결 (MCP, M2-4). 도구 목록과 입력 모양은 명세서(docs/api/openapi.yaml)에서 뽑는다. 코드에 같은 규칙을 다시 적지 않는다.
// 도구 하나 = 명세서 동작 하나. 부르면 작업판 서버에 HTTP 로 보낸다. 권한, 잡기, 사람 확인은 서버가 그대로 막는다.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadSpec, operation } from "./spec.js";

// 첫 묶음: AI 세션이 하루 일에 쓰는 것. 작가 전용 동작(x-naeil-who 에 ai 가 없음)은 넣지 않는다
export const FIRST_BUNDLE = [
  "getToday",
  "listProjects",
  "listMilestones",
  "listTasks",
  "getTask",
  "createTask",
  "updateTask",
  "holdTask",
  "releaseTask",
  "blockTask",
  "unblockTask",
  "askDecision",
  "getDecision",
  "getHandoff",
] as const;

type JsonSchema = Record<string, unknown>;
type Param = {
  name: string;
  in: string;
  required?: boolean;
  schema?: JsonSchema;
  description?: string;
  $ref?: string;
};
type Op = {
  operationId: string;
  summary?: string;
  description?: string;
  parameters?: Param[];
  requestBody?: { required?: boolean; content: Record<string, { schema: JsonSchema }> };
  "x-naeil-who"?: string[];
};

export type Tool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  method: string;
  path: string;
  pathParams: string[];
  queryParams: string[];
  hasBody: boolean;
};

// 도구 쪽(클라이언트)이 참조를 못 풀 수 있어서 "#/components/..." 를 풀어 넣는다
function inline(node: unknown, depth = 0): unknown {
  if (depth > 20) return {};
  if (Array.isArray(node)) return node.map((n) => inline(n, depth + 1));
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.$ref === "string" && o.$ref.startsWith("#/components/")) {
      const [, , group, name] = o.$ref.split("/");
      const comps = loadSpec().components as unknown as Record<string, Record<string, unknown>>;
      const { $ref: _, ...rest } = o;
      return { ...(inline(comps[group ?? ""]?.[name ?? ""], depth + 1) as object), ...rest };
    }
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, inline(v, depth + 1)]));
  }
  return node;
}

function findOp(id: string): { path: string; method: string; op: Op } {
  for (const [path, item] of Object.entries(loadSpec().paths)) {
    for (const [method, op] of Object.entries(item)) {
      if ((op as Op)?.operationId === id)
        return { path, method, op: operation(path, method) as Op };
    }
  }
  throw new Error(`명세서에 없는 동작: ${id}`);
}

export function buildTools(ids: readonly string[] = FIRST_BUNDLE): Tool[] {
  return ids.map((id) => {
    const { path, method, op } = findOp(id);
    if (!op["x-naeil-who"]?.includes("ai"))
      throw new Error(`AI 가 부를 수 없는 동작을 도구로 내보내려 함: ${id}`);
    const item = loadSpec().paths[path] as { parameters?: Param[] };
    const params = [...(item.parameters ?? []), ...(op.parameters ?? [])].map(
      (p) => inline(p) as Param,
    );
    const props: Record<string, unknown> = {};
    const required: string[] = [];
    const pathParams: string[] = [];
    const queryParams: string[] = [];
    for (const p of params) {
      if (p.in === "path" || p.in === "query") {
        props[p.name] = {
          ...(p.schema ?? {}),
          ...(p.description ? { description: p.description } : {}),
        };
        if (p.required) required.push(p.name);
        (p.in === "path" ? pathParams : queryParams).push(p.name);
      }
      if (p.in === "header" && p.name === "X-Naeil-Hold") {
        props.hold = {
          type: "string",
          description: "잡기 번호. holdTask 가 준 번호를 넣는다. 잡은 할 일을 고칠 때 필요",
        };
      }
    }
    const body = op.requestBody?.content["application/json"]?.schema;
    if (body) {
      props.body = inline(body);
      if (op.requestBody?.required) required.push("body");
    }
    return {
      name: id,
      description: [op.summary, op.description].filter(Boolean).join("\n"),
      inputSchema: { type: "object", properties: props, required, additionalProperties: false },
      method: method.toUpperCase(),
      path,
      pathParams,
      queryParams,
      hasBody: Boolean(body),
    };
  });
}

export type Fetcher = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ status: number; text(): Promise<string> }>;

export type Conn = { url: string; apiKey: string; session?: string | null; fetch?: Fetcher };

// 작업판 서버 연결의 경계 (작업 지침 「외부 실행기 연결은 한 경계에서」): 요청 하나는 15초에 끊고,
// 연결이 안 되면 도구 오류로 돌려준다. 쓰기 요청은 서버에서 처리됐는지 모르므로 다시 보내지 않는다(다시 보낼지는 부르는 쪽이 읽어 보고 정함)
export const REQUEST_TIMEOUT_MS = 15_000;

// 도구 한 번 부르기 → 작업판 서버 요청 한 번. 서버 오류는 그대로 돌려준다(오류 모양 problem+json)
export async function callTool(conn: Conn, tool: Tool, args: Record<string, unknown> = {}) {
  let path = tool.path;
  for (const p of tool.pathParams) {
    const v = args[p];
    if (typeof v !== "string" || !v) throw new Error(`${p} 가 필요함`);
    path = path.replace(`{${p}}`, encodeURIComponent(v));
  }
  const q = new URLSearchParams();
  for (const p of tool.queryParams) {
    const v = args[p];
    if (v !== undefined && v !== null) q.set(p, String(v));
  }
  const headers: Record<string, string> = { authorization: `Bearer ${conn.apiKey}` };
  if (conn.session) headers["x-naeil-session"] = conn.session;
  if (typeof args.hold === "string" && args.hold) headers["x-naeil-hold"] = args.hold;
  let body: string | undefined;
  if (tool.hasBody && args.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(args.body);
  }
  const f: Fetcher = conn.fetch ?? (globalThis.fetch as unknown as Fetcher);
  let res: Awaited<ReturnType<Fetcher>>;
  let text: string;
  try {
    res = await f(`${conn.url.replace(/\/$/, "")}${path}${q.size ? `?${q}` : ""}`, {
      method: tool.method,
      headers,
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    text = await res.text();
  } catch (err) {
    const why =
      (err as Error).name === "TimeoutError" ? "15초 안에 답이 없음" : (err as Error).message;
    return {
      content: [
        {
          type: "text" as const,
          text: `작업판 서버에 닿지 않음 (${conn.url}): ${why}. 쓰기 요청이었다면 처리됐는지 getTask 로 먼저 확인하세요`,
        },
      ],
      isError: true,
    };
  }
  return {
    content: [{ type: "text" as const, text: text || `(${res.status}, 본문 없음)` }],
    isError: res.status >= 400,
  };
}

export function buildMcpServer(conn: Conn, version: string): Server {
  const tools = buildTools();
  const server = new Server({ name: "naeil", version }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `모르는 도구: ${req.params.name}` }],
        isError: true,
      };
    }
    try {
      return await callTool(conn, tool, (req.params.arguments ?? {}) as Record<string, unknown>);
    } catch (err) {
      return { content: [{ type: "text", text: (err as Error).message }], isError: true };
    }
  });
  return server;
}
