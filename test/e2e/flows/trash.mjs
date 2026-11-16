// 프로젝트 휴지통 (M1-2): 한 번 더 묻기, 안의 것도 같이 들어감, 휴지통에서 되살리면 같이 돌아옴, 새로고침 유지
import { fixture as data } from "../fixture.mjs";

export const fixture = data;

export async function run({ page, ok, until, api, base, out }) {
  const live = async () => (await api("GET", "/v1/tasks?limit=200")).json.items;
  const before = await live();
  const naeilTasks = before.filter((t) => t.projectId === before[0].projectId).length;

  const { p } = await page();
  await p.goto(base);
  await p.waitForSelector(".hero");
  await p.getByRole("button", { name: "마일스톤", exact: true }).click();
  await p.waitForSelector(".board-head");
  ok((await p.locator(".trash-bin").count()) === 0, "휴지통이 비면 휴지통 칸이 안 보임");

  await p.getByRole("button", { name: "프로젝트 휴지통으로" }).click();
  const ask = p.locator("fieldset.confirm");
  ok(
    (await ask.textContent()).includes("마일스톤 3개, 할 일 5개"),
    "넣기 전에 안의 마일스톤과 할 일 수를 보여 주고 한 번 더 물음",
  );
  await p.getByRole("button", { name: "그만두기" }).click();
  ok((await p.locator("fieldset.confirm").count()) === 0, "그만두기를 누르면 아무것도 안 바뀜");
  ok((await live()).length === before.length, "그만두면 할 일 그대로");

  await p.getByRole("button", { name: "프로젝트 휴지통으로" }).click();
  await p.getByRole("button", { name: "휴지통에 넣기" }).click();
  ok(
    await until(async () => (await p.locator("#board-title").textContent()) === "젤리 패닉"),
    "넣으면 남은 프로젝트로 넘어감",
  );
  ok(
    (await p.locator(".trash-bin li").textContent()).includes("내일은내일"),
    "휴지통 칸에 넣은 프로젝트가 보임",
  );
  ok((await live()).length === before.length - naeilTasks, "안의 할 일도 같이 목록에서 빠짐");
  await p.screenshot({ path: `${out}/trash-1440.png`, fullPage: true });

  // 오늘 화면에서도 빠짐
  await p.getByRole("button", { name: "오늘", exact: true }).click();
  await p.waitForSelector(".hero");
  ok(
    await until(async () => (await p.locator(".hero").textContent()).includes("광고 소재 한 장")),
    "지금 할 것이 남은 프로젝트에서 골라짐",
  );
  ok(
    !(await p.locator("main").textContent()).includes("「(휴지통)」 휴지통"),
    "마지막에 한 일에 휴지통에 넣은 프로젝트 이름이 보임",
  );

  // 새로고침해도 휴지통에 그대로
  await p.reload();
  await p.waitForSelector(".hero");
  await p.getByRole("button", { name: "마일스톤", exact: true }).click();
  await p.waitForSelector(".trash-bin");
  ok((await p.locator(".trash-bin li").count()) === 1, "새로고침해도 휴지통에 그대로");

  await p.locator(".trash-bin").getByRole("button", { name: "되살리기" }).click();
  ok(
    await until(async () => (await p.locator("#board-title").textContent()) === "내일은내일"),
    "되살리면 그 프로젝트가 열림",
  );
  ok((await p.locator(".ms").count()) === 4, "마일스톤도 같이 돌아옴");
  ok((await p.locator(".trash-bin").count()) === 0, "휴지통이 다시 빔");
  ok((await live()).length === before.length, "할 일도 모두 돌아옴");
}
