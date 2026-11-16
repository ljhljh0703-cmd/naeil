-- 008 날짜별 사용 기록 (M1-5): 작가가 그날 처음 연 시각.
-- 누른 수, 고른 결정 수, AI 가 바꾼 수는 변경 기록과 결정함에서 센다 (따로 적지 않음)
CREATE TABLE usage_days (
  workspace_id    TEXT NOT NULL DEFAULT 'me',
  day             TEXT NOT NULL,  -- 한국 날짜 YYYY-MM-DD
  first_opened_at TEXT NOT NULL,  -- 사람 출입증으로 처음 부른 시각 (세계 표준시)
  PRIMARY KEY (workspace_id, day)
);
