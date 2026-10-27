// 명세서와 실제 응답이 어긋나면 시험에서 떨어지게 하는 검사기 (1-3).
// 응답 번호가 명세서에 있나 · 내용 종류(json / problem+json)가 맞나 · 본문 모양이 맞나 · 약속한 머리말이 있나
import AjvModule from "ajv/dist/2020.js";
import formatsModule from "ajv-formats";
import type { LightMyRequestResponse } from "fastify";
import { expect } from "vitest";
import { loadSpec } from "../src/spec.js";

const spec = loadSpec() as unknown as {
  paths: Record<string, Record<string, { responses: Record<string, Resp> }>>;
  components: { responses: Record<string, Resp> };
};
type Resp = { $ref?: string; content?: Record<string, unknown>; headers?: Record<string, unknown> };

// 이 두 꾸러미는 옛 방식(CommonJS)이라 .default 로 꺼낸다
const Ajv2020 = AjvModule.default;
const addFormats = formatsModule.default;
const ajv = new Ajv2020({ strict: false, allErrors: true, validateSchema: false });
addFormats(ajv);
ajv.addSchema({ ...(spec as object), $id: "spec" });

const esc = (s: string) => encodeURIComponent(s.replace(/~/g, "~0").replace(/\//g, "~1"));
const cache = new Map<string, ReturnType<typeof ajv.compile>>();

export function expectSpec(res: LightMyRequestResponse, method: string, specPath: string) {
  const where = `${method} ${specPath} → ${res.statusCode}`;
  const op = spec.paths[specPath]?.[method.toLowerCase()];
  expect(op, `명세서에 없는 동작: ${method} ${specPath}`).toBeTruthy();
  let r = op?.responses[String(res.statusCode)];
  expect(r, `명세서에 없는 응답 번호: ${where}`).toBeTruthy();
  let base = `#/paths/${esc(specPath)}/${method.toLowerCase()}/responses/${res.statusCode}`;
  if (r?.$ref) {
    base = r.$ref;
    r = spec.components.responses[r.$ref.split("/").at(-1) ?? ""];
  }
  for (const h of Object.keys(r?.headers ?? {})) {
    expect(res.headers[h.toLowerCase()], `${where}: 약속한 머리말 ${h} 이 없음`).toBeTruthy();
  }
  if (!r?.content) {
    expect(res.body, `${where}: 본문이 없어야 함`).toBe("");
    return;
  }
  const ct =
    String(res.headers["content-type"] ?? "")
      .split(";")[0]
      ?.trim() ?? "";
  expect(Object.keys(r.content), `${where}: 내용 종류`).toContain(ct);
  const pointer = `spec${base}/content/${esc(ct)}/schema`;
  let validate = cache.get(pointer);
  if (!validate) {
    validate = ajv.compile({ $ref: pointer });
    cache.set(pointer, validate);
  }
  const body = res.json();
  const ok = validate(body);
  expect(ok, `${where}: 본문 모양이 명세서와 다름 ${JSON.stringify(validate.errors)}`).toBe(true);
}

// 명세서의 동작 전체 (방법, 주소)
export function specOperations(): { method: string; path: string }[] {
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.keys(item)
      .filter((m) => ["get", "post", "put", "patch", "delete"].includes(m))
      .map((m) => ({ method: m.toUpperCase(), path })),
  );
}
