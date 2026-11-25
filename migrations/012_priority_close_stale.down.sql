-- 012 되돌리기: 우선순위 칸을 없앤다. 닫은 질문은 되돌리지 않음
ALTER TABLE tasks DROP COLUMN priority;
