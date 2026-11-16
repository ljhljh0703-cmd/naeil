// 배포 상태 확인과 같은 30초 안에서 시작을 기다린다. 요청 하나도 무한히 기다리지 않는다.
export async function waitForHealth(url, child, {
  timeoutMs = 30000,
  requestTimeoutMs = 1000,
  pollIntervalMs = 100,
} = {}) {
  const started = performance.now();
  let lastError = "연결 전";
  let spawnError;
  const onError = (error) => { spawnError = error; };
  child.once("error", onError);
  try {
    while (performance.now() - started < timeoutMs) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null) break;
      const remaining = Math.max(1, Math.ceil(timeoutMs - (performance.now() - started)));
      try {
        const health = await fetch(url, {
          signal: AbortSignal.timeout(Math.min(requestTimeoutMs, remaining)),
        });
        return { health, detail: "", elapsedMs: Math.round(performance.now() - started) };
      } catch (error) {
        lastError = error.cause?.code || error.name || error.message;
      }
      const delay = Math.min(pollIntervalMs, timeoutMs - (performance.now() - started));
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const elapsedMs = Math.round(performance.now() - started);
    const reason = spawnError ? `프로세스 시작 오류: ${spawnError.message}`
      : child.exitCode !== null || child.signalCode !== null
        ? `프로세스 종료: 코드 ${child.exitCode}, 신호 ${child.signalCode}`
        : `준비 대기 ${timeoutMs}ms 초과, 마지막 연결 오류 ${lastError}`;
    return { health: null, detail: `${reason} (경과 ${elapsedMs}ms)`, elapsedMs };
  } finally {
    child.off("error", onError);
  }
}
