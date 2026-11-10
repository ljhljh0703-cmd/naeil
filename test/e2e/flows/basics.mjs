// S1 기본 흐름: 빈 작업판에서 프로젝트와 작업 만들기 → 이름, 상태 바꾸기 → 새로고침과 다시 열기 → 끊김 안내와 다시 시도
export async function run({ page, ok, api, until, base, out }) {
  // 1. 첫 불러오기 실패 → 안내 + 다시 시도
  {
    const { ctx, p } = await page();
    await p.route("**/v1/**", (r) => r.abort());
    await p.goto(base);
    await p.getByRole("alert").waitFor();
    ok(
      (await p.getByRole("alert").textContent()).includes("서버에 연결되지 않습니다"),
      "서버에 닿지 못하면 우리 말 안내",
    );
    ok(
      (await p.getByText("아직 불러오지 못했습니다").count()) === 1,
      "불러오기 전에는 빈 화면 대신 「아직 불러오지 못했습니다」",
    );
    await p.screenshot({ path: `${out}/basics-offline.png` });
    await p.unroute("**/v1/**");
    await p.getByRole("button", { name: "다시 시도" }).click();
    await p.getByText("할 일 넣기").waitFor();
    ok((await p.getByRole("alert").count()) === 0, "다시 시도 → 안내가 사라지고 화면이 뜸");
    await ctx.close();
  }

  const { ctx, p } = await page();
  await p.goto(base);
  await p.getByText("할 일 넣기").waitFor();

  // 2. 프로젝트와 작업 만들기 (응답만 잃어버린 다시 시도 포함)
  await p.getByLabel("할 일", { exact: true }).fill("첫 작업");
  await p.getByLabel("새 프로젝트 이름").fill("S1 시험 프로젝트");
  let lost = true;
  await p.route("**/v1/tasks", async (r) => {
    if (r.request().method() === "POST" && lost) {
      lost = false;
      await r.fetch(); // 서버에는 저장되고
      await r.abort(); // 응답만 잃어버림
      return;
    }
    await r.continue();
  });
  await p.getByRole("button", { name: "넣기" }).click();
  await p.getByRole("alert").waitFor();
  ok(true, "응답을 잃어버리면 안내가 뜸");
  await p.getByRole("button", { name: "넣기" }).click(); // 같은 입력으로 다시
  await p.waitForFunction(() => !document.querySelector("[role=alert]"));
  await p.unroute("**/v1/tasks");
  const projects = (await api("GET", "/v1/projects")).json.items;
  const tasks = (await api("GET", "/v1/tasks?limit=200")).json.items;
  ok(
    projects.length === 1 && projects[0].name === "S1 시험 프로젝트",
    `프로젝트 1개 (${projects.length})`,
  );
  ok(tasks.filter((t) => t.title === "첫 작업").length === 1, "다시 눌러도 작업은 1개 (중복 없음)");
  const taskId = tasks[0].id;

  // 3. 이름 바꾸기
  await p.getByRole("link", { name: "첫 작업" }).first().click();
  await p.locator(".detail #detail-title").waitFor();
  const name = p.locator(".detail .text-control input");
  ok((await name.inputValue()) === "첫 작업", "상세 이름 칸에 지금 이름");
  await name.fill("   ");
  ok(
    await p.locator(".detail .text-control button").isDisabled(),
    "빈칸만 있으면 저장 버튼이 꺼짐",
  );
  await name.fill("이름 바꾼 작업");
  await p.locator(".detail .text-control button").click();
  ok(
    await until(() =>
      p.evaluate(() => document.querySelector("#detail-title")?.textContent === "이름 바꾼 작업"),
    ),
    "저장하면 상세 제목이 바뀜",
  );

  // 4. 상태 바꾸기: 시작 → 끝냄
  const chip = () => p.evaluate(() => document.querySelector(".detail .meta .chip")?.textContent);
  await p.locator(".detail .d-actions button", { hasText: "시작" }).click();
  ok(await until(async () => (await chip()) === "하는 중"), "시작 → 하는 중");
  await p.locator(".detail .d-actions button", { hasText: "끝냄" }).click();
  ok(await until(async () => (await chip()) === "끝"), "끝냄 → 끝");
  await p.screenshot({ path: `${out}/basics-1440.png` });

  // 5. 새로고침과 다시 열기
  await p.reload();
  await p.locator(".detail #detail-title:not([aria-busy])").waitFor();
  ok(
    (await p.locator("#detail-title").textContent()) === "이름 바꾼 작업",
    "새로고침해도 이름 유지, 열린 상세도 유지",
  );
  ok((await p.locator(".detail .meta .chip").textContent()) === "끝", "새로고침해도 상태 유지");
  await ctx.close();
  const again = await page();
  await again.p.goto(base);
  await again.p.getByText("할 일 넣기").waitFor();
  ok((await again.p.getByText("이름 바꾼 작업").count()) > 0, "앱을 새로 열어도 그대로");
  await again.ctx.close();

  // 6. 저장 중 서버가 끊기면 안내, 다시 시도로 회복 (폰 폭)
  const m = await page({ width: 390, height: 844 });
  await m.p.goto(`${base}?open=task%3A${taskId}`);
  await m.p.locator(".detail #detail-title:not([aria-busy])").waitFor();
  await m.p.route("**/v1/**", (r) => r.abort());
  await m.p.locator(".detail .d-actions button", { hasText: "다시 열기" }).click();
  await m.p.getByRole("alert").waitFor();
  ok(
    (await m.p.getByRole("alert").textContent()).includes("서버에 연결되지 않습니다"),
    "폰 폭: 저장 중 끊기면 안내",
  );
  const hit = await m.p.evaluate(() => {
    const b = [...document.querySelectorAll("[role=alert] button")][0];
    const r = b.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === b;
  });
  ok(hit, "폰 폭: 상세가 열려 있어도 다시 시도 버튼이 가려지지 않음");
  await m.p.screenshot({ path: `${out}/basics-390-offline.png` });
  await m.p.unroute("**/v1/**");
  await m.p.getByRole("button", { name: "다시 시도" }).click();
  await m.p.waitForFunction(() => !document.querySelector("[role=alert]"));
  ok(
    (await api("GET", `/v1/tasks/${taskId}`)).json.status === "done",
    "끊긴 동안 누른 것은 저장되지 않음 (상태 그대로 끝)",
  );
  ok(
    await m.p.evaluate(() => document.documentElement.scrollWidth <= 390),
    "폰 폭 가로 스크롤 없음",
  );
  await m.ctx.close();
}
