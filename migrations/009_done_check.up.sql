-- 009 사람 확인 대기 (M2-1): AI 가 외부 입력 할 일을 「완료」로 바꾸면 바로 끝내지 않고 작가에게 확인을 묻는다.
-- 그 질문은 결정함의 한 칸으로 들어가고, 이 칸으로 보통 질문과 구분한다 (done_check, 보통 질문은 비움)
ALTER TABLE decisions ADD COLUMN kind TEXT;
