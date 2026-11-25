#!/usr/bin/env node
// AI 도구 연결(MCP) 실행 파일 (M2-4). 표준 입출력으로 붙는다. 작업판 서버 주소와 AI 용 API 키는 환경 변수로 받는다.
// 예: claude mcp add naeil -e NAEIL_URL=http://127.0.0.1:3700 -e NAEIL_API_KEY=<AI 키> -- node dist/mcp-server.js
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildMcpServer } from "./mcp.js";
import { VERSION } from "./paths.js";

const apiKey = process.env.NAEIL_API_KEY;
if (!apiKey) {
  process.stderr.write(
    "NAEIL_API_KEY 가 없음. AI 용 API 키를 환경 변수로 넣으세요 (docs/ops/mcp.md)\n",
  );
  process.exit(2);
}
const server = buildMcpServer(
  {
    url: process.env.NAEIL_URL ?? "http://127.0.0.1:3700",
    apiKey,
    session: process.env.NAEIL_SESSION ?? null,
  },
  VERSION,
);
await server.connect(new StdioServerTransport());
