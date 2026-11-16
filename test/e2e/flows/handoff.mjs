// 이어하기 + 결정함 + 스위치 (M1-4): AI 가 물은 것을 작가가 화면에서 고르고, 한 장을 복사하고, AI 가 끈 스위치는 맨 위에
import { fixture as data } from "../fixture.mjs";

export const fixture = data;

export async function run({ page, ok, until, api, base, cli }) {
  const tasks = (await api("GET", "/v1/tasks?limit=200")).json.items;
  const t = tasks.find((x) => x.title === "이름 바꾸기");
  // AI 세션이 묻는다 (claude API 키 대신 같은 API, 묻는 쪽 이름은 API 키가 정함)
  const asked = await api("PUT", `/v1/tasks/${t.id}/decision`, {
    question: "이름 바꾸기를 목록에서도 할까",
    options: ["상세에서만", "목록에서도"],
    recommended: "상세에서만",
  });
  ok(asked.status === 200, "세션이 정할 것을 물음");

  const { ctx, p } = await page();
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  await p.goto(base);
  await p.waitForSelector(".hero");
  const pick = p.getByRole("button", { name: "「이름 바꾸기」 고르기" });
  ok(await until(async () => (await pick.count()) === 1), "내가 정할 것 카드에 「고르기」");
  if ((await pick.count()) !== 1)
    console.log("DBG", (await p.locator("main").textContent()).replace(/\s+/g, " ").slice(0, 900));
  await pick.click();
  await p.waitForSelector(".detail #detail-title");
  ok(
    (await p.locator(".detail").textContent()).includes("이름 바꾸기를 목록에서도 할까"),
    "상세에 질문",
  );
  await p.getByRole("button", { name: "상세에서만 (추천)" }).click();
  ok(
    await until(
      async () => (await api("GET", `/v1/tasks/${t.id}/decision`)).json.answer === "상세에서만",
    ),
    "추천 버튼 하나로 정하고, 세션이 답을 읽음",
  );
  ok(
    await until(async () => (await p.locator(".detail").textContent()).includes("고른 답")),
    "상세에 정한 것이 남음",
  );

  // 어디까지 했나 한 줄 → 인수인계 복사
  const note = p.locator(".detail").getByLabel("어디까지 했나");
  await note.fill("목록 쪽은 안 하기로, 상세만 남음");
  await note.locator("xpath=..").getByRole("button", { name: "저장" }).click();
  ok(
    await until(
      async () =>
        (await api("GET", `/v1/tasks/${t.id}`)).json.progressNote ===
        "목록 쪽은 안 하기로, 상세만 남음",
    ),
    "어디까지 했나 저장",
  );
  await p.locator(".detail").getByRole("button", { name: "인수인계 복사" }).click();
  ok(await until(async () => (await p.locator(".info").count()) === 1), "복사했다는 알림");
  const copied = await p.evaluate(() => navigator.clipboard.readText());
  ok(
    copied.startsWith("# 인수인계: 이름 바꾸기") &&
      copied.includes("어디까지 했나: 목록 쪽은 안 하기로"),
    "복사한 한 장에 목표, 어디까지",
  );
  await p.keyboard.press("Escape");

  // AI 가 스위치를 끄면 맨 위에 이유와 함께, 이어하기 버튼이 숨음, 다시 켜기
  const claudeKey = cli("key.js", ["new", "claude"]).stdout.match(/nk_[A-Za-z0-9_-]+/)?.[0];
  const off = await fetch(new URL("/v1/settings/handoff", base), {
    method: "PUT",
    headers: { authorization: `Bearer ${claudeKey}`, "content-type": "application/json" },
    body: JSON.stringify({ enabled: false, reason: "한 장 모양 고치는 중" }),
  });
  ok(off.status === 200, "AI 가 이유를 적고 기능을 끔");
  await p.reload();
  await p.waitForSelector(".hero");
  ok(
    (await p.locator(".notice").textContent()).includes(
      "claude 가 인수인계 문서 기능을 껐습니다: 한 장 모양 고치는 중",
    ),
    "AI 가 끈 기능이 오늘 화면 맨 위에 이유와 함께",
  );
  await p.locator(".item-card .card-link", { hasText: "이름 바꾸기" }).first().click();
  await p.waitForSelector(".detail #detail-title");
  ok(
    (await p.locator(".detail").getByRole("button", { name: "인수인계 복사" }).count()) === 0,
    "끄면 인수인계 복사 버튼이 숨음",
  );
  await p.keyboard.press("Escape");
  await p.locator(".notice").getByRole("button", { name: "다시 켜기" }).click();
  ok(
    await until(async () => (await p.locator(".notice").count()) === 0),
    "다시 켜면 알림이 사라짐",
  );
}
