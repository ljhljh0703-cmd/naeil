// 이 node 가 .node-version 이상이고 큰 번호가 같은지. 맞으면 0, 아니면 1
//   node scripts/node-ok.mjs
import { readFileSync } from "node:fs";

const want = readFileSync(new URL("../.node-version", import.meta.url), "utf8").trim();
const p = (v) => v.replace(/^v/, "").split(".").map(Number);
const [a, b] = [p(process.version), p(want)];
const d = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
if (a[0] !== b[0] || d < 0) {
  console.error(`node ${process.version} 는 맞지 않음. ${want} 이상, 같은 큰 번호`);
  process.exit(1);
}
console.log(`node ${process.version} (필요: ${want} 이상)`);
