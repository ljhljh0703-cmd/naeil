// 오늘 화면의 상세 패널: 카드 열기, 주소, 포커스, J 로 다음, Esc 와 뒤로 가기, 크게 보기, 카드 안 버튼, 집중 보기, 폰 전체 화면
import { fixture as data } from "../fixture.mjs";

export const fixture = data;

export async function run({ page, ok, until, base, out }) {
  const { ctx, p } = await page({ storage: { "naeil.mode": '"board"' } });
  await p.goto(base);
  await p.waitForSelector(".hero");

  // 마지막에 한 일 첫 카드 열기
  const first = p.locator("#last-title + ul .card-link").first();
  const firstText = await first.textContent();
  await first.click();
  await p.waitForSelector(".detail #detail-title");
  ok(
    (await p.locator("#detail-title").textContent()) === firstText,
    "카드를 누르면 같은 항목 상세가 열림",
  );
  ok(p.url().includes("open=change%3A"), "주소에 열린 항목이 담김");
  ok(
    await p.evaluate(() => document.activeElement?.id === "detail-title"),
    "열면 상세 제목으로 포커스",
  );
  await p.screenshot({ path: `${out}/panel-1440.png` });

  // J 로 다음
  await p.keyboard.press("j");
  ok((await p.locator("#detail-title").textContent()) !== firstText, "J 로 다음 항목");
  ok((await p.locator(".pos").textContent()).startsWith("2 /"), "몇 번째인지 표시 2 / N");

  // 열린 채 다른 목록 카드
  await p.locator("#due-title + ul .card-link").first().click();
  ok(
    await until(async () => (await p.locator(".detail .kind").textContent()) === "할 일"),
    "열린 채 다른 목록 카드를 누르면 내용만 바뀜",
  );

  // Esc 닫기 → 연 카드로 포커스
  await p.keyboard.press("Escape");
  ok(await until(async () => (await p.locator(".detail").count()) === 0), "Esc 로 닫힘");
  ok(
    await p.evaluate(() => document.activeElement?.closest("#due-title + ul") !== null),
    "닫으면 연 카드로 포커스가 돌아옴",
  );
  ok(!p.url().includes("open="), "닫으면 주소에서 빠짐");

  // 주소를 새 창에 열어도 같은 상세
  await first.click();
  await p.waitForSelector(".detail");
  const url = p.url();
  const p2 = await ctx.newPage();
  await p2.goto(url);
  await p2.waitForSelector(".detail #detail-title:not([aria-busy])");
  ok(
    (await p2.locator("#detail-title").textContent()) === firstText,
    "주소를 새 창에 열어도 같은 상세가 열림",
  );
  await p2.close();

  // 뒤로 가기로 닫힘
  await p.goBack();
  ok(
    await until(async () => (await p.locator(".detail").count()) === 0),
    "브라우저 뒤로 가기로 닫힘",
  );

  // 크게 보기
  await first.click();
  await p.locator('button[aria-label="크게 보기"]').click();
  await p.waitForSelector(".detail.full");
  ok(p.url().includes("full=1"), "크게 보기 = 페이지 하나로");
  await p.screenshot({ path: `${out}/panel-full.png` });
  await p.locator(".detail.full button.icon").last().click();

  // 카드 안 버튼은 카드 열기와 따로: 지금 할 것을 「내 결정 기다림」으로, 그 카드의 「정했음」
  await p.locator(".hero button", { hasText: "내가 정할 게 있음" }).click();
  await p.waitForSelector("#decide-title + ul .card-action");
  await p.locator("#decide-title + ul .card-action").first().click();
  ok(
    await until(async () => (await p.locator("#decide-title + ul .card-action").count()) === 0),
    "「정했음」을 누르면 내가 정할 것 칸에서 빠짐",
  );
  ok((await p.locator(".detail").count()) === 0, "카드 안 버튼을 눌러도 상세가 열리지 않음");

  // 집중 보기
  await p.locator(".seg button", { hasText: "집중 보기" }).click();
  ok((await p.locator(".hero.focus").count()) === 1, "집중 보기 = 지금 할 것 하나만 크게");
  ok((await p.locator(".grid").count()) === 0, "집중 보기에서는 나머지 칸이 빠짐");
  await p.screenshot({ path: `${out}/focus-1440.png` });
  await p.locator(".seg button", { hasText: "전체 보기" }).click();

  // 폰: 상세가 전체 화면, 뒤로 가기로 닫힘
  const m = await page({ width: 390, height: 844, storage: { "naeil.mode": '"board"' } });
  await m.p.goto(base);
  await m.p.waitForSelector(".hero");
  await m.p.locator("#last-title + ul .card-link").first().click();
  await m.p.waitForSelector(".detail");
  const box = await m.p.locator(".detail").boundingBox();
  ok(box?.width === 390, "폰에서는 상세가 전체 화면");
  await m.p.screenshot({ path: `${out}/panel-390.png` });
  await m.p.goBack();
  ok(
    await until(async () => (await m.p.locator(".detail").count()) === 0),
    "폰에서 뒤로 가기로 닫힘",
  );
}
