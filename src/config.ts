// 설정은 코드에 박지 않고 바깥(환경 변수)에서 받는다. 맥·윈도우 어디로 옮겨도 코드는 그대로.
export type Config = {
  host: string;
  port: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.NAEIL_PORT ?? 3700);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`NAEIL_PORT 값이 잘못됨: ${env.NAEIL_PORT}`);
  }
  // 기본은 이 컴퓨터 안에서만 열림. 폰 접속은 단계 2에서 Tailscale 주소로만 연다.
  return { host: env.NAEIL_HOST ?? "127.0.0.1", port };
}
