// 화면에 보이는 말과 시각 표시. 한곳에 모아 두면 화면마다 같은 말을 쓴다.
import type { BlockedReason, Status } from "./today.js";

export const STATUS: Record<Status, string> = { todo: "할 일", doing: "하는 중", done: "끝" };

export const BLOCKED: Record<BlockedReason, string> = {
  my_decision: "내 결정 기다림",
  ai_working: "AI가 하는 중",
  external: "바깥 답 기다림",
  tech: "기술 문제",
};

export const ACTION: Record<string, string> = {
  create: "만듦",
  status: "상태 바꿈",
  update: "고침",
  block: "멈춤",
  unblock: "멈춤 풀림",
  trash: "휴지통",
  revive: "되살림",
};

const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dayFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
});

export const todayFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "long",
});

export const timeOf = (iso: string) => timeFmt.format(new Date(iso));
export const dayOf = (iso: string) => dayFmt.format(new Date(iso));

export const dLabel = (n: number) => (n === 0 ? "오늘 마감" : n > 0 ? `D-${n}` : `${-n}일 지남`);

export const whoOf = (actor: string, session: string | null) =>
  session ? `${actor} · ${session}` : actor;
