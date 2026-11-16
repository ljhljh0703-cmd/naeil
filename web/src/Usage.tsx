// 최근 7일 사용 기록 (M1-5). 접혀 있다가 펼칠 때 읽는다
import { useState } from "react";
import { api, type UsageDay } from "./api.js";

const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export function usageLine(d: UsageDay): string {
  const parts = [d.firstOpenedAt ? `${hm(d.firstOpenedAt)} 엶` : "안 엶"];
  if (d.authorChanges) parts.push(`내가 ${d.authorChanges}`);
  if (d.decisions) parts.push(`결정 ${d.decisions}`);
  if (d.aiChanges) parts.push(`AI ${d.aiChanges}`);
  if (d.imports) parts.push(`가져오기 ${d.imports}`);
  return parts.join(", ");
}

export function Usage() {
  const [days, setDays] = useState<UsageDay[] | null>(null);
  const [error, setError] = useState<string>();
  return (
    <details
      className="usage"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) {
          api
            .usage()
            .then((d) => {
              setDays(d);
              setError(undefined);
            })
            .catch((err: Error) => setError(err.message));
        }
      }}
    >
      <summary>최근 7일</summary>
      {error && <p className="usage-error">{error}</p>}
      {days && (
        <ol>
          {[...days].reverse().map((d) => (
            <li key={d.day}>
              <span className="usage-day">{d.day.slice(5).replace("-", "/")}</span> {usageLine(d)}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
