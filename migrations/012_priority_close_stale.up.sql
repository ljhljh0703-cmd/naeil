-- 012 할 일 우선순위(높음, 보통, 낮음)와 묵은 질문 닫기.
-- 우선순위는 지금 할 것을 고를 때 하는 중 다음으로 본다. 기본 보통
ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low'));

-- 이미 끝난 할 일에 열린 채 남은 질문을 닫는다 (출처에서 끝난 일의 질문이 열려 남던 문제, 0.8.0 에서 고침).
-- 되돌리기(down)는 우선순위 칸만 없애고, 닫은 질문은 그대로 둔다
UPDATE decisions
   SET answer = '닫힘',
       note = '할 일이 이미 끝나 질문을 닫음',
       answered_by = 'naeil',
       answered_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE answered_at IS NULL
   AND task_id IN (SELECT id FROM tasks WHERE status = 'done');
