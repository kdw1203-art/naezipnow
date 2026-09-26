# 1006 — 지도 단지 자료 확보 · 동네이야기/뉴스 분리 · 설정·마이·임장노트 · AI 검색 가시성

소유자 지시(2026-09-20): "1005를 포함하여, 지도에서 단지별 자료, 내용 등의 확보까지 추가로 진행해주고, 동네이야기와 뉴스를
확실하게 구분해서 디자인과 기능을 만들어주고 화면에도 구분해서 보여지도록 해줘, 추가로 설정 및 마이페이지, 임장노트에
대한 추가적인 개선까지 진행해줘" + (에이전시 문구를 붙이며) "SEO, AI SEO, 웹사이트 최적화, 유료 광고, 리드 생성 … 추가로
도입할 수 있는 부분에 대해 추가해줘". 이 판은 1005(ca6c7d7c) 위에 얹힌다 — zip 은 origin/main(b2f02fce) 기준이라 1005 를 포함한다.

## A. 지도 — 단지별 자료 확보(DB 적용 완료 · 운영 반영됨)

**실측(2026-09-20)**: 실거래 단지 36,714 중 K-apt 대장(세대수·주차·시공사·난방·도로명)과 연결된 것이 12,172(33%)뿐이었다.
리센츠·잠실엘스·파크리오·헬리오시티처럼 대장에 같은 필지로 있는 단지도 비어 있었다. 원인은 971 연결 규칙의 시군구 판정 —
"대장 주소 경로가 실거래 주소 경로로 끝나는가"를 봤는데 실거래 주소가 적재 시기마다 `서울 송파구 …`/`안양시 만안구 …`/`도봉구 …`
로 달라 앞 두 꼴은 전부 거부됐다(`서울송파구` ⊄ `서울특별시송파구`).

- 마이그레이션 `20260920030000_1006_complex_master_link_by_lawd_code`(MCP 적용 + 파일 미러): 시군구를 **5자리 법정동코드 등치**
  (실거래 `lawd_region_map` ↔ 대장 `lawd_cd`)로 맞추고, 번지가 달라도 같은 코드·같은 동 안에서 이름 열쇠가 한쪽을 품는 대장 후보가
  **정확히 하나**일 때만 잇는 3단계를 더했다(헬리오시티: 실거래 가락동 913 vs 대장 479). 세대수가 갈리면 비우고 스펙은 후보 1개일 때만 —
  971·2026-08-10 원칙 그대로. 의존 사슬(complex_master_link → complex_spec_resolved → complex_tx_stats 뷰·map_facet_source)을 한
  트랜잭션에서 같은 이름·컬럼·인덱스·권한(ACL 실측 복원, 새 GRANT 없음)으로 다시 세웠다.
- `20260920031000`: 같은 필지에 단지가 여럿(창원 성원 1~5단지)이라 세대수가 갈린 경우 이름 매칭으로 채우지 않는다(17단지 비움 —
  "성원" 에 다른 성원 410세대가 붙어 있었다).
- **결과**: 대장 연결 12,172 → **16,854**(+38%), 세대수 아는 단지 17,253 → **19,568(53%)**, 주차·시공사·난방·도로명 스펙 12,047 → **16,701**.
  검증: 리센츠 5,563 · 잠실엘스 5,678 · 파크리오 6,864 · 헬리오시티 9,510 · 의정부 성호 416(예전 오답 사례 유지) — 운영 단지 허브에서 확인.
  남은 47% 는 대부분 K-apt 비의무관리(소규모)라 대장 자체가 없다 — 화면은 이를 "대장 미연결"로 **정직하게** 말한다.

**지도 패널(`app/map/ComplexInfoPanel.tsx`, `GET /api/complex/[id]/detail`)** — 전월세 실거래가 전체의 62% 인데 패널에 없었다.
- 응답 확장: `summaryLine`(있는 숫자만 " · "로 이은 한 줄 — "2018년 준공 · 9,510세대 · 최근 12개월 매매 134건, 60~85㎡ 중앙 30.9억 ·
  전세 중앙 12.1억 · 전세가율 39.2%(6개월)"), `rent`(12개월 전세·월세 건수·중앙값·최근 달), `notes`(공개 임장노트 수 + 최신 1건·판단),
  `facts`(자료 완성도 — 있음/없음/**없는 이유**: master_unlinked·master_empty·no_trade_12m·no_rent_24m·no_notes·fetch_failed; 단지 전세가율은
  최근 6개월 전세·매매 중앙값 각 표본 ≥3 일 때만, 면적 미가중 명기). 순수 모듈 `lib/complex/complex-facts.ts`(11 테스트) +
  `complex-trade-window.ts`·`complex-notes-brief.ts`·`area-band-label.ts`. kapt.* id 로 열려도 canonical_id 로 실거래를 찾는다(노트→지도 핸드오프 결함).
- 화면 순서: 머리글+요약 → 핵심 4칸(매매 중앙·12개월 / 전세 중앙 / 세대수 / 준공) → 추이 → 면적대 → **전월세** → 스펙(값 있는 줄만, 없는 항목은
  이유 한 줄) → **임장노트**(n건 + 최신 1건 + "이 단지 임장노트 쓰기") → 지역 대비 → 인근. "—" 나열·"시세" 표현 제거. 세대수 슬라이더 안내는
  화면 안 단지의 실제 비율로. 면적 단위 설정(㎡/평)을 쿠키로 반영(클라이언트만). 월 계산은 KST.

## B. 동네이야기 vs 뉴스 — 확실한 분리

**실측**: `board_posts` 1,019행 **전부 자동수집 뉴스**, 사람 글(`posts`) 0건, 공개 노트 34건. 그런데 코드는 이웃 글 상세를 뉴스 라우트
`/town/news/[id]` 로 열고, `/town/news` 는 `/town` 과 같은 네이비 히어로·같은 카테고리 줄이라 눈으로 구분이 안 됐다(썸네일 없는 기사도 빈 이미지 상자).

- **정보 구조**: `/town` = 사람의 기록(이웃 글 + 임장노트; 히어로 "동네이야기 · 사람의 기록", 이야기 쓰기 CTA, 통계 "이웃 글 n · 사람 노트 n · Lab 데이터 카드 n"),
  `/town/news` = **뉴스룸**(한지 면 마스트헤드 + 날짜줄, 분류 밑줄 탭(부동산·신탁·정비사업·경제·사회·정보/소식), **행 목록**(분류·출처·발행시각·지역·제목·
  요약·원문↗), 이미지는 있을 때만, 글쓰기 CTA 없음, 첫 장 40행 + `GET /api/town/news` 더 보기). `/town` 에는 "오늘의 뉴스" 스트립(다른 재질)만.
- **새 라우트 `/town/story/[id]`**(이웃 글 전용: 작성자·동네·본문·사진·공감·댓글). `/town/news/[id]` 는 뉴스 전용 — 사람 글 id 가 오면 `/town/story/` 로
  영구 이동. 판정은 한 함수(`isStoryPost`/`isNewsPost`, `lib/town/story.ts`·`news-list.ts`)로 피드·동네 홈·상세·사이트맵이 같은 규칙(link_only 제외).
  사이트맵 `story` 유형(0건 = 사실, optional)·CDN 캐시 규칙·댓글/공감 API revalidatePath 배선.
- 뉴스 상세에 **NewsArticle JSON-LD**(headline·datePublished·dateModified·publisher @id·isBasedOn/citation 원문·isAccessibleForFree).
- 디자인 규칙의 단일 출처: `app/globals.css` 끝 `[1006]` 블록 `.story-*`(사람·따뜻한 카드) / `.news-*`·`.newsroom-masthead`(뉴스룸 행) — 토큰만, 다크 자동.
- GNB 동네 하위 순서 "동네이야기 · 뉴스 · 청약 · 정비사업". 이야기 흐름(/town/write → POST → 피드 이야기 탭 → /town/story/[id] → 댓글)을 로컬 파일 백엔드로 끝까지 실측.

## C. 설정·마이페이지

- **설정 새 탭 "표시·기록"**(`app/my/settings/RecordPrefsTab.tsx`): 면적 단위 ㎡/평(쿠키 `nz_area_unit` 거울 — 지도 패널·노트 작성기·상세가 읽는다),
  임장노트 기본 공개 범위(기본 **비공개**), 퀵 기록으로 시작, 기본 투자자 역할. 저장 `PATCH /api/me/preferences`(`user_preferences.ui_prefs` jsonb,
  마이그레이션 `20260920032000`; 스키마 `lib/prefs/ui-prefs.ts` 한 곳, 틀린 값은 400, 다른 칸은 건드리지 않는 update-then-insert).
  주간 다이제스트는 알림 탭의 기존 토글로 안내(발송 경로가 그쪽뿐 — 죽은 토글을 만들지 않았다).
- 계정 탭: 연결된 로그인 수단(근거 있는 것만 표시 — 구글·카카오는 연결 기록이 있거나 지금 그 수단일 때만), 가입일·동의 갱신일(`GET /api/me/account`).
- **마이 재구성**(`app/my/page.tsx` 874→332줄 로더 전용 + `MyHubView.tsx`): 활동 요약 5칸(노트·관심 단지·저장 노트·AI 분석·포인트) → 다음 할 일 1개 →
  2열(최근 본 단지 레일 · 내 임장노트 · 관심 한 카드 세 줄 · 구독 · 포인트(적립·교환만) · 더 보기). 로더 12개가 실패/0건/있음을 구분해 "지금 불러오지 못했어요"와
  "없어요"를 갈라 말한다. 빈 상태 그림은 한 곳만. 세로 길이 2,738 → 약 1,960px(1280).

## D. 임장노트(1005 후속)

- 내 노트 목록: 판단·지역·기간(방문일) 필터 + 최신/방문일/점수 정렬 + AI 정리 배지(정리됨/규칙/수정 뒤/없음 — 내용 해시 대조). 칩은 실제로 있는 값만.
- 작성기: 설정 기본값(공개 범위·퀵모드·투자자 역할)을 **설정을 저장한 사용자에 한해** 적용, 초안 복원이 이긴다. 퀵모드 한 화면에도 공개/비공개 한 줄(40px).
  면적 단위 반영(현장 브리핑 "평당", 상세 판단 카드 "18~26평").
- 상세: 사진 라이트박스를 분리(`next/dynamic`) + 포커스 트랩·Esc·←→·포커스 복귀, 방문 회차 줄이 이전 회차로 링크, 재방문 배너 "3개월 전 기록".
- 번들: 3단계 본문·사진 줄·업로드 진행·방문 인증 카드를 `next/dynamic` 으로 첫 로드 밖 — `/notes/new` 예산 470 은 그대로(실측은 아래).

## E. SEO · AI 검색 가시성 · 전환(`docs/ai-visibility-1006.md` 에 다섯 항목 × 네 칸 전체)

- AI 인용 요약 블록(`<section data-ai-summary>`) — 지역 허브(기존 첫 문단을 감쌈) + 단지 허브(히어로 아래 2~3문장, 실거래 있을 때만), `WebPage` speakable +
  `dateModified`(마지막 적재 성공일), 지역 `Dataset` JSON-LD. 뉴스 `NewsArticle`(B 항).
- `/llms-full.txt` 를 정적 파일 → 실데이터 라우트(손으로 적은 숫자 제거, 보관 경로 `/widget` 제외, story 사이트맵 포함). robots 에 검색·대리 봇 5종
  (ChatGPT-User·Claude-SearchBot·Claude-User·Perplexity-User·Amazonbot) 같은 규칙으로(학습 전용 Applebot-Extended 는 열지 않음).
- 광고 랜딩 `/lp/imjang`(noindex, 단일 CTA, UTM 보존, GA4 `generate_lead`; 지어낸 후기·수치 없음, "시세" 표현 없음). 빌링 첫 결제 리다이렉트에 `amount` 를 실어
  GA4 `purchase.value` 가 비지 않게(서버는 이 값을 읽지 않는다).
- 하지 않은 것: 비회원 이메일 수집 폼(RESEND 미설정 — "수집만 하고 못 보내는 폼 금지"), 자동 AI 인용 관측기.

## 검증
단위 테스트 **863**(1005 778 → +85) · tsc 0 · 빠른 게이트 전부 통과 · 마이그레이션 grants/ledger 통과 · 엄격 리뷰(HIGH 3·MED 6·LOW) 전부 반영 —
H1 죽은 다이제스트 토글 제거, H2 기본 공개 범위 비공개 + 퀵모드 공개 줄, H3 랜딩 "시세" 제거, M1 설정 저장이 다른 칸 덮던 경로, M2 오늘 기사 수 6 잘림,
M3/M5 이야기 판정 통일·link_only, M4 근거 없는 "연결 안 됨", M6 llms-full 보관 경로. 빌드·번들·모바일·빈칸·final-release 실측은 아래 "빌드 결과".

## 소유자가 직접 해야 하는 것(외부 계정)
1. **Bing 웹마스터** 등록(서치콘솔 가져오기 — ChatGPT/Copilot 인용 원천), 네이버 서치어드바이저 사이트맵·RSS 제출 확인.
2. **RESEND_API_KEY**(메일 0건 — 영수증·비밀번호 재설정·다이제스트 전부 막혀 있음), `CRUX_API_KEY`·`GSC_SERVICE_ACCOUNT_*`.
3. 유료 광고를 켠다면 Google Ads → `NEXT_PUBLIC_GOOGLE_ADS_ID` + GA4 전환 가져오기(sign_up·purchase·generate_lead), 최종 URL `/lp/imjang?utm_…`.
4. 토스 재신청(`docs/toss-review-1003.md` §3), `docs/seo-geo-routines.md` N19 첫 회차 관측.

## 남긴 것(다음 판)
- `seo.region_coverage` 경보(5개 신설 행정구역 pair 페이지) — `complex_pair_mv` 재생성 별도 판.
- `post-daily-real-estate-news` 워크플로 — 다른 저장소.
- 단지 요약 문장 규칙이 두 모듈(`lib/complex/complex-facts.ts` 패널용 · `lib/seo/citable-summary.ts` 허브용)에 있다 — 다음 판에 한 곳으로.
- 다른 화면(검색·다이제스트·알림)의 이웃 글 링크는 아직 `/town/news/{id}` 를 만든다(리다이렉트로 동작) — `/town/story/` 로 갱신하면 한 홉이 준다.
- 홈(`app/page.tsx`)의 동네·뉴스 블록은 손대지 않았다 — 같은 재질 규칙(.story/.news) 적용은 다음 판.

## 빌드 결과(로컬 운영 빌드, 2026-09-20)
- `npm run build` 전 게이트 + 단위 863/863 + 번들 예산: `/` 461 · `/map` 348 · `/analysis` 488 · `/analysis/ai/[tool]` 469 · **`/notes/new` 462/470(1005 468 → −6KB)** · `/complex/[id]` 478 · jsonld(297 페이지·879 블록) · cache-policy 통과.
- 운영 빌드 서버에서 `check:mobile` 기본 8 + 새 화면 8(/town/news · /town/write · /town/gangnam · /lp/imjang · /notes/new?quick=1 · /map · /redevelopment · /complex/compare) 통과, `check:void`·`check:void:mobile`·`check:narrow-text` 통과, `check:final-release` PASS 40 · WARN 1 · FAIL 0(마이 2열 그리드의 base `grid-cols-1` 누락 1건을 잡아 고쳤다).
