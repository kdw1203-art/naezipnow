# 1061 — 네이버·구글 실적과 방문자를 관리 화면에 + 다이제스트 뉴스 링크·사진 (2026-10-12)

소유자 요청 둘: "네이버랑 구글이랑 실적이나 방문자 등을 admin 에도 반영해서 보여지도록 해줘" ·
"다이제스트에서 뉴스링크나 이미지도 보이게 해줘".

## A. 관리 › 검색 유입 (`/admin/search`) — 새 화면

세 가지 자를 **각각 이름 붙여** 한 화면에 둔다(섞으면 숫자가 서로 안 맞는 이유를 영영 모른다 — 1060 점검의 결론).

| 자리 | 재는 것 | 어디서 | 상태 구분 |
| --- | --- | --- | --- |
| 우리 측정 | 익명 하루 수(`page_view_daily_agg`)의 **첫 화면** 리퍼러 → 네이버 검색 · 구글 검색 · 빙 · 다음 · 그 밖 검색 · AI 검색 · 다른 사이트 · 직접. 최근 28일 + 앞 28일 비교 · 일별 쌓은 막대(네이버/구글/그 밖) · 엔진별 많이 착지한 화면 8 | `lib/seo/search-engines.ts`(순수) · `lib/admin/search-landings.ts` | 조회 실패는 "불러오기 실패"로(0 으로 꾸미지 않음) |
| 구글 서치콘솔 | Search Analytics API — 28일 클릭·노출·CTR·평균 순위(앞 28일 비교) · 일별 클릭 막대 · 상위 검색어 15 · 상위 페이지 15. 끝 날짜는 today-2(확정 지연) · `dataState=all` | `lib/seo/gsc-search-analytics.ts` · `lib/seo/gsc-performance-shape.ts`(순수) · `lib/admin/gsc-performance.ts`(1시간 캐시) | 키 없음 → 연결 순서 4단계 안내 · 실패 → 사유 · 정상 → 표 |
| 네이버 서치어드바이저 | **API 가 없다.** 리포트 "최근 총 클릭·총 노출"과 사이트 진단 "색인된 페이지"를 손으로 적는 기록(주 1회) + 리포트 링크 | `lib/seo/search-report-rules.ts`(순수 검증) · `lib/admin/search-reports.ts` · `app/api/admin/search-report`(관리자만 GET/POST) · `SearchReportForm.tsx` | 기록 없음 / 조회 실패 / 저장 실패 각각 다른 문장 |

손 기록의 저장 자리는 `public.kv_store_99a854cb`(key·value jsonb — 옛 시제품이 남긴 범용 표 · service_role 만 · 지금 코드가 읽는 곳 없음)에
`search-report:<engine>:<YYYY-MM-DD>` 키로. **DB 변경 없음**(1057 의 교훈 — 마이그레이션 없이). 같은 날짜는 덮어씀 · 지우기 없음.

서비스 계정은 색인률(N25 · `GSC_SERVICE_ACCOUNT_*`)과 같은 것을 쓴다 — 서치콘솔 속성에 그 이메일을 사용자로 넣고 Vercel 에 환경변수 3개면
`/admin/search` 와 `/admin/seo` 둘 다 켜진다. 키 값은 채팅에 붙이지 않는다.

- 관리 메뉴 "매일" 묶음에 **검색 유입** 추가(트래픽 다음). `/admin/traffic` "유입 출처" 제목에 "동의 방문 표본" 라벨 + 검색 유입 링크 —
  1060 에서 소유자가 짚은 "서치어드바이저와 admin 이 다르다"의 원인(동의 표본 vs 전체)이 화면에 적혀 있게.

## B. 주간 다이제스트 — 뉴스 링크·사진

- `DigestNewsItem` 에 `href`(뉴스 상세 정식 경로 `/town/news/<slug>-<uuid>`) · `imageUrl`(원문 og:image — 뉴스 상세와 같은 `newsImageUrl`) ·
  `sourceUrl`(원문 주소) 추가. `/api/digest` JSON 에도 그대로 실린다(추가 필드).
- **메일**(`weeklyDigestEmail`): 제목이 우리 뉴스 상세로 가는 링크(절대 주소) · 64px 썸네일(있을 때만) · "원문 · 출처" 작은 링크. 보내기 전
  `dropUnreachableImages`(GET 4초 · 2xx + image/*)로 못 받는 사진은 뺀다 — 메일은 깨진 사진을 숨길 수 없다(캡처에서 한 언론사 호스트가 응답 없음을
  실측). 본문 텍스트판에도 링크를 적는다.
- **/digest 화면**: 56px 썸네일(`DigestThumb` — 못 받으면 상자째 사라짐 · NewsHero 와 같은 규칙) + 제목(정식 경로) + "원문 ›"(새 창 · nofollow).
- 낱말: 메일 "주요 지역 시세" → "시장 요약 · 주요 지역"(값은 부동산원 지수·실거래 평균이지 호가가 아니다 — /digest 화면 제목과 같은 낱말) ·
  부제 "국토교통부 실거래 · 한국부동산원 지수 기준 · 매물 호가가 아닙니다". 크론·/digest·뉴스룸의 미리보기 문장도 "시장 요약 N곳".

## 시험·검증

- `tests/unit/review-1061.test.ts` 6건(T1~T5): 리퍼러 분류 · 28일 접기 · 서치콘솔 응답 파싱·합계·기간 · 손 기록 검증·키 · 메뉴/API 가드/화면 문장 ·
  다이제스트 href·사진·메일 링크·escape·"시세" 제거. 전체 단위 2,272 통과 · 타입 램프 통과(11·22·9px → 12·24·10px) · 빌드 EXIT 0.
- 캡처: 메일 전/후(운영 `/api/digest` 실제 뉴스 5건 + 뉴스 상세의 og:image·원문 주소) · /digest 뉴스 카드 전(운영)/후(같은 데이터) ·
  `/admin/search`(실측 착지 10.11~12 · 서치콘솔 미연결 상태 그대로 · 서치어드바이저 손 기록은 소유자가 보낸 화면 숫자 2.5백·2.8만·2.4천을 적은 모습).

## 소유자가 할 일

1. 서치콘솔 실적을 켜려면: Google Cloud › Search Console API 사용 설정 → 서비스 계정 + JSON 키 → 서치콘솔 설정 › 사용자 및 권한에
   `client_email` 추가 → Vercel `GSC_SERVICE_ACCOUNT_EMAIL` · `GSC_SERVICE_ACCOUNT_PRIVATE_KEY` · `GSC_SITE_URL=https://naezipnow.com/` → 재배포.
2. 서치어드바이저 숫자는 주 1회 `/admin/search` 아래 폼에 적는다(기준일 = 리포트의 "최근 업데이트" 날짜).

## 남긴 것

- 서치어드바이저가 API 를 열면 손 기록을 자동으로 바꾼다(저장 모양은 그대로 쓸 수 있게 engine 필드를 둠).
- 손 기록이 수백 건을 넘으면 kv 표 대신 전용 표(마이그레이션)로.
- 1060 에서 적은 soft 404 12경로 · 뉴스 H1 · 썸네일 alt · 홈 title · 단지 통칭은 다음 묶음.
