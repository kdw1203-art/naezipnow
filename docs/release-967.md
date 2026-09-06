# 967 — 자체 감사 개선 33건 (2026-09-06)

소유자 요청: "너가 직접 검토해서 개선할 수 있는 사항 30가지를 찾아서 제안" → "터미널로
적용할 수 있게 파일과 지시문". 코드 감사(파일·줄 단위) + 운영 데이터(Vercel 404·오류
로그, ops.health_alert_log, web_vitals, pg_stat)에서 나온 항목만 담았고, 번호는 제안
목록·코드 주석의 `[967 · N]` 태그와 같다. 지어낸 숫자·문구 없음.

## A. 임장노트 작성폼 (9) — `app/notes/new/NoteForm.tsx`

| # | 바뀐 것 |
|---|---|
| 1 | **사진 일부 실패 시 성공분 보존** — 예전엔 5장 중 1장만 실패해도 올라간 사진까지 버렸다. 파일별 독립 업로드, 실패분만 "다시 시도" |
| 2 | **방문일 입력**(`<input type=date>`, 오늘 이전만) — EXIF 촬영일이 있으면 자동 채움 + "사진 촬영일로 채웠어요" |
| 4 | **하단 고정 저장 바** — 원래 저장 버튼이 화면에 보이면 자동으로 숨음(IntersectionObserver). 자동저장 상태·공개 여부 표시 |
| 5 | **사진 순서·대표 지정** — ◀▶ 정렬, "대표" 버튼(목록 커버 = photos[0], 데이터 모델 불변) |
| 6 | **병렬 업로드(3개씩)·진행률** — XHR upload.onprogress 실측값만 표시("2/5 업로드 중…") |
| 7 | `window.prompt` 제거 — 태그·고려사항을 인라인 입력(Enter 추가·Esc 취소·중복 시 토스트) |
| 8 | 본문 textarea 자동 확장(최대 40vh)·세로 리사이즈·글자 수(5000자 — 서버 상한이 없어 폼에서 정함) |
| 9 | 임시저장 키 분리 — 새 노트 `nz_note_draft`(홈 이어쓰기 팝업 그대로), 수정은 `nz_note_draft:edit:<id>` |
| 10 | **수정 모드 자동저장** + 재진입 시 "저장하지 않은 수정 내용이 있어요 — 복원 / 버리기" |

## A'. 노트 상세·목록 (7)

| # | 바뀐 것 |
|---|---|
| 3 | **노트 삭제 버튼**(소유자) — 인라인 2단계 확인, 기존 DELETE API 사용 |
| 11 | **위치 미니맵** — metadata.lat/lng 가 있으면 네이버 지도 미니맵 + "지도에서 보기"(`/map?lat&lng&z=16`) |
| 12 | **공개 노트 댓글** — 새 표 `note_comments`(service_role 전용, RLS on·정책 없음), API `GET/POST/DELETE /api/inspection/notes/[id]/comments`, 답글 1단계, 소프트 삭제, 노트 주인 알림함 알림, 신고(ReportButton) |
| 13 | 관련 노트 매칭을 시·구·동 단위 근접 매칭으로(`lib/notes/region-match.ts`) — 목록의 관심 지역 필터와 같은 규칙 |
| 19 | 임장노트 목록 **커서 페이지네이션 "더 보기"**(첫 30건 60초 캐시, 이후 `/api/inspection/notes?public=1&before=`) |
| 20 | 목록 상단 **공개 노트 / 내 노트** 세그먼트(`?tab=mine`) |
| 25 | 동네 뉴스 댓글 **신고·삭제**(본인·글쓴이) — adopt GET 이 `ownCommentIds` 만 돌려줌(이메일 미노출) |

## B. 단지 페이지 (5) — `app/complex/[id]/`

| # | 바뀐 것 |
|---|---|
| 14 | 탭이 URL 에(`?tab=`) — 공유·뒤로가기 유지. ISR HTML 은 그대로(마운트 후 `location.search`) |
| 15 | **"내 기록" 탭 실데이터** — `GET /api/me/complex-records?complexId=` (내 노트·관심 여부), 로그인/빈 상태/목록 |
| 16 | 실거래 표 **면적대 칩 + 정렬**(최신·높은·낮은 가격) — `getTransactionHistoryWithBands` 가 면적을 함께 가져옴(기존 로더 6곳 불변) |
| 17 | **모바일 하단 액션 바**(관심 등록·노트 쓰기·전문가 상담) — 원 CTA 가 보이면 숨음, 모달 열림 시 숨음 |
| 18 | 목록 key 를 id 로(가격·제목 key 는 같은 값이 있으면 React 가 항목을 섞음) |

## B'. 동네·지도 (4)

| # | 바뀐 것 |
|---|---|
| 19 | 동네 피드 "더 보기"(`GET /api/town/feed?before=&limit=`), 세션 캐시로 뒤로가기 복원 |
| 21 | 피드 필터 URL 동기화(`?kind=&sort=&mine=`) |
| 22 | 지도 첫 진입: 위치 권한이 **이미 허용된 경우에만** 현재 위치로(예전엔 매 진입마다 권한 요청) · URL 포커스 파라미터가 있으면 건너뜀 |
| 23 | 접힌 필터 요약 칩("매매 · 10억 이하 · 84㎡ 이상 · 3개 적용") |

## C. 알림·전문가·홈 (3)

| # | 바뀐 것 |
|---|---|
| 24 | 모두 읽음 뒤 헤더 벨 배지 즉시 갱신(`nz:notifications-read`) + 탭 복귀 시 재조회(30초 스로틀) |
| 26 | 전문가 카드 신뢰 한 줄("검증 완료 · 답변 N건 · 평균 응답 …") — 이미 있는 데이터만, 없으면 생략 |
| 27 | 홈 **내 관심 레일**(관심단지 변동 + 최근 본 단지) — 로그인 사용자에게만 클라이언트 마운트, 게스트 HTML 불변(LCP 영향 없음) |

## D. 운영·성능·SEO (3 + 2)

| # | 바뀐 것 |
|---|---|
| 28 | **pg_cron `billing-renewals` 해제**(마이그레이션 20260906040337) — vault 시크릿 부재로 48시간 55건 critical 을 만들던 2차 경로. 실제 갱신은 Vercel 크론(01:10·13:10 UTC, 200 확인)이 담당. 되살리기 SQL 은 마이그레이션 주석 |
| 28b | `sitemap-regions.xml` lastmod 를 거래 적재 시각과 합쳐 계산(예전엔 스냅샷 월초 → 07-01 로 굳어 SEO 프로브 critical) |
| 29a | `inspection_notes` 타임아웃 시 **마지막 정상본 폴백**(`lib/inspection/public-notes-cached.ts`, public_data_cache 24h) — /analysis·/notes·/complex/browse 에서 6시간 20건 나던 오류 |
| 29b | web-vitals v5 는 LCP 요소를 `target` 으로 준다 — 7일 299건 전부 null 이던 LCP 요소 기록 복구 + 하위 구간(ttfb/rld/erd) 기록 |
| 30 | 크롤러 404: `googleb17db51603958760.html`(GSC 인증 — **본인이 만든 토큰인지 확인**), `/.well-known/security.txt`+`/security.txt`(RFC 9116), `app-ads.txt`(ads.txt 와 동일 게시자), `/area/<지역>`→`/search?q=`, `/community/tag/*`→`/town/news`(접두 리다이렉트 + 게이트 검사 9번), 삭제된 비교 페이지 soft-404(`compare/[slug]/not-found.tsx`, 404 유지) |

## E. 코드 위생 (2) + 발견 수정 (1)

| # | 바뀐 것 |
|---|---|
| 31 | 억/만원 포맷터 → `lib/format/krw.ts`(6가지 모드) — 34곳 통일, 41개 패리티 테스트로 **출력 불변** 증명 |
| 32 | 상대시간 → `lib/format/relative-time.ts` — 11곳 통일, 경계값(59초·60분·24시간·7일…) 패리티 테스트 |
| 33 | **로그인 판정 버그** — 뉴스 댓글 채택·노트 소프트월·홈 출석 카드가 `document.cookie` 정규식으로 로그인 여부를 판정했는데 Auth.js 세션 쿠키는 httpOnly 라 항상 "비로그인" 이었다(채택 버튼 미노출·로그인 사용자에게도 벽·출석 카드 미렌더). 세션 API(`getSessionLite`) 로 교체 |

## DB
- `20260906040337_unschedule_pg_cron_billing_renewals.sql` — 적용 완료(cron.job 에서 제거 확인).
- `20260906042747_note_comments.sql` — 적용 완료(RLS on, 정책 0, GRANT 없음).

## 소유자 확인 항목
- `public/googleb17db51603958760.html` — 서치콘솔에서 **본인이** 만든 인증 토큰이면 유지, 아니면 삭제.
- apt-master 수집 9일째 0행(공공 API 키/응답), Supabase vault `cron_secret`(2차 경로 되살릴 때만), RESEND 키.
- market_region_price 스냅샷 period 가 202607 에서 멈춰 있음(지역 시세 ETL 확인 — 28b 에서 발견).

## 검증
- `npm run build` 전체 게이트 통과 — 단위검증 **292**(966: 195 → +97: 포맷터 패리티 41, 노트 폼 9, 노트 상세 10, 단지 10, 동네·지도 15, SEO 12), type-ramp 11=11, dead-controls·route-links·icon-names·contrast·import-hygiene·redirect-map(신설 검사 9) 통과, tsc·eslint 0.
- 번들 예산: / 471KB(495) · /map 347(375) · /analysis 477(490) · /analysis/ai 451(480) · /notes/new 458KB(470, 966 대비 +24KB — 업로드 진행·정렬·인라인 입력).
- CI 전용: migration-grants·secret-markers·source-views·param-canonical 통과. 링크 크롤 196/196.
- 로컬 실측(next start): `/security.txt`·`/.well-known/security.txt`·`/app-ads.txt`·GSC 파일 200 text/plain, `/area/강남구` → 301 `/search?q=강남구`, `/community/tag/*` → 301 `/town/news`, 삭제된 비교 페이지 404 + "이 비교는 지금 제공되지 않아요"(하이드레이션 후), `/api/inspection/notes?public=1&limit=5` · `/api/town/feed` 200, `/api/me/complex-records` 401(비로그인).
- Playwright(Pixel 5): 작성폼 방문일 입력·하단 저장 바(탭바 위 72px, 원 CTA 보이면 사라짐)·본문 textarea rows 4/resize/5000자 카운터 확인. 단지 페이지(14~18)는 컨테이너에 service role 이 없어 로컬에서 404 로 떨어져 **배포 후 라이브에서 확인 예정**.
