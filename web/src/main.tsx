import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
// 글꼴은 저장소 안 꾸러미에서. 바깥 글꼴 서버를 부르지 않아 사내망·폐쇄망에서도 같은 모양
import "wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.css";
import "./styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
