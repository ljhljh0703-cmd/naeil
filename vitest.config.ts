import { defineConfig } from "vitest/config";

// 화면 설정(vite.config.ts)은 web/ 을 뿌리로 쓰므로, 시험은 따로 저장소 뿌리에서 돈다.
export default defineConfig({
  test: { include: ["test/**/*.test.ts", "web/src/**/*.test.ts"] },
});
