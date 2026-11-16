import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 공개 시연판 (M1-9): 서버 없이 브라우저 안에서 도는 판. 예시 자료로 시작하고 새로 고치면 처음으로.
// 보통 화면과 같은 web/ 를 굽되, demo-hook 하나만 진짜 시연 장치(demo/hook.ts)로 바꾼다
export default defineConfig({
  root: "web",
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^\.\/demo-hook\.js$/,
        replacement: fileURLToPath(new URL("web/src/demo/hook.ts", import.meta.url)),
      },
    ],
  },
  build: { outDir: "dist-demo", emptyOutDir: true },
});
