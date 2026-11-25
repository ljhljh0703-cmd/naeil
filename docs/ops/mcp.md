<!-- AI 도구 연결(MCP) 붙이는 법 (M2-4). Claude Code 나 Codex 세션이 작업판을 말로 다루게 한다 -->
# AI 도구 연결 (MCP)

Claude Code 나 Codex 창에서 「오늘 할 일 보여 줘」 「이거 잡고 시작해」 「끝났어」를 말하면 작업판이 바로 바뀐다. 도구 목록과 입력 모양은 명세서(`docs/api/openapi.yaml`)에서 뽑는다.

## 들어 있는 도구 (첫 묶음)
오늘 보기(`getToday`), 프로젝트와 마일스톤과 할 일 보기, 할 일 만들기와 고치기, 잡기와 놓기(`holdTask`, `releaseTask`), 멈추기와 풀기, 작가에게 묻기와 답 읽기(`askDecision`, `getDecision`), 인수인계 문서(`getHandoff`).

AI 가 못 하는 동작(프로젝트 휴지통과 복원, 결정 답하기)은 도구에 없다. 서버도 막는다(권한표). AI 가 외부 입력 할 일을 끝내면 작가 확인 질문이 생긴다(사람 확인 대기).

## 붙이는 법 (기기마다 한 번)
1. 작업판 서버가 도는 컴퓨터(윈도우)에서 AI 용 API 키를 만든다. 원문은 한 번만 나온다
   `npm run key -- new claude` (Codex 는 `new codex`)
2. 세션을 여는 컴퓨터에서 이 저장소를 받고 빌드한다
   `npm ci && npm run build`
3. Claude Code 에 붙인다. 주소는 폰 주소와 같은 Tailscale 주소(서버와 같은 컴퓨터면 `http://127.0.0.1:3700`)
   `claude mcp add naeil -e NAEIL_URL=<작업판 주소> -e NAEIL_API_KEY=<1번 키> -- node <저장소>/dist/mcp-server.js`
   Codex 는 `~/.codex/config.toml` 의 `[mcp_servers.naeil]` 에 같은 명령과 환경 변수를 적는다
4. 새 세션에서 「작업판 오늘 할 일 보여 줘」로 확인

## 연결 경계
- 요청 하나는 15초에 끊는다. 서버에 닿지 않으면 도구 오류로 돌려준다
- 쓰기 요청은 다시 보내지 않는다. 처리됐는지 모르면 `getTask` 로 먼저 확인한다
- 키는 환경 변수로만 넣는다. 저장소, vault, 대화에 적지 않는다
