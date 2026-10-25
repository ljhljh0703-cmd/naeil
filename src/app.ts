import Fastify, { type FastifyInstance } from "fastify";

export const TAGLINE = "내 일은 naeil에서";

export function buildApp(options: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.get("/", async () => ({ name: "naeil", tagline: TAGLINE }));

  // 상태 확인 주소. 단계 2에서 자동 재시작·알림이 이걸 본다.
  app.get("/health", async () => ({ ok: true }));

  return app;
}
