-- 004 되돌리기: 행은 그대로 두고 표시 칸만 뺀다. 휴지통에 든 것은 휴지통에 남는다.
ALTER TABLE tasks DROP COLUMN trashed_with;
ALTER TABLE milestones DROP COLUMN trashed_with;
