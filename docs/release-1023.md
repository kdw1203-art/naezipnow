# 1023 — 검토 문서(docs/review-1022.md) 제안 전부 적용 ("응 전부 진행해줘")

## 임장노트 (`app/notes/**`)
- 피드 검색칸(40px, 지우기 ×): `title·region·aptName` 클라이언트 필터, 지역 칩과 AND, 0건이면 "검색어에 맞는 노트가 없어요" + 지우기. `lib/notes/feed-search.ts`.
- 상세 "같은 단지 다른 노트": aptName 일치 앞줄("같은 단지" 캡션) → 지역 일치("같은 지역"). `lib/notes/related-order.ts`.
- 내 노트 회차 묶기: 같은 단지 2건 이상이면 묶음 카드(단지명 · N회차 · 최근 방문일), 펼치면 회차별 카드, 머리에 "회차 비교 ›"(`/notes/compare?noteId=`). `lib/notes/round-groups.ts`.
- 작성 3단계 저장 전 요약 카드(단지·방문일·점수 5축·체크 N/M·사진 N·판단·메모 첫 줄). `lib/notes/finish-summary.ts`.
- best 월 카드에 점수 축 3개(배점 대비 비율 높은 순) 막대 + `N / max`. `lib/notes/best-axes.ts`.
- 실패 고지 재시도: 더 보기 실패 → 같은 버튼 "다시 시도" · 내 노트 조회 실패 카드 "다시 시도" · 댓글 실패 `router.refresh()` 손잡이(`comments-retry.tsx`).
- 상세 마지막 칩 네이비 채움 → 테두리, 오프라인 배너 경고색 면 → 흰 카드. `FeedNote.aptName` 추가(있을 때만 실림).

## 지도 (`app/map/**`)
- 관심 단지 레이어(내 노트 옆 토글, `/api/me/watchlist`, 화면 마커에 ★ 얹기 + 화면 밖 단지는 별도 핀, 게스트는 로그인 고지, 좌표 못 붙인 수는 고지 줄). `lib/map/watch-layer.ts`.
- 검색 입력 전 포커스 → "최근 본 단지" 줄(`useRecentComplexes` 재사용).
- 뷰포트 한 줄 "단지 N · 거래 N"(목록 헤더와 같은 `filteredDanji.length`, 거래 수는 `priceMeta.txCount` > 0 일 때만).
- 레이어 실패 고지 7종 + 관심 단지에 "다시 시도" 버튼(해당 effect 재조회).
- 타일 실패 면·지도 셸·로딩 셸 그라데이션 → `bg-bg`. 미연결 고지 문구 사실화.

## AI 분석 (`app/analysis/**`)
- 허브: 최근 실행 결과 3건 카드(`hub-recent.tsx`, history-store 마운트 뒤 읽음) · 단지 고른 뒤 실행 4칸 "마지막 실행 N일 전 / 오늘 실행" · 시장 계열 카드 지역 고정 해제(`picked.regionId` → 홈 카드 지역 8곳 티저, `hub-region-teaser.tsx`, 캐시 키 v3) · 계열 "N종" → 앵커 링크 · 게스트 카드 최소 높이(`.hub-start`).
- 도구 4종 머리(price·gap·TimingClient·TempMapClient) `t-display` 손 마크업 → `PageHead`(t-title). 나머지 8종 단지 고르기 전 네이비 머리(hub-hero + 한지 글리프) → 흰 `PageHead`.
- "실데이터 기준" 부연 라벨 4곳 제거, `ai-note-analysis`·compare·scenario AI 코멘트 판 on-dark → 흰 카드·잉크 토큰, `temperature/[region]` text-[px] 17곳 → 램프. 최근 사용 칩 문구 사실화.
- `lib/ai/history-store.ts` 읽기 3종(`listRecentHistory`·`findLastRun`·`daysSinceRun`) — 저장 형식 불변.

## 동네 (`app/town/**` · `app/qna/**`)
- 동네 홈 머리 캡션 "이 동네 공개 임장노트 N · 최근 3건(링크)" — 이미 읽는 노트 배열로만.
- 피드 카드 지역 배지 → `/town/{regionId}`(카탈로그 매핑 있을 때만; 카드가 Link 라 `role="link"` 스팬).
- 뉴스룸 주제 칩 22개를 머리 바로 아래로(레일 중복 삭제). 전문가 필터 URL `replaceState`. Q&A 상세 단지 배지 → `/complex/{id}`(행에 id 있을 때만), 지역 배지 → 동네 홈.
- 피드 실패 고지 흰 카드 + "다시 시도"(`fetchPage` 공용, 첫 장 재조회) · 빈 상태 꼬리 4종 → 사실 한 줄 · 빈 상태 글쓰기 버튼 btn-soft(화면당 채움 파랑 1개) · 전문가 소개 카드 중복 통계 2칸 삭제.

## 통합자
- `app/components/home/*` text-[px] 14곳 · `viz/Gauge.tsx` text-[21px] → 램프(t-body/t-sub/t-title).

## 검증
- `npm run build` 통과(게이트 전부 · 단위 테스트 1,422 · 번들 예산: 홈 481/495 · 지도 354/375 · 분석 483/490 · 도구 473/480 · notes/new 465/470 · complex 478/480).
- 모바일 조작 검사 21개 경로 통과(홈·노트·best·동네·뉴스룸·전문가·동네 홈·허브·도구 4종·AI 도구 4종·지도·Q&A).
- `check-final-release` PASS 40 · WARN 1 · FAIL 0.
- 화면 확인: 데스크톱·폰 캡처(허브·리스크 점검 흰 머리·면적대별·노트 검색칸·뉴스룸 주제 칩·지도).

## 못 한 것 / 다음
- 관심 단지 좌표는 지도가 이미 가진 데이터에서만 붙인다(화면 밖 단지는 "좌표 없음 N곳") — 새 API·지오코딩은 만들지 않았다.
- 최근 실행 결과 카드의 단지 이름은 store 에 없어 headline 을 쓴다. 매수 타이밍은 지역 키라 도구 화면으로만 연결.
- 시장 티저 지역 8곳은 ISR 재검증 때 적재가 8배(하루 1회) — 운영에서 DB 부하 확인.
- 공개 피드 첫 장 조회 실패(서버 렌더)는 재시도 손잡이 없음(내 노트 탭만).
