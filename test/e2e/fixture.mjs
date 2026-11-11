// 마일스톤 화면과 상세 패널 흐름이 쓰는 시험 자료. API 로만 넣는다 (화면이 실제로 받는 모양 그대로).
// 날짜는 오늘(서울)에서 며칠 뒤로 잡아, 언제 돌려도 같은 칸에 들어가게 한다.
export const DAY = 86_400_000;
export const daysFromNow = (n) => new Date(Date.now() + n * DAY).toISOString();
// 서울 날짜 YYYY-MM-DD
export const seoulDate = (n) =>
  new Date(Date.now() + n * DAY).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export async function fixture({ api }) {
  const must = async (method, path, body) => {
    const r = await api(method, path, body);
    if (r.status >= 300)
      throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.json)}`);
    return r;
  };
  const project = async (name) => (await must("POST", "/v1/projects", { name })).json.id;
  const milestone = async (projectId, name, days) =>
    (await must("POST", `/v1/projects/${projectId}/milestones`, { name, dueAt: daysFromNow(days) }))
      .json.id;
  const task = async (projectId, title, extra = {}) =>
    (await must("POST", "/v1/tasks", { projectId, title, ...extra })).json.id;
  const status = async (id, s) => {
    const cur = await must("GET", `/v1/tasks/${id}`);
    const r = await api("PATCH", `/v1/tasks/${id}`, { status: s }, { "if-match": cur.etag });
    if (r.status !== 200) throw new Error(`상태 바꾸기 실패 ${r.status}`);
  };

  const naeil = await project("내일은내일");
  const basic = await milestone(naeil, "기본 화면", 3);
  const oneDay = await milestone(naeil, "오늘 화면 하루 써 보기", 10);
  const mac = await milestone(naeil, "맥 앱 포장", 30);
  await status(await task(naeil, "할 일 만들기", { milestoneId: basic }), "done");
  await task(naeil, "이름 바꾸기", { milestoneId: basic });
  await task(naeil, "하루 써 보기 기록", { milestoneId: oneDay });
  await status(await task(naeil, "앱 아이콘 고르기", { milestoneId: mac }), "doing");
  await task(naeil, "흩어진 할 일", { dueAt: daysFromNow(2) });

  const jelly = await project("젤리 패닉");
  await task(jelly, "광고 소재 한 장", { dueAt: daysFromNow(5) });
  return { naeil, jelly };
}
