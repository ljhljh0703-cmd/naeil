// 가져오기와 vault 다리 (M1-3): 원장에서 가져온 일이 작업판에 보이고, AI 담당은 지금 할 것에서 빠지고,
// 마지막에 한 일은 한 줄로 접히고, 요청함의 요청이 반영되고, 오늘 요약이 써짐
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function run({ page, ok, until, api, base, cli, work }) {
  const vault = join(work, "vault");
  const inbox = join(vault, "inbox");
  mkdirSync(inbox, { recursive: true });
  const ledger = join(vault, "naeil-source.json");
  writeFileSync(
    ledger,
    JSON.stringify({
      출처: "vault-maintenance",
      할일: [
        { 번호: "vm-1", 제목: "부산물 조사", 몫: "AI", 종류: "할 일", 상태: "열림" },
        {
          번호: "vm-2",
          제목: "멈춘 4건 계속할지",
          몫: "작가",
          종류: "결정",
          상태: "결정 대기",
          선택지: ["계속", "그만"],
          추천: "계속",
        },
        { 번호: "vm-3", 제목: "지도 새로 고침", 몫: "작가", 종류: "할 일", 상태: "열림" },
        { 번호: "vm-4", 제목: "끝난 일", 몫: "AI", 종류: "할 일", 상태: "끝" },
      ],
    }),
  );
  const sheet = join(vault, "naeil-today.md");
  writeFileSync(
    join(work, "import.json"),
    JSON.stringify({
      sources: [{ type: "vault-json", path: ledger, project: "vault 유지보수" }],
      todaySheet: sheet,
      inbox,
    }),
  );
  const first = cli("import.js", [], { NAEIL_IMPORT_CONFIG: join(work, "import.json") });
  ok(
    first.status === 0 && first.stdout.includes("새로 3"),
    `가져오기 명령 (${first.stdout.trim()})`,
  );

  const { p } = await page();
  await p.goto(base);
  await p.waitForSelector(".hero");
  ok(
    (await p.locator(".hero h2").textContent()).includes("지도 새로 고침"),
    "지금 할 것은 작가 담당에서",
  );
  ok(
    (await p.locator("main").textContent()).includes("멈춘 4건 계속할지"),
    "작가가 정할 일은 내가 정할 것에",
  );
  ok(
    await until(async () =>
      (await p.locator("main").textContent()).includes("가져오기 3건: 가져옴 3, 정할 것 1"),
    ),
    "마지막에 한 일은 가져오기 한 줄로 접힘",
  );
  ok(
    existsSync(sheet) && readFileSync(sheet, "utf8").includes("## 지금 할 것\n- 지도 새로 고침"),
    "오늘 요약이 vault 에 써짐",
  );

  // 클라우드 세션이 요청함에 요청을 둠 → 다음 가져오기에 반영
  const tasks = (await api("GET", "/v1/tasks?limit=200")).json.items;
  const map = tasks.find((t) => t.title === "지도 새로 고침");
  writeFileSync(
    join(inbox, "done.json"),
    JSON.stringify({ 요청: "끝", 할일: map.id, 누가: "claude-cloud" }),
  );
  writeFileSync(
    join(inbox, "new.json"),
    JSON.stringify({
      요청: "새 할 일",
      제목: "세션이 넣은 일",
      프로젝트: "vault 유지보수",
      누가: "claude-cloud",
    }),
  );
  const second = cli("import.js", [], { NAEIL_IMPORT_CONFIG: join(work, "import.json") });
  ok(second.status === 0, `두 번째 가져오기 (${second.stdout.trim().split("\n").join(" / ")})`);
  await p.reload();
  await p.waitForSelector(".hero");
  ok(
    await until(async () => (await p.locator(".hero h2").textContent()).includes("세션이 넣은 일")),
    "요청함의 요청: 끝낸 일은 빠지고 세션이 넣은 일이 지금 할 것으로",
  );
  const changes = (await api("GET", "/v1/changes?actorKind=ai")).json.items;
  ok(
    changes.every((c) => c.actor === "claude-cloud"),
    "세션 요청은 AI 종류로 기록",
  );

  // AI 담당 표시 (전체 보기)
  await p.getByRole("button", { name: /할 일 전체/ }).click();
  ok(
    await until(async () =>
      (await p.locator(".item-card", { hasText: "부산물 조사" }).textContent()).includes("AI 담당"),
    ),
    "AI 담당 할 일에 표시",
  );
}
