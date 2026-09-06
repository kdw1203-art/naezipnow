# 969 — 잔여 작업: 보류 3건 + 하이드레이션 결함 수정 (2026-09-06)

소유자 요청: "잔여작업도 진행해줘" — 968 에서 보류한 모바일 제안 16·20·22 와 968 검증 중 발견한
`/subscription` 하이드레이션 불일치, 단지 번들 예산 여유 부족을 처리했다.

| # | 바뀐 것 |
|---|---|
| 16 | **폰트 셀프호스팅** — Pretendard 동적 서브셋(CSS 1 + woff2 92, 3.0MB)과 슬로건 세리프(Noto Serif KR 600, text= 서브셋 50KB)를 `public/fonts/` 로. 외부 폰트 오리진 3개(jsdelivr·googleapis·gstatic) → 0, CSP `style-src`/`font-src` 에서 해당 호스트 제거. `/fonts/*` 는 immutable 1년 + SW cache-first. 페이지당 실제 내려받는 바이트는 동일(동적 서브셋 그대로) — DNS/TCP/TLS 핸드셰이크만 사라짐 |
| 20 | **공개 노트 상세 데이터 캐시**(ISR 전환 대신) — 노트 행·공개 회차·댓글(비로그인)·관련 노트 풀을 `unstable_cache`(60~300초, 태그 `note:<id>`·`note-comments:<id>`·`public-notes`). PATCH/DELETE/댓글/AI 재분석/카드 설정/신고 숨김/탈퇴 경로에서 태그 무효화. 비공개 노트는 두 겹 가드로 절대 캐시되지 않음. 공개 노트 비로그인 요청: DB 왕복 4 → 0(적중 시). `generateMetadata` 와 페이지의 중복 `getNote` 도 요청당 1회로. `[note-timing]` 로그(샘플 1/20) |
| 22 | **미들웨어 Supabase `getUser()` 조건화** — 쿠키 없음(게스트) → 호출 없음, 토큰 만료까지 120초 넘게 남음 → 호출 없음, 만료 임박·판독 불가 → 호출(갱신). `lib/supabase/session-cookie.ts` 순수 판독(base64- 접두·청크·구형 URL 인코딩) + 단위테스트 6 |
| H | **`/subscription` React #418 원인 수정** — dev 서버 실측 "In HTML, `<p>` cannot be a descendant of `<p>`": 966 에서 안내 `<div>`(안에 `<p>`)가 하단 `<p>` 안에 들어가 브라우저가 `<p>` 를 먼저 닫아 서버 HTML 과 React 트리가 달라졌다. 형제로 분리. (남는 dev 경고 1건은 폰트 `media=print→all` 스왑에 의한 것으로 의도된 동작) |
| B | `/complex/[id]` 번들 예산 470 → 480KB(병합 실측 467, 여유 3KB 는 정상 기능 추가도 막음) |

## 검증
- `npm run build` 전체 게이트 통과 — 단위검증 **378**(968: 365 → +13), 번들 예산 6 라우트 통과, 링크 크롤 197/197.
- 로컬(next start): `/fonts/pretendard/*.css|woff2`·`/fonts/noto-serif-kr/*.woff2` 200 + `immutable`, CSP `style-src 'self' 'unsafe-inline'` / `font-src 'self' …vercel.live`. Playwright(Pixel 5) 홈: `document.fonts` 에 "Pretendard Variable 45 920"·"Noto Serif KR 600" 로드, 외부 요청은 AdSense·네이버 지도뿐(폰트 외부 요청 0).
- dev 서버에서 `/subscription` 모바일 8회 로드: 수정 전 `<p>` 중첩 오류 재현 → 수정 후 #418 없음.

## 배포 확인 사항
- 967 push(1e80554, 20:21 KST) 뒤 45분이 지나도 Vercel 에 새 배포가 없다 — 배포는 GitHub Actions "Deploy to Vercel" 가 하므로, 저장소 **Actions 탭**에서 그 실행의 상태(실패 시 빨간 ✗ + Issues 탭에 "Deploy failure …" 이슈 자동 생성)를 확인해야 한다. 아무 실행도 없으면 Actions 사용량/권한 문제.
