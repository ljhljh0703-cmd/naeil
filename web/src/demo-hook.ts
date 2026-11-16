// 보통 화면에서는 비어 있다. 시연판으로 구울 때(npm run build:demo)만 demo/hook.ts 로 바뀐다 (vite.demo.config.ts)
export type DemoReply = { status: number; json: unknown };
export type DemoCall = (
  method: string,
  url: string,
  body: unknown,
  headers: Record<string, string>,
) => Promise<DemoReply>;

export const demoCall: DemoCall | null = null;
export const isDemo = false;
