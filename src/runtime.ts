// 실행 환경 점검: 알려진 보안 구멍이 있는 Node 로는 서버를 켜지 않는다.
// 사내망·폐쇄망에서는 「자동 업데이트」가 없으므로, 켤 때마다 최소 버전을 확인하는 게 마지막 안전줄이다.
//
// 새 보안 공지가 나오면 할 일 (운영 안내서에도 같은 순서):
//   1) 아래 표의 줄별 최소 버전을 고친다  2) .node-version 을 같은 값으로  3) 시험 → 반입 → 교체
// 출처: https://nodejs.org/en/blog/vulnerability/october-2026-security-releases (2026-10-21)
export const MIN_SAFE: Record<number, string> = {
  22: "22.23.4",
  24: "24.22.1",
  26: "26.12.1",
};

const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number) as [number, number, number];

export function compareVersions(a: string, b: string): number {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export type NodeCheck = { ok: true } | { ok: false; reason: string };

export function checkNode(version = process.version): NodeCheck {
  const major = parse(version)[0];
  const min = MIN_SAFE[major];
  if (!min) {
    return {
      ok: false,
      reason: `Node ${version} 은 지원 목록(${Object.keys(MIN_SAFE).join("·")}.x)에 없음. 지원이 끝난 줄은 보안 수정을 받지 못한다`,
    };
  }
  if (compareVersions(version, min) < 0) {
    return {
      ok: false,
      reason: `Node ${version} 에 알려진 보안 구멍이 있음. ${min} 이상으로 올리세요`,
    };
  }
  return { ok: true };
}
