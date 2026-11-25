-- 011 프로젝트 출처 이름표: 가져오기가 프로젝트를 이름이 아니라 출처(깃허브 저장소, vault 기록)로 찾게 한다.
-- 그래야 작가가 프로젝트 이름을 바꿔도 다음 가져오기 때 옛 이름 프로젝트가 새로 생기지 않는다. 한 프로젝트에 출처가 여럿일 수 있다(합친 프로젝트)
CREATE TABLE project_sources (
  workspace_id TEXT NOT NULL DEFAULT 'me',
  source_key   TEXT NOT NULL,
  project_id   TEXT NOT NULL REFERENCES projects(id),
  created_at   TEXT NOT NULL,
  PRIMARY KEY (workspace_id, source_key)
);

-- 이미 가져온 할 일에서 출처를 채운다. 깃허브는 출처 번호 「저장소#번호」의 저장소, vault 는 출처 이름
INSERT OR IGNORE INTO project_sources (workspace_id, source_key, project_id, created_at)
  SELECT workspace_id, 'github:' || substr(source_ref, 1, instr(source_ref, '#') - 1), project_id, MIN(created_at)
  FROM tasks
  WHERE source = 'github' AND instr(source_ref, '#') > 1
  GROUP BY workspace_id, substr(source_ref, 1, instr(source_ref, '#') - 1);

INSERT OR IGNORE INTO project_sources (workspace_id, source_key, project_id, created_at)
  SELECT workspace_id, 'vault:' || source, project_id, MIN(created_at)
  FROM tasks
  WHERE source NOT IN ('github', 'direct', 'inbox') AND source_ref IS NOT NULL
  GROUP BY workspace_id, source;
