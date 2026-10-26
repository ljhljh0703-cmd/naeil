// 명세서(docs/api/openapi.yaml)를 읽어 서버 입력 검사에 그대로 쓴다.
// 입력 규칙의 원본은 명세서 하나. 코드에 같은 규칙을 다시 적지 않는다.
import { readFileSync } from "node:fs";
import { parse } from "yaml";

export const SPEC_PATH = new URL("../docs/api/openapi.yaml", import.meta.url).pathname;
export const SPEC_ID = "naeil-spec";

type Param = { name: string; in: string; required?: boolean; schema?: unknown; $ref?: string };
type Operation = {
  operationId: string;
  parameters?: Param[];
  requestBody?: { content: Record<string, { schema: unknown }> };
  responses: Record<string, unknown>;
};

export type Spec = {
  info: { version: string };
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, unknown>;
    parameters: Record<string, Param>;
    responses: Record<string, unknown>;
  };
};

let cached: Spec | null = null;

export function loadSpec(): Spec {
  cached ??= parse(readFileSync(SPEC_PATH, "utf8")) as Spec;
  return cached;
}

// Fastify 검사기에 넣을 묶음. 명세서 안의 "#/components/schemas/X" 참조가 그대로 풀린다.
export function specSchemaBundle() {
  return { $id: SPEC_ID, components: { schemas: loadSpec().components.schemas } };
}

// 명세서 조각 안의 "#/components/..." 참조를 묶음 이름으로 바꾼다.
function rewriteRefs<T>(node: T): T {
  if (Array.isArray(node)) return node.map(rewriteRefs) as T;
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] =
        k === "$ref" && typeof v === "string" && v.startsWith("#/")
          ? `${SPEC_ID}${v}`
          : rewriteRefs(v);
    }
    return out as T;
  }
  return node;
}

export function operation(specPath: string, method: string): Operation {
  const item = loadSpec().paths[specPath];
  const op = item?.[method.toLowerCase()] as Operation | undefined;
  if (!op) throw new Error(`명세서에 없는 동작: ${method} ${specPath}`);
  return op;
}

function resolveParam(p: Param): Param {
  if (!p.$ref) return p;
  const name = p.$ref.split("/").at(-1) ?? "";
  const found = loadSpec().components.parameters[name];
  if (!found) throw new Error(`명세서에 없는 매개변수: ${p.$ref}`);
  return found;
}

// 명세서의 매개변수·본문 규칙으로 Fastify 검사 규칙을 만든다.
export function routeSchema(specPath: string, method: string) {
  const item = loadSpec().paths[specPath] ?? {};
  const op = operation(specPath, method);
  const params = [...((item.parameters as Param[]) ?? []), ...(op.parameters ?? [])].map(
    resolveParam,
  );
  const group = (where: string, lower = false) => {
    const ps = params.filter((p) => p.in === where);
    if (!ps.length) return undefined;
    return {
      type: "object",
      properties: Object.fromEntries(
        ps.map((p) => [lower ? p.name.toLowerCase() : p.name, rewriteRefs(p.schema ?? {})]),
      ),
      required: ps.filter((p) => p.required).map((p) => (lower ? p.name.toLowerCase() : p.name)),
    };
  };
  const body = op.requestBody?.content["application/json"]?.schema;
  const schema = {
    params: group("path"),
    querystring: group("query"),
    headers: group("header", true),
    body: body ? rewriteRefs(body) : undefined,
  };
  return Object.fromEntries(Object.entries(schema).filter(([, v]) => v !== undefined));
}

// 명세서 주소 → Fastify 주소 ({taskId} → :taskId)
export const toFastifyPath = (specPath: string) => specPath.replace(/\{(\w+)\}/g, ":$1");
