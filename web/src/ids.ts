// 다시 시도 열쇠. crypto.randomUUID 는 암호화 주소(https, localhost)에서만 있어서,
// 폰에서 평문 주소(http://기기이름:3700)로 열면 「할 일 넣기」가 그 자리에서 멈췄다 (2026-11-13 검토에서 재현).
// getRandomValues 는 어느 주소에서나 있으니 그걸로 같은 모양(UUID 4판)을 만든다.
export function newKey(
  c: Pick<Crypto, "getRandomValues"> & { randomUUID?: () => string } = crypto,
): string {
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
