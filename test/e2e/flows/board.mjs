// 마일스톤 화면: 진행 막대, 「다음」 강조, 상세 열기, 목표 날짜, 마일스톤 옮기기, 끝냄, 넣기, 프로젝트 바꾸기, 새로고침 유지, 폰 폭
import { fixture as data, seoulDate } from "../fixture.mjs";

export const fixture = data;

export async function run({ page, ok, until, base, out }) {
  const { p } = await page();
  await p.goto(base);
  await p.waitForSelector(".hero");
  await p.getByRole("button", { name: "마일스톤", exact: true }).click();
  await p.waitForSelector(".board-head");
  ok(
    (await p.locator("#board-title").textContent()) === "내일은내일",
    "마일스톤 화면이 열리고 첫 프로젝트가 보임",
  );
  ok((await p.locator(".ms").count()) === 4, "마일스톤 3개 + 마일스톤 없음 칸");
  const first = p.locator(".ms").first();
  ok(
    (await first.getAttribute("class")).includes("next"),
    "다 안 끝난 첫 마일스톤에 「다음」 강조",
  );
  ok(
    (await first.locator(".bar-text").textContent()).startsWith("1/2 끝"),
    "마일스톤 진행 수 표시",
  );
  ok((await p.locator(".ms.next").count()) === 1, "「다음」은 하나만");
  await p.screenshot({ path: `${out}/board-1440.png`, fullPage: true });

  // 마일스톤 열기
  await first.locator(".ms-link").click();
  await p.waitForSelector(".detail #detail-title");
  ok(
    (await p.locator(".detail .kind").textContent()) === "마일스톤",
    "마일스톤 이름을 누르면 상세가 열림",
  );
  ok((await p.locator(".detail .d-list .item-card").count()) === 2, "상세에 속한 할 일 2개");
  ok(p.url().includes("open=milestone%3A"), "주소에 열린 마일스톤이 담김");
  await p.keyboard.press("j");
  ok(
    (await p.locator("#detail-title").textContent()) === "오늘 화면 하루 써 보기",
    "J 로 다음 마일스톤",
  );

  // 목표 날짜 바꾸기 → 보드의 D-숫자 (서울 날짜 기준)
  await p.locator(".detail .control input[type=date]").fill(seoulDate(20));
  ok(
    await until(async () =>
      (await p.locator(".ms").nth(1).locator(".ms-head").textContent()).includes("D-20"),
    ),
    "상세에서 목표 날짜를 바꾸면 보드에 바로 반영 (D-20)",
  );

  // 할 일 상세에서 마일스톤 옮기기
  await p.keyboard.press("Escape");
  const loose = p.locator(".ms").last();
  const looseTitle = await loose.locator(".card-link").first().textContent();
  await loose.locator(".card-link").first().click();
  await p.waitForSelector(".detail .control select");
  await p.locator(".detail .control select").selectOption({ label: "맥 앱 포장" });
  const mac = p.locator(".ms", { has: p.locator(".ms-link", { hasText: "맥 앱 포장" }) });
  ok(
    await until(
      async () => (await mac.locator(".card-link", { hasText: looseTitle }).count()) === 1,
    ),
    "할 일 상세에서 마일스톤을 고르면 그 칸으로 옮겨감",
  );
  ok(
    await until(async () => (await p.locator(".ms").count()) === 3),
    "남은 할 일이 없으면 「마일스톤 없음」 칸이 사라짐",
  );
  await p.keyboard.press("Escape");

  // 보드에서 끝냄 → 진행 갱신, 끝난 건 접힘
  const before = await mac.locator(".bar-text").textContent();
  await mac.locator(".card-action").first().click();
  ok(
    await until(async () => (await mac.locator(".bar-text").textContent()) !== before),
    `보드에서 끝냄 → 진행 바뀜 (${before} → ${await mac.locator(".bar-text").textContent()})`,
  );
  ok(
    (await mac.locator(".bar-text").textContent()).startsWith("1/"),
    "끝낸 1개가 진행 수에 들어감",
  );
  ok(
    (await mac.getByRole("button", { name: /끝난 1개 보기/ }).count()) === 1,
    "끝난 할 일은 접히고 「끝난 N개 보기」",
  );

  // 마일스톤 넣기
  await p.getByLabel("마일스톤 이름").fill("포폴 글 공개");
  await p.getByRole("button", { name: "넣기" }).first().click();
  ok(
    await until(
      async () => (await p.locator(".ms-link", { hasText: "포폴 글 공개" }).count()) === 1,
    ),
    "마일스톤 넣기",
  );

  // 프로젝트 바꾸기, 새로고침해도 유지
  await p.getByRole("button", { name: "젤리 패닉" }).click();
  ok((await p.locator("#board-title").textContent()) === "젤리 패닉", "프로젝트 바꾸기");
  await p.reload();
  await p.waitForSelector(".board-head");
  ok(
    (await p.locator("#board-title").textContent()) === "젤리 패닉",
    "새로고침해도 화면과 프로젝트 유지",
  );
  await p.getByRole("button", { name: "내일은내일" }).click();

  // 오늘 화면으로 돌아가기
  await p.getByRole("button", { name: "오늘", exact: true }).click();
  ok(
    (await p.locator(".hero").count()) === 1 &&
      (await p.getByRole("button", { name: "집중 보기" }).count()) === 1,
    "오늘 화면과 보기 방식 막대",
  );

  // 폰 폭, 어두운 화면
  const m = await page({ width: 390, height: 844, storage: { "naeil.page": '"milestones"' } });
  await m.p.goto(base);
  await m.p.waitForSelector(".board-head");
  ok(
    await m.p.evaluate(() => document.documentElement.scrollWidth <= 390),
    "폰 폭에서 가로 스크롤 없음",
  );
  await m.p.screenshot({ path: `${out}/board-390.png`, fullPage: true });
  const d = await page({
    width: 390,
    height: 844,
    scheme: "dark",
    storage: { "naeil.page": '"milestones"' },
  });
  await d.p.goto(base);
  await d.p.waitForSelector(".board-head");
  ok(
    await d.p.evaluate(() => document.documentElement.scrollWidth <= 390),
    "어두운 화면, 폰 폭에서도 가로 스크롤 없음",
  );
  await d.p.screenshot({ path: `${out}/board-390-dark.png`, fullPage: true });
}
