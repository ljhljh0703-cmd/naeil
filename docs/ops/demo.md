# 공개 시연판 (M1-9)

서버 없이 브라우저 안에서 도는 작업판입니다. 예시 자료 둘(퍼즐 게임, 소개 페이지)로 시작하고, 새로 고치면 처음 자료로 돌아갑니다. 진짜 작업판과 같은 저장소 코드(`src/db/store.ts`)를 브라우저 안 SQLite(sql.js) 위에서 돌립니다.

- 굽기: `npm run build:demo` → `web/dist-demo/`
- 시험: `npm run e2e:demo` (PC 폭과 폰 폭에서 열기, 결정 고르기, 최근 7일, 새로 고치면 처음으로, 바깥 요청 없음)
- 올리기: `.github/workflows/demo.yml`. main 에 합치면 본판, PR 은 미리보기 주소. 주소는 작업 요약(Actions 실행 화면 맨 아래)에 찍힘

## 처음 한 번: 클라우드플레어 비밀값 넣기 (작가가 직접)

출입증과 같은 열쇠라서 채팅이나 파일에 붙이지 않습니다. 클라우드플레어 화면에서 만들어 깃허브 비밀값 칸에 바로 넣습니다.

1. **API 토큰 만들기**
   - https://dash.cloudflare.com/profile/api-tokens 에서 「Create Token」
   - 「Create Custom Token」을 고르고 권한을 한 줄만: `Account` / `Cloudflare Pages` / `Edit`
   - Account Resources 는 내 계정 하나. 나머지는 그대로 두고 만들기
   - 만들어진 토큰은 이 화면에서 한 번만 보입니다. 다음 단계까지 창을 닫지 않기
2. **계정 ID 찾기**
   - https://dash.cloudflare.com 첫 화면에서 「Workers & Pages」를 누르면 오른쪽에 「Account ID」가 있음 (주소창의 `dash.cloudflare.com/` 뒤 긴 글자와 같음)
3. **깃허브에 넣기**
   - https://github.com/ljhljh0703-cmd/naeil/settings/secrets/actions 에서 「New repository secret」 두 번
   - 이름 `CLOUDFLARE_API_TOKEN`, 값은 1의 토큰
   - 이름 `CLOUDFLARE_ACCOUNT_ID`, 값은 2의 계정 ID
4. **한 번 돌리기**
   - https://github.com/ljhljh0703-cmd/naeil/actions/workflows/demo.yml 에서 가장 최근 실행을 열고 「Re-run all jobs」. 또는 다음 PR 을 main 에 합치면 저절로

처음 올릴 때 페이지 프로젝트 `naeil-demo` 를 만듭니다. 그 이름이 이미 쓰이고 있으면 클라우드플레어가 뒤에 글자를 붙인 주소를 줍니다. 실제 주소는 작업 요약에서 확인합니다.

## 비밀값이 없을 때

굽기와 시험은 그대로 돌고, 올리기만 건너뛰며 「비밀값이 없어 올리기를 건너뜀」 알림을 남깁니다. 실패로 치지 않습니다.

## 지키는 것

- 예시 자료만. 진짜 할 일, 진짜 출입증, 자료 파일은 시연판에 들어가지 않음 (자료는 `web/src/demo/sample.ts` 에서 지어 넣음)
- 시연판은 바깥 서버로 요청을 보내지 않음 (시험이 확인)
- 보통 화면(`npm run build:web`)에는 시연 장치가 들어가지 않음. 시연판 굽기에서만 `demo-hook` 하나를 바꿔 끼움 (`vite.demo.config.ts`)
- 토큰 권한은 페이지 올리기 하나. 토큰을 지우면 올리기만 멈추고 시연판은 마지막 판으로 남음
