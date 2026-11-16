// 서버가 주는 오늘 (M1-7): 건너뛰기와 「오늘 고정」가 서버에 남아, 다른 기기(새 브라우저)에서도 같은 것이 보임
import { fixture as data } from "../fixture.mjs";

export const fixture = data;

export async function run({ page, ok, until, api, base }) {
  const heroTitle = async (p) => (await p.locator(".hero h2").textContent()).trim();
  const one = await page();
  await one.p.goto(base);
  await one.p.waitForSelector(".hero");
  const first = await heroTitle(one.p);
  await one.p.getByRole("button", { name: "건너뛰기" }).click();
  ok(
    await until(async () => (await heroTitle(one.p)) !== first),
    "건너뛰면 다음 할 일이 지금 할 것으로",
  );
  const second = await heroTitle(one.p);
  await one.p.getByRole("button", { name: "오늘 고정" }).click();
  ok(
    await until(async () =>
      (await one.p.locator(".hero .chip").allTextContents()).includes("오늘 고정"),
    ),
    "「오늘 고정」 표시",
  );

  // 다른 기기: 새 브라우저(저장소 따로), 폰 폭
  const two = await page({ width: 390, height: 844 });
  await two.p.goto(base);
  await two.p.waitForSelector(".hero");
  ok((await heroTitle(two.p)) === second, "다른 기기에서도 같은 지금 할 것");
  ok(
    (await two.p.locator(".hero .chip").allTextContents()).includes("오늘 고정"),
    "다른 기기에서도 고정 표시",
  );

  const today = (await api("GET", "/v1/today")).json;
  ok(today.now?.title === second && today.skipped.length === 1, "AI 도구가 읽는 오늘도 같음");

  // 다른 기기에서 고정한 일을 건너뛰면 고정도 풀리고, 처음 기기도 새로 불러오면 같은 것
  await two.p.getByRole("button", { name: "건너뛰기" }).click();
  ok(
    await until(async () => {
      const t = (await api("GET", "/v1/today")).json;
      return t.skipped.length === 2 && t.pinnedTaskId === null;
    }),
    "다른 기기의 건너뛰기가 서버에 남고 고정이 풀림",
  );
  await until(async () => (await heroTitle(two.p)) !== second);
  const third = await heroTitle(two.p);
  await one.p.reload();
  await one.p.waitForSelector(".hero");
  ok(
    await until(async () => (await heroTitle(one.p)) === third),
    "처음 기기도 새로 불러오면 같은 지금 할 것",
  );
  // 최근 7일 (M1-5): 맨 아래 접힌 줄을 펼치면 오늘 연 시각과 내가 바꾼 수
  await one.p.locator(".usage summary").click();
  ok(
    await until(async () => {
      const t = await one.p.locator(".usage li").first().textContent();
      return /엶/.test(t ?? "") && /내가 \d+/.test(t ?? "");
    }),
    "최근 7일을 펼치면 오늘 연 시각과 내가 바꾼 수",
  );
  ok((await one.p.locator(".usage li").count()) === 7, "최근 7일은 일곱 줄");
  await one.ctx.close();
  await two.ctx.close();
}
