-- 010 AI 세션 잡기와 놓기 (M2-2): 서버가 잡기 번호를 발급하고, 그 번호가 없거나 지난 번호인 AI 요청은 거절한다.
-- hold_id 는 잡은 세션만 아는 번호라 할 일 응답에는 내보내지 않는다. 시간이 지나면(hold_expires_at) 잡기는 저절로 끝난 것으로 본다
ALTER TABLE tasks ADD COLUMN hold_id TEXT;
ALTER TABLE tasks ADD COLUMN hold_expires_at TEXT;
