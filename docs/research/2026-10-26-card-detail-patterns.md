<!-- 2026-10-26 조사 원본 (AI 조사 · 공식 문서 기준 · 캡처는 저장소에 넣지 않음). 작가 선택 = 오른쪽 옆 패널. 적용 = web/src/items.ts · web/src/ItemViews.tsx -->
# 카드 누르면 상세가 열리는 화면: 여는 방식과 확장 구조 조사

조사일 2026-10-26. 공식 도움말·디자인 시스템 문서·공식 블로그·공식 데모만 근거로 씀.
표시 규칙: 문서에 없고 내가 미루어 짐작한 것은 (추론), 찾지 못한 것은 확인 못 함.
캡처는 `captures-card/` 폴더. 모두 1440px 폭, 로그인 없이 열리는 공개 페이지.

---

## A. 상세가 어디에, 어떻게 열리나

### A-1. 제품별 정리

**Linear**
- 두 가지 층이 있다. 목록에서 Space를 누르면 뜨는 미리보기(Peek)와, 항목을 열면 나오는 이슈 화면.
- Peek: 마우스로는 못 연다. 키보드 Space로만 켜고, 다시 Space로 끈다. Space를 누르고 있는 동안만 보이게 할 수도 있다. 켜 둔 채 J/K나 ↑/↓로 목록을 내려가면 미리보기가 따라 바뀐다. 내용은 설명·담당자·상태·우선순위·사이클·라벨·추정치·생성/수정일. 목록·보드·인박스·프로젝트 목록에서 쓴다.
- 이슈 화면: 공식 홈페이지 데모 화면에 상단 `1 / 84`와 위·아래 화살표가 보인다. 이슈를 연 채로 목록의 다음/이전 이슈로 넘어가는 장치로 보인다 (화면 관찰, 문서 확인 못 함). 왼쪽에 제목·설명·활동 기록, 오른쪽에 속성 칸.
- URL: 이슈마다 `팀키-번호` 식별자와 고유 URL이 있고, 팀을 옮기면 새 URL이 생기며 옛 URL은 새 곳으로 넘겨준다.
- 모바일: 확인 못 함.
- 참고: Peek 도움말 주소(linear.app/docs/peek)는 오늘 다시 열어 보니 404였다. 위 Peek 내용은 그 문서가 살아 있을 때 받아 둔 사본 기준.
- 캡처: `linear-home.png` (홈페이지 데모의 이슈 화면, 1/84 이동 표시와 AI 에이전트 활동 기록이 함께 보임)

**Notion 데이터베이스**
- 보기(view)마다 "Open pages in" 설정이 있고 셋 중 하나를 고른다.
  - Side peek: 오른쪽에 페이지가 열리고 왼쪽 표는 계속 조작된다.
  - Center peek: 화면 가운데 모달로 연다.
  - Full page: 바로 전체 페이지로 연다.
- 바꾸는 곳: 데이터베이스 상단 설정 메뉴 → Layout → "Open pages in" 옆 메뉴. 보기 단위 설정이라 그 보기에만 적용된다.
- 기본값: 표·보드·목록·타임라인은 side peek, 갤러리·캘린더는 center peek.
- 이동: peek 상태에서 Mac은 `ctrl+shift+J`(다음), `ctrl+shift+K`(이전).
- 닫기 단축키, URL 형식, 모바일 동작: 도움말에서 확인 못 함.
- 캡처: `notion-peek.png` (side peek이 열린 도움말 그림)

**GitHub Projects**
- 표·보드에서 항목을 열면 오른쪽 항목 패널(item side panel)이 열린다.
- 키보드: `Space` 선택 항목 열기, 화살표로 항목 사이 포커스 이동, `Shift+Space` 선택. 패널 닫는 단축키는 문서에 없음(Esc는 셀 편집 취소로만 적혀 있음).
- 패널 고정(pin): 오른쪽 위 핀을 누르면 패널을 연 채 프로젝트 표를 계속 만질 수 있다. 공식 블로그는 이것을 분류(triage) 작업용이라고 설명.
- URL: 특정 이슈가 프로젝트 안 패널로 열린 상태를 링크 하나로 공유할 수 있다. 링크 하나에 "어느 보기"와 "어느 항목이 열려 있는지"가 같이 담긴다.
- 모바일: 확인 못 함.
- 캡처: `github-projects-sidepanel.png` (표 오른쪽에 이슈 패널이 열린 공식 블로그 그림)

**Jira**
- 보드·백로그에 "Open work items in sidebar" 토글이 있다. 켜면 오른쪽 사이드바, 끄면 가운데 대화상자로 열린다.
- 전체 페이지는 `/browse/키-번호` 주소로 따로 존재한다 (공개 이슈 트래커 jira.atlassian.com 주소에서 관찰).
- 2026년 "For You" 화면에서 클릭 시 사이드 패널로만 열리게 바뀐 실험이 있었고, 사용자가 끌 수 없었다. 이에 대해 "사이드 패널/전체 페이지 중 고르게 해 달라, Cmd/Ctrl+클릭 새 탭은 어느 쪽이든 그대로 동작해야 한다"는 공식 요청 티켓(JRACLOUD-98754)이 올라와 있다. 현재 해결책은 우클릭 "새 탭에서 열기" 또는 Cmd/Ctrl+클릭.
- 다음/이전 이동, 모바일: 확인 못 함.
- 캡처: `jira-work-item-layout.png` (상세 화면의 칸 구성 설명 그림)

**Trello**
- 카드를 누르면 보드 위에 카드 뒷면(card back)이 모달로 뜬다. 뒤 보드는 어둡게 깔린다 (도움말 그림 관찰).
- 새 카드 뒷면: 제목 바로 아래 Add 메뉴(멤버·날짜·체크리스트 추가), 오른쪽 위 Actions 메뉴(복사·이동·미러링), 아래쪽 떠 있는 메뉴에서 Power-Up·자동화 버튼·댓글/활동 펼치기.
- 닫기: 그림에 오른쪽 위 X가 보인다. Esc·URL·다음 카드 이동은 도움말에서 확인 못 함.
- 캡처: `trello-card-back.png`

**Things 3**
- 목록 안에서 그 자리에 펼쳐진다(inline expand). 공식 소개 페이지는 할 일을 열면 깨끗한 흰 종이처럼 바뀐다고 설명하고, 영상에서 제목 아래 메모가 펼쳐지고 하단에 날짜·태그·체크리스트·마감 아이콘이 붙는다.
- 키보드: `Return` 선택 항목 열기, `Cmd+Return` 저장하고 닫기. Esc 동작은 문서에서 확인 못 함.
- 항목별 URL: 확인 못 함.
- 다른 조사 파일이 할 일 앱을 다루므로 여기서는 "제자리 펼치기" 방식의 예로만 둔다.
- 캡처: `things3-todo.png`

**Backstage (개발자 포털)**
- 목록에서 항목을 누르면 전체 페이지로 간다. 패널이 아니다.
- URL: `/catalog/{namespace}/{kind}/{name}` 꼴. 공식 데모에서 `/catalog/default/component/backstage`로 관찰.
- 페이지 머리: 종류·유형(Component · library), 이름, 수명주기·소유자. 아래에 탭(Overview, Docs, APIs, GitHub Actions, Todo).
- 캡처: `backstage-entity.png` (공식 데모. 로그인 권유 창이 떴지만 "Reject all"로 닫고 찍음. 아래쪽 오류 알림은 그 거절 때문)

### A-2. 한눈 비교

| 제품 | 기본 여는 방식 | 목록과 동시 조작 | 다음/이전 | 항목 URL | 사용자 선택 |
|---|---|---|---|---|---|
| Linear | Peek(Space) + 이슈 화면 | Peek은 됨 | J/K, 화면 1/84 화살표 | 있음 | 없음 |
| Notion | 보기별 side/center/full | side peek만 | ctrl+shift+J/K | 확인 못 함 | 보기마다 선택 |
| GitHub Projects | 오른쪽 패널 | 패널 고정 시 | 화살표로 목록 이동 | 보기+항목 함께 | 고정 여부 |
| Jira | 사이드바 또는 가운데 대화상자 | 사이드바일 때 | 확인 못 함 | /browse/키 | 보드 토글 |
| Trello | 가운데 모달 | 안 됨 | 확인 못 함 | 확인 못 함 | 없음 |
| Things 3 | 제자리 펼침 | 펼친 채 목록 보임 | 확인 못 함 | 확인 못 함 | 없음 |
| Backstage | 전체 페이지 + 탭 | 안 됨 | 없음 | kind/name 경로 | 없음 |

### A-3. 디자인 시스템이 말하는 "언제 무엇을"

**Material 3 사이드 시트** (캡처 `material-side-sheet.png`, 그림은 프록시 문제로 안 불러와지고 본문 글만 찍힘)
- 일반(standard) 사이드 시트: 태블릿·데스크톱 같은 넓은 화면용. 본 화면을 거드는 내용을 띄우고, 사람이 본 화면을 만지는 동안 계속 보인다. 열리면 본문 영역이 그만큼 좁아진다.
- 모달 사이드 시트: 휴대폰 같은 좁은 화면에서 권장. 닫아야 뒤 화면을 만질 수 있다.
- 좁은 화면에서는 모달, 넓은 화면에서는 일반 시트로 바뀌는 구성을 문서가 직접 예로 든다.
- 오른쪽 가장자리에 붙인다. 닫기 아이콘 버튼은 "강하게 권장". 시트 안은 본문과 따로 세로 스크롤, 가로 스크롤 금지.

**Primer (GitHub 디자인 시스템) Dialog**
- 위치를 `center | left | right`로 고르고, 화면 폭별로 다르게 줄 수 있다. 예: `{ narrow: 'bottom', regular: 'center' }`. 좁은 폭에는 `bottom`(바텀시트)이나 `fullscreen`도 가능.
- 아주 큰 대화상자를 쓰기 전에 "새 페이지가 더 맞지 않은지" 따져 보라고 적혀 있다.
- `returnFocusRef`(닫을 때 포커스 돌려줄 곳), `initialFocusRef`(열 때 포커스 둘 곳), 닫기 이벤트가 `close-button`인지 `escape`인지 구분해서 넘겨준다.

**Atlassian Design System**
- 모달 대화상자: 지금 바로 해야 하는 작업용. 닫기 전까지 뒤 페이지를 못 만진다. Esc로 닫힌다. 복잡한 작업이나 큰 표에는 쓰지 말 것, 대화상자에서 대화상자를 띄우지 말 것.
- Drawer 컴포넌트는 "폐기 예정(intent-to-deprecate)" 상태.
- 대신 새 Panel 컴포넌트(베타, 사내 전용 패키지)가 "본문 옆에 맥락 정보를 띄우는 면"으로 소개된다. 머리 부분 버튼 묶음이 `크게 보기(Expand) / 새 탭에서 열기 / 더보기 / 닫기` 네 개로 짜여 있다.

정리하면 세 문서 모두 같은 쪽을 가리킨다 (추론):
- 넓은 화면 + 목록을 보면서 훑는 일 → 옆 패널, 뒤 화면 조작 가능
- 좁은 화면 → 전체 화면 또는 아래에서 올라오는 시트
- 내용이 길고 복잡하면 → 전체 페이지로 빠지는 길을 열어 둘 것

---

## B. 여러 종류의 항목을 한 틀로 받는 방법

### B-1. Notion: 속성 + 데이터베이스 페이지 레이아웃
- 보기마다 "Property visibility"로 목록·카드에 보일 속성을 켜고 끈다.
- 상세 쪽은 "레이아웃"으로 데이터베이스 전체에 한 번에 적용한다. 특정 페이지나 보기만 다르게 할 수는 없다.
  - 머리(Heading): 속성을 최대 15개까지 고정.
  - 속성 묶음(Property group): 숨기기/보이기, 소제목으로 나누기.
  - 본문과 상세 패널(details panel): 모듈을 넣고 두 구역 사이로 옮기거나 뺀다. 상단 "View details"로 패널을 여닫는다.
  - 구조: 단순형 또는 탭형(다른 데이터베이스 보기를 탭으로 붙임).
- 캡처: `notion-layouts.png` (상세 패널 여닫기 설명 그림)

### B-2. Linear: 표시 속성과 사용자 보기
- 표시 옵션: 묶기(상태·담당자·프로젝트 등), 정렬, 그리고 카드/행마다 보일 속성 켜기·끄기(ID·상태·담당자·우선순위·프로젝트·마감일·라벨·추정치·PR). 속성 켜기·끄기는 필터가 아니다.
- 범위: 현재 보기에 적용되고 유지된다. "Set as default"로 워크스페이스 기본값을 만들고, 개인 설정은 그 위에 덧씌워진다.
- 사용자 보기(custom view): 필터 묶음을 저장. 워크스페이스/팀 단위로 두고 URL로 공유. URL에 임시 필터도 담을 수 있다.

### B-3. GitHub Projects: 사용자 정의 필드
- 필드 종류: 텍스트, 숫자, 날짜, 단일 선택(옵션마다 설명과 색), 반복 주기(iteration).
- 보기마다 View → Fields에서 보일 필드를 고른다. 표와 보드 모두 같은 방식.
- 프로젝트 설정에서 필드 순서를 끌어 바꾸면 항목 패널과 이슈 페이지의 필드 순서가 같이 바뀐다. 목록 표시와 상세 표시의 순서를 한 곳에서 관리하는 셈.
- 필드 개수 상한: 문서에서 확인 못 함.

### B-4. Jira: 카드에 보일 것과 상세에 보일 것을 따로 설정
- 보드 카드: 사용자 정의 필드를 카드당 최대 3개까지 추가. 카드 색을 작업 유형·우선순위·담당자 등으로 칠할 수 있다. 보드/공간 관리자가 설정.
- 상세(work item layout):
  - 설명 칸(왼쪽, 한 줄 배치면 위): 가장 먼저 보는 곳이라 제일 중요한 필드.
  - 맥락 칸(오른쪽, 한 줄 배치면 아래): 정렬·필터·보고용 보조 정보. "Details"와 "More fields" 두 묶음.
  - "비어 있으면 숨김" 구분선: 선 위 필드는 늘 Details에 보이고, 선 아래 필드는 값이 없으면 More fields에 접혀 있다가 값이 생기면 Details로 올라온다.
  - 숨김 칸: 화면엔 안 나오지만 작업 유형에는 연결된 채로 남음.
  - 고정 필드(Pinned fields): 사용자 개인이 자주 쓰는 맥락 필드를 맨 위로 고정.
  - 작업 유형별로 화면 설정을 따르고, 같은 화면을 쓰는 유형끼리는 함께 설정된다.
- 역할 분담: Jira 관리자는 화면·탭·유형별 필드, 공간 관리자는 배치, 개인은 고정 필드.

### B-5. Trello Power-Up: 공식 확장 지점
Power-Up은 Trello가 정한 자리에만 내용을 꽂는다. 자리별 반환 모양은 아래와 같다.

| 확장 지점 | 놓이는 곳 | 돌려주는 모양 | 제한 |
|---|---|---|---|
| `card-badges` | 카드 앞면 | 배지 배열. 각 배지 `text`, `icon`, `color`(정해진 10색), `monochrome`, 또는 `dynamic` 함수 + `refresh`(초) | refresh 최소 10초. 바깥 데이터가 바뀔 때만 dynamic 권장 |
| `card-detail-badges` | 카드 뒷면 맨 위 | 배지 배열. `title`, `text`, `color`, 클릭 시 `callback` 또는 `url`(둘 중 하나) | dynamic/refresh 동일 |
| `card-back-section` | 카드 뒷면, 첨부 칸 위 | `title`, `icon`(회색만), `content: { type: 'iframe', url, height }`, `action: { text, callback }` | Power-Up 하나당 칸 하나. 높이 최대 1500px. 첨부 정보는 넣지 말 것 |
| `attachment-sections` | 카드 뒷면 첨부 영역 | 칸 배열. 각 칸 `claimed`(이 칸이 맡을 첨부 목록), `title`, `icon`, `content`(iframe) | 맡은 첨부가 없으면 빈 배열 |

읽어 낼 점:
- 앞면에는 짧은 배지만, 뒷면에는 칸(section)을 붙인다. 앞/뒤 확장 자리가 처음부터 나뉘어 있다.
- 칸 하나는 늘 "제목 + 아이콘 + 내용 + 오른쪽 위 동작 버튼 1개" 모양이다. 확장 쪽이 틀을 바꿀 수 없고 내용만 채운다.
- 아이콘을 회색으로 강제하는 등, 확장이 많아져도 카드 뒷면이 어수선해지지 않게 막아 둔다 (추론).

### B-6. Backstage: 한 페이지 틀에 종류별로 탭과 카드를 꽂는 방식
- 항목 종류(kind): Component, API, Resource, System, Domain, Group, User, Template, Location.
- 기존 방식:
  - `EntitySwitch.Case if={isKind('system')}`로 종류마다 다른 페이지 구성을 고른다. 새 종류를 추가하려면 case 하나를 더한다.
  - `EntityLayout.Route path="/..." title="..."`가 탭 하나. 플러그인은 자기 화면을 탭 안에 넣는다.
  - Overview 탭은 그리드에 카드들(About 카드 등)을 깐다.
  - 플러그인 화면은 `useEntity()`로 "지금 열린 항목"을 받아 쓴다. 페이지가 항목을 문맥으로 내려준다.
- 새 방식(새 프론트엔드 시스템): 기존 방식은 구식으로 분류되고, `EntityCardBlueprint`(카드), `EntityContentBlueprint`(탭 내용)로 확장을 등록한다. 탭 내용은 `group`(예: overview, quality)으로 묶을 수 있고 설치 쪽 설정에서 묶음을 바꾸거나 끌 수 있다. `icon`도 지정.
- 종류별로 어떤 카드를 보일지 거르는 `filter` 매개변수의 정확한 모양은 문서 본문에서 확인 못 함.

### B-7. 공통으로 보이는 구조 (추론)
1. 카드(앞면)와 상세(뒷면)의 표시 설정이 분리돼 있다. 카드는 적게(Jira 3개, Linear 켜고 끄기), 상세는 많이.
2. 상세는 "머리 + 칸 여러 개" 틀이 고정이고, 칸 내용만 종류별·확장별로 바뀐다(Trello 칸, Backstage 탭/카드, Notion 모듈, Jira 설명/맥락 칸).
3. 칸이 비면 접거나 숨기는 규칙이 있다(Jira 비어 있으면 숨김).
4. 종류 판정은 항목의 `type`/`kind` 값 하나로 한다(Backstage isKind).

---

## C. 누를 수 있는 카드의 접근성 규칙

**카드 전체를 링크로 감싸지 말 것** (Inclusive Components, Heydon Pickering)
- 카드 전체를 `<a>`로 감싸면 화면낭독기가 카드 글 전부를 링크 이름으로 읽는다. 안에 두 번째 링크를 넣으면 혼란스럽다.
- 제목을 진짜 링크로 두고, 그 링크의 `::after`를 카드 전체로 늘려서 카드 어디를 눌러도 열리게 한다. 카드에 `position: relative`, 가상 요소는 absolute로 사방 0.
- 카드 안의 다른 버튼·링크는 `position: relative`로 늘린 링크 위로 올린다. 누르는 영역을 넉넉히.
- 늘린 링크 때문에 글자 선택이 막히는 문제가 있다. 대안으로 카드 클릭을 JS로 링크에 넘기되, 200ms 넘게 누르고 있으면 글자 선택으로 보고 무시하는 방법을 소개.
- 마우스 포인터, 마우스 올림 그림자, `:focus-within`으로 키보드 포커스가 카드 전체에 보이게.
- 제목을 소스 순서상 맨 앞에. 그림이 제목보다 앞이면 제목 이동 기능에서 건너뛸 수 있다. 보이는 순서는 flex `order`로 맞춘다.

**버튼 안에 버튼 금지** (Deque axe 규칙 `nested-interactive`, 영향도 심각, WCAG A)
- 버튼이나 링크 안에 포커스 받는 요소가 있으면, 화면낭독기가 안쪽 요소의 이름·역할·상태를 읽지 않고 빈 탭 정지가 생긴다.
- 카드를 `role="button"`으로 만들고 그 안에 완료 체크박스를 넣는 구조가 이 규칙에 걸린다 (추론).

**GOV.UK 요약 카드**
- 여러 요약 목록을 카드로 나눌 때 카드 제목과 카드 전체에 걸리는 동작을 둔다.
- 줄마다 "변경" 링크를 둘 때, 화면낭독기 사용자가 앞뒤 맥락 없이 듣게 되므로 숨김 글자로 "이름 변경"처럼 대상까지 읽히게 하라고 한다.

**모달 대화상자** (W3C APG Dialog (Modal) 패턴, Atlassian 모달, MDN `<dialog>`)
- `role="dialog"` + `aria-modal="true"` + 보이는 제목을 가리키는 `aria-labelledby`.
- Tab은 대화상자 안에서만 돈다. Esc로 닫힌다.
- 열 때: 보통 첫 포커스 요소로. 내용이 길고 구조가 있으면 맨 앞 제목 같은 정적 요소에 `tabindex="-1"`을 주고 거기로 포커스.
- 닫을 때: 연 요소(카드)로 포커스를 돌려준다. 그 요소가 사라졌으면 다음으로 자연스러운 곳으로.
- `aria-modal="true"`는 실제로 바깥 조작을 막고 바깥을 가릴 때만 쓴다(APG). MDN: `showModal()`로 연 `<dialog>`는 자동으로 aria-modal true, 바깥은 inert, Esc로 닫힘.

**모달이 아닌 옆 패널**
- MDN: `show()`로 연 비모달 `<dialog>`는 aria-modal false로 노출되고, Esc로 닫히지 않는 게 기본이다. 필요하면 직접 붙여야 한다.
- APG 모달 문서는 비모달 대화상자도 자기 탭 순서를 가진다고 적고, 차이는 닫지 않고도 바깥으로 포커스를 옮길 수 있다는 점이라고 설명.
- 비모달 옆 패널용 별도 APG 패턴은 확인 못 함. 다음은 위 규칙에서 미룬 권장이다 (추론):
  - 패널은 `aria-labelledby`로 이름 붙은 영역(`<aside>` 또는 비모달 `role="dialog"`)으로.
  - 열 때 패널 제목(`tabindex="-1"`)으로 포커스를 옮긴다. 키보드 사용자가 열렸는지 모르는 일을 막는다.
  - Esc로 닫고, 닫으면 연 카드로 포커스 복귀(APG 복귀 규칙을 그대로 적용).
  - 패널이 열린 채 목록에서 다른 카드를 누르면 내용만 바꾸고 포커스는 목록에 둔다(Linear Peek, GitHub 고정 패널의 "목록 보며 훑기" 쓰임새).

---

## naeil 에 적용 추천

### (1) 여는 방식

**PC(Mac): 오른쪽 옆 패널, 뒤 목록은 계속 조작 가능**
- 이유: "마지막에 한 일" "내가 정할 것"처럼 여러 항목을 차례로 훑는 화면이다. Notion은 표·보드·목록 기본값을 side peek으로 두고, GitHub은 패널을 고정해 목록을 보며 분류하게 하고, Material은 넓은 화면에 일반 사이드 시트를 권한다. Trello식 가운데 모달은 뒤 목록을 가려서 훑기에 불리하고, Atlassian도 모달은 "당장 해야 할 단일 작업용"으로 한정한다.
- 패널 머리 버튼은 Atlassian Panel처럼 `크게 보기 / 새 탭 / 더보기 / 닫기`. 크게 보기는 전체 페이지(`/item/...`)로 간다. Jira 요청 티켓이 보여 주듯 패널만 강제하면 불만이 생긴다.
- 키보드: 카드에 포커스 두고 Enter로 열기, 패널 열린 채 J/K(또는 ↑/↓)로 앞뒤 항목, Esc로 닫고 카드로 포커스 복귀. Linear·Notion·GitHub가 모두 "연 채로 다음 항목"을 지원한다.
- Cmd+클릭은 새 탭 전체 페이지. 제목을 진짜 `<a href>`로 두면 브라우저가 알아서 해 준다.

**폰: 전체 화면 시트(모달), 뒤로 가기로 닫힘**
- 이유: Material은 좁은 화면에서 모달 사이드 시트를, Primer는 좁은 폭에서 `fullscreen` 또는 `bottom`을 쓰게 한다. 폰 폭에서 옆 패널을 띄우면 목록과 상세가 둘 다 읽기 힘들다 (추론).
- 같은 컴포넌트가 폭에 따라 `panel`과 `sheet` 두 모양을 오간다. Primer의 `{ narrow: 'fullscreen', regular: 'right' }` 식 설정을 그대로 본뜬다.
- 폰에서 닫기는 시스템 뒤로 가기와 상단 닫기 버튼 둘 다. URL 기록을 쓰면(아래 3) 뒤로 가기가 자연스럽게 닫기가 된다.

**제자리 펼치기(Things 방식)는 쓰지 않는다**
- 한 줄짜리 메모만 있는 할 일에는 좋지만, AI 세션 기록·스킬처럼 칸이 많은 항목에선 목록이 크게 출렁인다 (추론). 한 컴포넌트로 모든 종류를 받으려면 패널 하나로 통일하는 편이 낫다.

### (2) 카드와 상세의 공통 데이터 모양

카드 앞면은 적게, 상세는 칸(section) 배열로. 새 종류는 칸만 선언해서 끼운다. Trello 카드 뒷면 칸과 Backstage 종류별 탭을 본떴다.

```ts
// 모든 항목의 주소. URL과 데이터 조회에 같이 쓴다.
type ItemRef = { type: ItemType; id: string };
type ItemType = 'task' | 'change' | 'decision' | 'milestone' | 'session' | 'skill';

// 카드 앞면 (Trello card-badges, Jira 카드 3필드 상한 참고)
type CardModel = {
  ref: ItemRef;
  title: string;
  status?: Chip;            // 상태 하나: 대기·진행·완료·실패
  chips?: Chip[];           // 최대 3개
  meta?: string;            // 한 줄: "Codex · 2시간 전 · naeil"
  badges?: Badge[];         // 아이콘+짧은 글: 비용, 남은 날, 댓글 수
  quickAction?: Action;     // 카드 위 버튼 하나(완료 체크 등). 늘린 링크 위로 올려서 배치
};
type Chip  = { label: string; tone?: 'neutral' | 'info' | 'warn' | 'done' | 'fail' };
type Badge = { icon?: string; text: string; tone?: Chip['tone'] };

// 상세 (Atlassian Panel 머리 + Trello/Backstage 칸 구성)
type DetailModel = {
  ref: ItemRef;
  title: string;
  status?: Chip;
  meta?: string;
  headerActions: Action[];  // 크게 보기·새 탭·더보기는 공통 틀이 자동으로 붙임
  sections: Section[];
};

type Section =
  | { id: string; kind: 'fields';   title?: string; fields: Field[] }       // Jira 맥락 칸
  | { id: string; kind: 'body';     title?: string; markdown: string }      // 설명·요약
  | { id: string; kind: 'timeline'; title?: string; events: Event[] }       // 변경 기록, 세션 단계
  | { id: string; kind: 'list';     title?: string; items: CardModel[] }    // 하위 항목·연결 항목(카드 재사용)
  | { id: string; kind: 'actions';  actions: Action[] }                     // 결정 버튼 등
  | { id: string; kind: 'custom';   component: string; props: unknown };   // 비상구. 되도록 안 씀

type Field  = { label: string; value: string | null; hideWhenEmpty?: boolean }; // 값 없으면 "더보기"로 접힘
type Event  = { at: string; who?: string; text: string };
type Action = { id: string; label: string; tone?: 'primary' | 'default' | 'danger'; undoable?: boolean };
```

새 종류를 끼우는 방법: 종류 하나당 등록 하나.

```ts
registerItemType('session', {
  toCard:   (s) => ({ ref, title: s.goal, status, meta: `${s.agent} · ${ago(s.endedAt)}`,
                      badges: [{ icon: 'coin', text: `$${s.cost}` }] }),
  sections: [
    { id: 'summary', kind: 'body',     from: (s) => s.summary },
    { id: 'steps',   kind: 'timeline', from: (s) => s.steps },
    { id: 'tools',   kind: 'fields',   from: (s) => s.toolUsage },
    { id: 'changes', kind: 'list',     from: (s) => s.changedItems },   // 이 세션이 바꾼 항목 카드들
  ],
});
```

종류별 칸 예시 (추론):

| 종류 | 카드 meta / 배지 | 상세 칸 |
|---|---|---|
| change(마지막에 한 일) | 어느 AI 세션 · 언제 | body(무엇을 바꿨나), fields(파일·프로젝트), list(이 변경을 만든 세션 카드) |
| decision(내가 정할 것) | 누가 올렸나 · 기다린 시간 | body(질문), fields(선택지), actions(고르기 버튼, 되돌리기 가능) |
| milestone | 마감까지 남은 날 · 진행률 | fields(날짜·목표), list(속한 할 일), timeline(변경 기록) |
| session | 에이전트 · 비용 배지 | body(요약), timeline(단계), fields(도구 사용·토큰·비용), list(바꾼 항목) |
| skill | 설치 여부 · 버전 | body(설명), fields(필요 권한·버전), actions(설치·제거) |

여러 종류에 공통으로 붙는 칸(예: "댓글" "관련 세션")은 Backstage `isKind`처럼 조건으로 붙인다.

```ts
registerSection({ id: 'related-sessions', appliesTo: (ref) => ref.type !== 'session', order: 90, ... });
```

규칙 몇 가지:
- 칸 모양(제목·아이콘·내용·오른쪽 위 동작 1개)은 공통 틀이 그린다. 종류 쪽은 데이터만 준다. Trello가 확장에 내용 칸만 열어 준 방식.
- 비어 있는 칸은 숨긴다. `fields` 안의 빈 필드는 Jira처럼 접힌 "더보기"로.
- 카드 앞면 칩은 3개까지만. 넘치면 상세로 보낸다.

### (3) 열린 항목마다 URL

- 패널로 열린 상태: 지금 화면 주소에 쿼리를 붙인다. `/today?open=session:abc123`. GitHub Projects가 "어느 보기 + 어느 항목"을 링크 하나에 담는 방식.
- 전체 페이지: `/item/session/abc123`. Backstage `/catalog/{namespace}/{kind}/{name}`, Jira `/browse/키`처럼 종류와 id가 경로에 드러나게.
- 패널을 열 때 `pushState`로 기록을 쌓아서, 브라우저 뒤로 가기(폰은 뒤로 가기 제스처)가 패널 닫기가 되게 한다 (추론). J/K로 옆 항목으로 넘어갈 땐 `replaceState`로 바꿔서 뒤로 가기 한 번에 패널이 닫히게 (추론).
- 새로고침하거나 링크를 받은 사람이 열어도 같은 패널이 열린 상태로 복원된다.

### (4) 피할 함정 3가지

1. **카드 전체를 버튼으로 만들고 안에 체크박스·버튼 넣기.** axe `nested-interactive`에 걸리고 화면낭독기가 안쪽 버튼을 못 읽는다. 제목을 `<a href>`로 두고 `::after`로 카드 전체를 덮은 뒤, 완료 체크 같은 버튼만 `position: relative`로 위에 올린다(Inclusive Components). 글자 복사가 자주 필요하면 200ms 눌림 판정 방식으로.
2. **패널만 있고 빠져나갈 길이 없음.** URL이 없거나 패널 강제면 새로고침에 사라지고, 공유가 안 되고, Cmd+클릭 새 탭이 안 된다. Jira가 실제로 이 문제로 요청 티켓을 받았다. `크게 보기`·`새 탭`·항목별 URL을 처음부터 넣는다. 포커스도 같이: 열 때 패널 제목으로, 닫을 때 연 카드로(APG).
3. **종류마다 상세 화면을 따로 만들기, 또는 카드에 다 올리기.** 마일스톤·세션·스킬을 붙일 때마다 상세를 새로 그리면 공통 컴포넌트가 금방 갈라진다. 칸 종류(`fields/body/timeline/list/actions`)를 먼저 고정하고, `custom` 칸은 정말 안 될 때만. 카드 앞면은 상태 1개 + 칩 3개 + meta 한 줄로 묶는다. 나머지는 상세로.

---

## 출처

- Linear Peek (현재 404, 이전 사본 기준): https://linear.app/docs/peek
- Linear 표시 옵션: https://linear.app/docs/display-options
- Linear 사용자 보기: https://linear.app/docs/custom-views
- Linear 이슈 만들기(식별자·URL): https://linear.app/docs/creating-issues
- Linear 홈페이지(이슈 화면 관찰): https://linear.app/
- Notion 보기·필터·정렬(Open pages in): https://www.notion.com/help/views-filters-and-sorts
- Notion 데이터베이스 레이아웃: https://www.notion.com/help/layouts
- Notion 단축키: https://www.notion.com/help/keyboard-shortcuts
- GitHub 단축키(Projects): https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts
- GitHub 필드: https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields
- GitHub 표/보드 필드 표시: https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-table-layout , https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-board-layout
- GitHub 변경 기록(항목 패널 딥링크): https://github.blog/changelog/2023-01-05-github-issues-january-5th-update/
- GitHub 변경 기록(패널 고정·필드 순서): https://github.blog/changelog/2023-07-20-github-issues-projects-july-20th-update
- Jira 보드·백로그 보기(사이드바 토글): https://support.atlassian.com/jira-software-cloud/docs/customize-your-view-of-the-board-and-backlog/
- Jira 카드 꾸미기: https://support.atlassian.com/jira-software-cloud/docs/customize-cards
- Jira 작업 항목 레이아웃: https://support.atlassian.com/jira-cloud-administration/docs/configure-issue-layout/
- Jira 요청 티켓(패널/전체 페이지 선택): https://jira.atlassian.com/browse/JRACLOUD-98754
- Trello 새 카드 뒷면: https://support.atlassian.com/trello/docs/new-card-back/
- Trello Power-Up: https://developer.atlassian.com/cloud/trello/power-ups/capabilities/card-badges , https://developer.atlassian.com/cloud/trello/power-ups/capabilities/card-detail-badges/ , https://developer.atlassian.com/cloud/trello/power-ups/capabilities/card-back-section/ , https://developer.atlassian.com/cloud/trello/power-ups/capabilities/attachment-sections/
- Things 단축키: https://culturedcode.com/things/support/articles/2785159/
- Things 소개: https://culturedcode.com/things/features/
- Backstage 시스템 모델: https://backstage.io/docs/features/software-catalog/system-model
- Backstage 플러그인을 항목 페이지에 붙이기: https://backstage.io/docs/plugins/integrating-plugin-into-software-catalog
- Backstage 확장 청사진: https://backstage.io/docs/next/frontend-system/building-plugins/common-extension-blueprints
- Backstage 공식 데모: https://demo.backstage.io/catalog/default/component/backstage
- Material 3 사이드 시트: https://m3.material.io/components/side-sheets/guidelines
- Primer Dialog: https://primer.style/product/components/dialog/
- Atlassian 모달: https://atlassian.design/components/modal-dialog/usage
- Atlassian Panel: https://atlassian.design/components/panel
- Atlassian Drawer 문서 원본(폐기 예정 표시): https://cdn.jsdelivr.net/npm/@atlaskit/drawer@12.0.6/drawer.docs.tsx
- W3C APG 모달 대화상자: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- W3C APG 펼침(disclosure): https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
- Inclusive Components 카드: https://inclusive-components.design/cards/
- Deque axe nested-interactive: https://dequeuniversity.com/rules/axe/4.10/nested-interactive
- GOV.UK 요약 목록·요약 카드: https://design-system.service.gov.uk/components/summary-list/
- MDN dialog 요소: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
