-- 004 프로젝트를 휴지통에 넣을 때 같이 들어간 마일스톤과 할 일을 표시한다 (M1-2).
-- 되살릴 때 이 표시가 있는 것만 같이 꺼낸다. 먼저 따로 휴지통에 넣었던 것은 그대로 둔다.
ALTER TABLE milestones ADD COLUMN trashed_with TEXT;
ALTER TABLE tasks ADD COLUMN trashed_with TEXT;
