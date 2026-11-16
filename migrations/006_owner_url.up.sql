-- 006 가져오기 (M1-3)
-- ① 몫: 작가가 할 일(author)인가 AI 가 할 일(ai)인가. AI 몫은 「지금 할 것」 후보에서 빠진다 (작가 결정 2026-11-13 「AI 몫으로」)
-- ② 원본 주소: 가져온 일의 원문(깃허브 이슈, vault 문서)으로 가는 주소
ALTER TABLE tasks ADD COLUMN owner TEXT NOT NULL DEFAULT 'author' CHECK (owner IN ('author', 'ai'));
ALTER TABLE tasks ADD COLUMN source_url TEXT;
-- ③ 출처에서 마지막으로 본 값 (JSON). 출처에서 바뀐 칸만 고친다.
--    작업판에서 끝냈거나 이름을 바꾼 것을 출처가 그대로라고 한 시간마다 되돌리지 않게
ALTER TABLE tasks ADD COLUMN source_seen TEXT;
