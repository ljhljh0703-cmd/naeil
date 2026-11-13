// 폰에서 평문 주소로 열었을 때: 암호화 주소가 아니라 crypto.randomUUID 가 없어도 할 일 넣기가 됨
// (2026-11-13 검토에서 재현된 구멍. 폰은 tailscale serve 의 https 로 여는 게 기본이지만, 평문으로 열어도 막히지 않게)
export async function run({ page, ok, api, base }) {
  // 브라우저가 naeil-phone.test 를 이 컴퓨터로 보낸다 (run.mjs 의 host-resolver-rules). localhost 가 아니라 평문 = 안전하지 않은 주소
  const plain = base.replace("127.0.0.1", "naeil-phone.test");
  const { ctx, p } = await page({ width: 390, height: 844 });
  await p.goto(plain);
  await p.getByText("할 일 넣기").waitFor();
  const env = await p.evaluate(() => ({
    secure: window.isSecureContext,
    uuid: typeof crypto.randomUUID,
  }));
  ok(
    env.secure === false && env.uuid === "undefined",
    `평문 주소에서 열림, randomUUID 없음 (${JSON.stringify(env)})`,
  );
  await p.getByLabel("할 일", { exact: true }).fill("폰에서 넣은 일");
  await p.getByLabel("새 프로젝트 이름").fill("폰 시험");
  await p.getByRole("button", { name: "넣기" }).click();
  await p.getByRole("link", { name: "폰에서 넣은 일" }).first().waitFor();
  const tasks = (await api("GET", "/v1/tasks?limit=200")).json.items;
  ok(
    tasks.filter((t) => t.title === "폰에서 넣은 일").length === 1,
    "평문 주소에서도 할 일 넣기가 저장됨",
  );
  ok((await p.getByRole("alert").count()) === 0, "오류 안내 없음");
  await ctx.close();
}
