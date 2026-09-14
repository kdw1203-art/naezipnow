# 998 — 개편 8판: 데스크톱 좌측 내비 · 지역 카탈로그 새 행정구역 · 홈 미니맵 정적 우선

소유자 지시(2026-09-14): "잔여분 전부, 분할하지 말고". 991 계획에서 마지막까지 남아 있던 A5(데스크톱)와
996 이 미뤄 둔 지역 카탈로그, 995 가 보류한 홈 미니맵 LCP 를 한 판에 닫는다.

## 한 줄

**데스크톱은 1240px 안에 220px 좌측 내비 + 본문(헤더 드롭다운은 lg 부터 사라진다), 사이드바 폭은 340px 하나,
태블릿은 1열. `/region` 은 개편된 행정구역(인천 4구·화성 4구·세종·전남광주 별칭)을 알고, 부동산원 통계가
없어도 실거래로 그린다. 홈 미니맵은 데스크톱에서 손을 대기 전엔 실데이터 칩으로 답한다.**

## 바뀐 것

### 998-1 · 데스크톱 좌측 내비 (A5)
- `PageShell`(145화면)·홈: `lg+` 에서 `<main>` 이 `220px + 본문` 2열(`.nz-shell:has(> .nz-sidenav)`, CSS 그리드 —
  내비가 없는 경로는 1열 그대로). 내비는 헤더 아래 sticky, 5묶음(임장노트 · 지도 · AI 분석 · 동네 · 마이) 22행,
  현재 경로 `aria-current`. `/admin` `/login` `/signup` `/map` `/embed` `/welcome` `/notes/[id]/card` 에는 없다.
  클라이언트 코드 ~1.4KB(nav-data 는 헤더가 이미 싣는다).
- 헤더: `lg+` 드롭다운 제거(상단 4링크는 섹션 입구로 유지), `md`(태블릿)는 드롭다운 유지.
- 사이드바 폭 6종 → **340px 하나**: supply · auctions · analysis/timing · dev-deals/[id] · safety · notes/[id] ·
  complex/[id] · analysis/price. 태블릿 2열 시작을 `md` → `lg` 로: town/news/[id] · town/groups/[id] · dev-deals 목록 · support.
- 본문 폭이 1240 → ~995 로 줄어 홈 지역 시세 카드의 `xl:grid-cols-4` 를 2열로 고정(4칸이면 141px 씩이라 가격이 접혔다).
- 번들: `/analysis/ai/[tool]` 480 → **465KB** — 워크벤치가 `resultOrder` 하나 때문에 페르소나 본문 28KB(tool-persona)를
  끌고 오던 것을 `lib/ai/result-order.ts` 로 분리(type-only 연결).

### 998-2 · 지역 카탈로그 — 2026-07 행정구역
- 새 id: `incheon-jemulpo` 제물포구 · `incheon-yeongjong` 영종구 · `incheon-seohae` 서해구 · `incheon-geomdan` 검단구 ·
  `hwaseong-manse`/`hyohaeng`/`byeongjeom` (+ 기존 `hwaseong-dongtan` 을 "화성시 동탄구"로) · `sejong` 세종시.
  좌표는 대략적 중심(주석에 명시). `incheon-seo`/`incheon-jung` 은 `retired` + `successors` — 옛 페이지는 개편 전
  통계라는 안내와 후속 구 링크를 보인다.
- 별칭(정확 일치만): 광주 5구 ← "전남광주 X구"·"전남광주통합특별시 X구", 인천 신설구 ← "인천 X구"·"인천광역시 X구",
  화성 ← "화성 X구", 세종 ← "세종"·"세종특별자치시". 부동산원(R-ONE) `CLS_FULLNM` 해석이 "전남광주>광산구" ·
  "인천>검단구" · "경기>경부2권>화성시>동탄구" · "세종>세종시" 를 푼다. 옛 "인천>동구" 가 남동구에 붙던 오매칭 차단.
- `/region/{id}` 는 부동산원 스냅샷이 없어도 렌더(단지별 현황·최근 실거래·월별 거래량·전월세·평형대는 실거래 기반) —
  KPI 자리엔 "부동산원 통계는 아직 없어요", `noindex`(스냅샷이 생기면 저절로 index). 사이트맵 규칙은 그대로(스냅샷 있는 id 만).
- 실거래 이름 후보 규칙을 한 곳으로(`lib/market/store.ts` → region-name-candidates): 인천 외 단일 토큰 구를 전부 "서울 X구"로
  붙여 `/region/gwangju-gwangsan`·부산 구 페이지가 실거래를 못 찾던 것 수정.

### 998-3 · 홈 미니맵 — 데스크톱 정적 우선
- 데스크톱(pointer: fine)은 카드에 hover·클릭하기 전엔 네이버 SDK 를 싣지 않는다. 대신 같은 실데이터(지역 · 평균 시세 ·
  전월비) 칩을 그린다 — RUM 홈 LCP 의 큰 표본(타일 842×358, 1.0~2.8s)이 글자로 바뀐다. 모바일은 예전대로(보이면·한가할 때).

### 998-4 · 곁가지(게이트 전수 재측정에서 잡은 것)
- `/town/news` 키워드 칩 28px → 40px, 안내 링크 24px; `Bars` 차트 축 글자 10 → 11px(공급·시세·타이밍 화면 공통);
  `.tile-go` 카드 링크 24px; 온도·용어집·베스트·다이제스트·청약·인용 블록의 인라인 링크 `py-[5px]`(24px);
  온도 화면 마지막 카드의 `mb-8` 제거(본문 pb-16·푸터 pt-6 과 겹쳐 데스크톱 147px 빈 띠).

## 검증
- `npm run build` 전 게이트 · 단위 **652**(+7 region-catalog) · tsc · sidebar-grid · route-links · redirect-map · 번들 예산
- `check:void`(데스크톱, 새 2열) 22개 경로 ✓(`/redevelopment` 1건은 로컬에서 외부 지도가 막혀 생기는 OSM 폴백 빈칸 — 운영 무관) ·
  `check:void:mobile` · `check:mobile` ✓ · `check:final-release` PASS 40 · FAIL 0
- 스크린샷: 1280 데스크톱(홈·분석 허브) · 1024 태블릿 경계(공개 노트) — 내비 + 본문 정상

## 소유자 확인 사항
1. 데스크톱에서 좌측 내비가 보이고, 헤더의 4개 메뉴에 마우스를 올려도 드롭다운이 더는 안 뜨는 게 의도한 것(태블릿·모바일은 그대로).
2. 부동산원 8월 통계 발표 뒤 `/region/incheon-geomdan` 등에 "부동산원 통계는 아직 없어요"가 사라지는지 — 시리즈 이름이
   예상과 다르면 별칭 한 줄로 맞춘다.
3. 997 gap fill 은 배포 다음 ETL(06:00 UTC)부터.

## 남은 것
없음 — 991 계획(A1~A7 · B1~B3 · C1~C6)과 993 계획은 전부 반영됐다. 이후는 실측 기반 개선(트래픽·전환·수집 상태)만.
