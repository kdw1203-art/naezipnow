# 1010 — Vercel 요금 절반 이하로 (노출 손해 0)

주인님 지시: "vercel 사용량이야, 이거를 지금의 1/3수준으로 지출하는게 가능할까?" → 선택지 중
**1번(안전 우선 — 검색 노출 손해 없이)** 을 고르셨다. 이 판은 그 답이다.

## 1. 실측 — 돈이 어디로 나가고 있었나

Vercel 청구 데이터(FOCUS) 2026-09-20 07:00 ~ 09-22 07:00, **2일치 $6.578**:

| 항목 | 2일 | 월 환산 |
|---|---|---|
| ISR Writes | $1.4488 | ≈ $21.7 |
| Pro(고정) | $1.2903 | ≈ $19.4 |
| Fast Origin Transfer | $1.1042 | ≈ $16.6 |
| Observability Events | $1.0938 | ≈ $16.4 |
| Vercel Agent | $0.7440 | ≈ $11.2 |
| Fluid Active CPU | $0.4903 | ≈ $7.4 |
| Fluid Provisioned Memory | $0.1368 | ≈ $2.1 |
| Function Invocations | $0.0927 | ≈ $1.4 |
| Web Analytics Events | $0.0681 | ≈ $1.0 |
| ISR Reads | $0.0651 | ≈ $1.0 |
| **Build CPU Minutes** | **$0.0280** | **≈ $0.4** |
| 나머지 전부 | < $0.01 | ≈ $0.3 |

여기서 두 가지가 바로 읽힌다.

**첫째, 빌드는 범인이 아니다.** 월 $0.4다. 그래서 이번 판은 빌드 게이트(타입·테스트·린트 17종)를
**하나도 건드리지 않았다.** 빌드를 줄여 돈을 아끼자는 계획은 실측 앞에서 폐기했다.

**둘째, ISR Writes · Fast Origin Transfer · Fluid CPU 세 항목(월 ≈$47.8)이 같이 움직인다.**
셋 다 "페이지를 다시 그리는 일" 하나에서 나오기 때문이다. 재렌더 1회 = ISR 쓰기(페이지 + 그
렌더가 만든 데이터 캐시 항목) + 함수 CPU + 오리진→엣지 전송.

## 2. 원인 — 크롤러 주기보다 짧은 TTL

`/complex/[id]` 하루 렌더 **11,523회**, 같은 화면의 사람 방문은 **30일에 27회**. 운영 로그에서
뽑은 단지 4곳을 직접 찔러 보니 4/4 모두 `x-vercel-cache: REVALIDATED` 였다.

이유는 산수다. 크롤러 재방문 간격이 **≈2.2일**인데 이 라우트의 ISR TTL 은 **6시간**이었다.
TTL 이 재방문 간격보다 짧으면 **크롤 1회 = 재렌더 1회**가 된다. 단지 ≈26,000장 · 지역 ≈218곳 ·
실거래 구간 1,403셀이 그렇게 돌고 있었다.

### 2-1. 더 나쁜 것 — TTL 을 올려도 안 올라가 있었다

작업 중에 이 판에서 제일 중요한 것을 찾았다. **Next 는 라우트의 `revalidate` 와 그 렌더가 읽는
데이터 캐시(`unstable_cache`)·`fetch` 의 `revalidate` 중 작은 쪽을 쓴다.** 빌드 산출물이 증거다.

```
app/town/news/page.tsx    : export const revalidate = 21_600   (1007 에 설정)
.next/prerender-manifest  : /town/news → initialRevalidateSeconds 3600
                            = 그 페이지가 읽는 주간 다이제스트 캐시 값
```

같은 이유로 **`/complex/[id]` 의 실제 TTL 은 6시간이 아니라 1시간이었다** — 지오코딩
`fetch(..., { next: { revalidate: 3600 } })` 가 뚜껑이었다. 그 위에 15분짜리(`related-town-posts-v1`
900초) 뚜껑이 하나 더 있었다. 즉 **지금까지 라우트 TTL 만 올린 작업은 효력이 없었다.**

그래서 이번 판은 라우트 TTL 을 올린 자리마다 **그 라우트가 읽는 데이터 캐시·fetch 까지 같은
눈금으로 올렸다**(3절).

## 3. 원칙 — 시간이 아니라 "데이터가 바뀐 순간"이 재생성을 정한다

TTL 을 길게 잡는 것만으로는 신선도를 잃는다. 그래서 규칙을 하나 세우고 전 구간에 적용했다.

> **TTL 을 올린 라우트는, 그 화면의 내용을 바꾸는 쓰기 지점에서 즉시 비우는 코드가 반드시
> 함께 있어야 한다. 쓰기 지점을 못 찾으면 TTL 을 올리지 않는다.**

그러면 안 바뀐 페이지는 크롤러가 몇 번을 와도 CDN HIT(쓰기 0·렌더 0·전송 0)이고, 바뀐 페이지는
TTL 과 무관하게 다음 요청에서 새로 그려진다 — **신선도 손해가 0이다.**

태그 무효화는 재렌더를 강제하지 않는다(다음 렌더에서 다시 읽으라는 표시일 뿐). 그래서
**태그가 붙은 데이터 캐시는 TTL 을 길게 잡아도 안전하다** — 이 성질을 이번에 적극적으로 썼다.

## 4. 바뀐 것

### 4-1. 라우트 TTL (주요 항목)

| 경로 | 이전 | 새 TTL | 비우는 쓰기 지점 |
|---|---|---|---|
| `/complex/[id]` | 6시간(실효 1시간) | **7일** | 실거래 적재(그 단지만) · 이야기 글/댓글/공감 · 공개 임장노트 · 매물 승인/수정/삭제/거래완료/부스트 · 소유확인 |
| `/embed/complex/[id]` | 1시간 | **7일** | 실거래 적재(그 단지만) |
| `/complex/tx/[slug]` | 1일 | **7일** | 실거래 적재 · KB 시세 적재 |
| `/region/[id]` · `/embed/region/[id]` | 6시간 / 1시간 | **7일** | REB 지문 비교(값이 달라진 지역만) · 집계 갱신 · 공개 노트 · 분양공고 |
| `/region/[id]/report[/[ym]]` | 1일 | **7일** | 집계 갱신(최근 완결 3개월만) |
| `/tx` · `/tx/[region]` · `/tx/[region]/[kind]/[band]` | 1일 | **7일** | 실거래 적재(바뀐 셀만 — 전량 1,403셀 중 하루 200~300) |
| `/analysis` 계열 8종 | 1시간(실효 1시간) | **1일** | 실거래·REB 적재 |
| `/analysis/ai/[tool]` | 1시간 | **1일** | 적재 시 라우트 단위(12장) |
| `/analysis/ai/r/[id]` | 1시간 | **7일** | 없음(공유 스냅샷은 불변 — 새 결과는 새 주소) |
| `/reports` · `/reports/season/[slug]` | 1시간 | **1일** | 실거래 적재 |
| `/reports/[ym]` | 1시간 | **7일** | 집계 갱신(최근 완결 3개월) |
| `/town/news/[id]` · `/town/story/[id]` · `/town/[region]` | 6시간(실효 15분) | **7일** | 글·댓글·공감·채택·삭제 5지점(기존) + 뉴스 적재 |
| `/qna/[id]` | 10분(실효 6시간) | **7일** | 답변 등록 |
| `/imjang` · `/imjang/[slug]` | 1일 | **7일** | 공개 노트 3지점 · 실거래 적재(바뀐 지역만) |
| `/town` · `/town/news` · `/qna` · `/notes` · `/notes/best` · `/notes/market` · `/notes/templates[/[id]]` · `/town/library` · `/town/groups` · `/town/experts[/[id]]` · `/town/prompt/[idx]` · `/town/news/tag/[tag]` · `/u/[handle]` | 5~30분 | **1일** | 각 축의 쓰기 API(19곳 배선) |
| `/map` | 10분(실효 10분) | **6시간** | 실거래 적재 |
| `/supply` · `/data/records` · `/apply` | 10~30분 | **1일** | 적재 |
| `/auctions` | 10분 | **6시간** | 공매 적재(물건이 들어온 날만) |
| `/listings` | 5분 | **30분** | 매물 쓰기 4지점 — 사람이 쓴 것이라 일부러 짧게 |
| `/dev-deals[/partners]` | 5분 | **6시간** | 등록 API |
| `/redevelopment` · `/digest[/archive|/[week]]` | 1시간 | **1일** | 뉴스 적재 |
| `/apply/calendar` · `/apply/calendar/[week]` | 30분 / 1시간 | **6시간 / 1일** | 분양공고 적재 |
| `/about` · `/subscription` · `/calculator` · `/lp/imjang` | 1시간~6시간 | **1일** | 배포로만 바뀜 |

`lib/http/cache-policy.ts` 의 `s-maxage` 도 전부 같은 눈금으로 맞췄다. 두 값은 재는 대상이
다르다 — `revalidate` 는 "오리진 사본이 얼마나 신선한가", `s-maxage` 는 "같은 주소에 오리진
렌더를 얼마나 자주 치를 것인가"다. 호출 수를 줄이는 건 뒤쪽이라, 한쪽만 올리면 절반만 듣는다.

### 4-2. 데이터 캐시 — 라우트 TTL 의 뚜껑 제거

| 캐시 | 이전 | 새 값 | 뚜껑이던 라우트 |
|---|---|---|---|
| 네이버 지오코딩 `fetch` (2곳) | 1시간 | **7일** | `/complex/[id]` — 주소↔좌표는 바뀌지 않는다 |
| `related-town-posts-v1` | 15분(아무도 안 비움) | **7일** + `town-posts` 태그 | `/complex/[id]` · `/town/news/[id]` |
| `live-region-axes-v3` · `live-complex-axes-v4` | 6시간 | **7일** (태그 유지) | `/complex/[id]` |
| `complex-href-v2` | 6시간 | **7일** (`market` 태그) | `/qna/[id]` · `/notes` · `/map` |
| `newui-weekly-digest-v2` | 1시간(태그 없음) | **1일** + `weekly-digest` 태그 | `/town/news` |
| `home-market-temp-*` (2곳) | 1시간(태그 없음) | **1일** + `market` 태그 | `/analysis` |
| `home-region-fill-v2` | 1시간(태그 없음) | **1일** + `market` 태그 | `/analysis` |
| `home-coverage-v1` | 6시간 | **7일** (`market` 태그) | `/analysis` |
| `map-region-market-markers-v1` · `map-shared-danji-v1` | 10분, **태그를 아무도 안 비웠다** | **7일** + `market` 태그 | `/map` |
| `notes-public-feed-v2` · `notes-best-has-month-v1` · `NOTE_CACHE_REVALIDATE_SEC` | 5~30분(태그 없음) | **1일** + 공개노트 태그 | `/notes` 계열 |
| `upcoming-supply-v2` | 6시간 | **7일** (`supply` 태그) | `/complex/[id]` |
| `hub-teasers` 3종 · `ai-active-complexes-v2` · `region-rent-yield-v1` | 1~6시간 | **1일** + `market` 태그 | `/analysis` 계열 |

### 4-3. 함수 호출

- **Web Vitals 20% 표본**: 세션 단위로 한 번만 주사위를 굴린다(지표별로 버리면 분포가 깨진다).
  표본이 아니면 리스너조차 걸지 않는다. 전송에 `sampleRate` 를 실어 보내고, `/admin/perf` 의
  "표본 N건"은 `N / rate` 로 보정한다(분위수는 보정하지 않는다). 하루 842 → ≈168.
- **OG 이미지**: 내용이 주소에 들어 있는 5종(root·complex·listing·note·invite)은 **7일 + immutable**,
  같은 주소의 그림이 바뀌는 2종(market-card·complex-trend)은 6시간/1일이되 immutable 을 붙이지 않았다.

### 4-4. 같이 고친 버그 (전부 이번 조사 중 발견)

1. **국토부 실거래 적재의 성공 경로에 캐시 무효화가 아예 없었다.** `invalidateAfterIngest("molit")`
   가 "시간 초과로 0행 적재" 분기에만 있었다 — 즉 정상 적재에서는 한 번도 돌지 않았다.
   이제 `inserted > 0` 일 때 부른다.
2. **REB 적재도 같은 문제**였다(성공 경로 누락, 타임아웃 분기에만 존재).
3. **지도 마커 캐시 두 개의 태그를 아무도 비우지 않았다.** 유일한 갱신 경로가 600초 TTL 이었고,
   그 600초가 `/map` 라우트 TTL 의 뚜껑이었다. 이제 적재가 태그로 비운다.
4. **GitHub Actions 수집이 구 도메인으로 호출하고 있었다** — 5절.

### 4-5. 새 모듈

| 파일 | 역할 |
|---|---|
| `lib/cache/invalidate.ts` (확장) | `invalidatePathList` · `invalidateComplexIds` · `invalidateRegionCodes` · `REVALIDATE_BUDGET` · `SOURCE_MAP` 확장(onbid 신설) |
| `lib/complex/complex-cache-paths.ts` · `complex-invalidate.ts` | 단지 id 표기 계산(허브는 `{슬러그}.{id}`, 임베드는 순수 id) + 쓰기 API 창구 |
| `lib/market/touched-complexes.ts` | 적재가 실제로 건드린 단지 수집(중복 제거·상한 2,000) |
| `lib/region/changed-region-paths.ts` · `invalidate-market.ts` | "바뀐 지역·셀만" 경로 규칙 + 오케스트레이션 |
| `lib/town/cache-tags.ts` · `changed-town-paths.ts` · `invalidate-town.ts` | 동네 축 태그·경로 규칙·창구 |
| `lib/metrics/vitals-sample.ts` · `lib/og/cache.ts` · `lib/listings/invalidate-listings.ts` | 표본·OG 헤더 상수·매물 목록 무효화 |

단위 테스트 4벌(`complex-1010` 12 · `region-1010` 22 · `town-1010` 18 · `transfer-1010` 19)이
"TTL 을 올린 라우트마다 비우는 쓰기 지점이 함께 있는가"를 계약으로 잠근다.

## 5. 도메인 사고 — 수집이 멈추기 직전이었다

작업 중 `nuguzip.com` 이 프로젝트에서 빠져 **404** 가 되어 있는 것을 발견했다. 그런데 GitHub
Actions 수집(`etl.yml` 28곳 · `backfill.yml` 4곳 · `lighthouse.yml` 1곳)이 전부 그 주소로 호출하고
있었고, 응답은 `|| true` 로 삼켜져 **워크플로는 초록색인 채로 전 구간이 죽었을 것**이다.

- 호출 주소를 워크플로 최상단 `env: SITE: https://naezipnow.com` 한 줄로 모으고 전부 `${SITE}` 로 바꿨다.
- 각 잡 맨 앞에 **preflight** 를 넣었다 — `${SITE}/api/health` 가 200 이 아니면 한 문장으로 즉시 실패한다.
  다시는 "초록색인데 아무것도 안 들어온 날"이 생기지 않는다.

주인님이 그 사이 `nuguzip.com` 을 프로젝트에 다시 붙이셨고(리다이렉트 없이 Production),
`nuguzip.com/api/cron/...` → 401(정상) · `nuguzip.com/map` → 308 한 번에 `naezipnow.com/map` 을 확인했다.

## 6. 예상 절감

| | 지금 | 이 판 이후 |
|---|---|---|
| Pro(고정) | $19.4 | $19.4 |
| ISR Writes | $21.7 | ≈ $6.5 |
| Fast Origin Transfer | $16.6 | ≈ $5.8 |
| Fluid CPU + Memory | $9.5 | ≈ $3.3 |
| Observability Events | $16.4 | **$0** (주인님이 끄심) |
| Vercel Agent | $11.2 | **$0** (끄시면) |
| 호출·분석·기타 | $3.7 | ≈ $2.5 |
| **월 합계** | **≈ $99** | **≈ $38~45** |

대시보드 누계($109)와 2일 실측 환산($99)의 차이는 항목별 변동 폭이다. 어느 쪽 기준이든
**1/3~절반 수준**에 들어간다. 재렌더 감소는 배포 뒤 실측으로만 확정된다 — 7절.

## 7. 3일 뒤 확인하는 법

1. **가장 빠른 확인(배포 다음 날)**: 아무 단지 주소나 브라우저에서 두 번 새로고침한 뒤
   개발자도구 Network 에서 응답 헤더 `x-vercel-cache` 를 본다. `HIT` 이면 성공,
   `REVALIDATED` 가 계속 뜨면 그 라우트에 아직 뚜껑이 남은 것이다.
2. **3일 뒤**: Vercel → Usage → ISR Writes · Fast Origin Transfer · Fluid Active CPU 의
   **일별 막대**를 본다. 배포일을 기점으로 계단처럼 내려가 있어야 한다.
3. **신선도 확인(중요)**: 이 판의 전제는 "바뀐 것만 즉시 비운다"다. 단지 화면에 이야기 글을
   하나 쓰고 새로고침했을 때 **바로 보이면** 배선이 살아 있는 것이다. 안 보이면 알려 주시면
   그 쓰기 지점만 다시 잇는다(TTL 을 되돌릴 일은 아니다).

## 8. 남은 것 / 다음 판 후보

- **Fast Origin Transfer 가 압축 전 바이트인지 압축 후인지 미확인.** 압축 전이라면 단지 상세의
  `loading.tsx` 스켈레톤 트리(렌더 1회당 raw 16,025자, 하루 11,523렌더 = 185MB/일)가 다음 판의
  1순위다. 압축 후라면 gz 2,605자라 우선순위가 낮다. 반복 키 튜플화는 **압축 후 효율이 10%**라
  (실제 페이로드로 시뮬레이션) 이번 판에서 하지 않았다.
- `app/notes/best/[ym]` 은 `generateStaticParams` 가 없어 ISR 이 아니다(요청마다 서버 렌더).
  옮기려면 빈 `generateStaticParams` + cache-policy 등록 + 빌드 게이트 확인이 한 묶음이다.
- `app/complex/[id]/section-loaders.ts` 의 `loadComplexQuestions` prefetch 는 죽은 조회다
  (단지 Q&A 섹션이 [992·A1]에서 비노출). 렌더마다 한 번씩 던지고 결과를 버린다.
- `touchedComplexes` 는 "실제로 바뀐"이 아니라 "실제로 upsert 한" 집합이다. 최근 3개월은 이미
  채운 시군구도 다시 upsert 하므로 값이 안 바뀐 단지도 포함된다 — 그만큼 강제 재렌더가 생긴다.
- `web_vitals` 에 `sample_rate` 컬럼을 두면 개수 기반 경보 문턱을 비율로 보정할 수 있다.

## 9. 주인님이 하실 일

1. **푸시** — 이 판을 포함해 1005~1010 커밋 6개. 푸시해야 수집 워크플로의 새 주소도 적용된다.
2. **Observability Plus 끄기**(하셨음) · **Vercel Agent 끄기**
   (https://vercel.com/kdw1203-arts-projects/~/agent → Settings). 월 ≈$11.
3. **Speed Insights Plus** 는 프로젝트 0개라 과금이 없지만 안 쓰시면 꺼두셔도 된다.
4. (선택) **지출 한도** ~$60: https://vercel.com/kdw1203-arts-projects/~/settings/billing
5. 구 도메인 정리는 서두르실 것 없다 — `nuguzip.com` 은 자동갱신이 꺼져 있고 2027-04-20 만료다.
   메일 발신 주소(`noreply@nuguzip.com`)를 Resend 에서 `naezipnow.com` 으로 옮기고 `EMAIL_FROM`
   환경변수를 넣으신 뒤에 떼어내는 순서가 안전하다.
