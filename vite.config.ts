import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 화면은 web/ 에서 만들고 web/dist 로 굽는다. 서버(3700)가 web/dist 를 그대로 내보낸다.
// 개발 중(npm run dev:web)에는 5173 화면이 API 요청을 3700 서버로 넘긴다.
export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    proxy: { "/v1": "http://127.0.0.1:3700", "/health": "http://127.0.0.1:3700" },
  },
});
