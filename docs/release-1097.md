# 1097 — 전 화면 최적화 · 기능 향상 · 중복 통폐합: 뉴스룸 날짜 묶음 · 지도 죽은 팝업 제거 · 온도 지도 RSC · 관리자 · 설정 · 임장노트 · yyyymm 셈 한 벌

소유자 2026-10-31 "모든 페이지 및 관리자 페이지, 설정, 임장노트, 지도, AI 분석 등 최적화와 기능 향상, 중복된 기능 통폐합" + 뉴스룸 캡처
"구분이 제대로 안 되어 있는 것 같아 가독성이 떨어져". 운영은 여전히 **503 `DEPLOYMENT_PAUSED`**(11/1 배포 예정).
DB 변경 없음 · 가격 · 결제 · 심사 화면 변경 없음. GitHub main(1089) 위에 바로 적용된다(1090~1096 을 얹었든 아니든).

## 디자인 — 뉴스룸(/town/news) 구분

40행이 1px 연한 선(`--divider`) 하나로만 나뉘어 한 덩어리로 읽혔다(소유자 데스크톱 캡처 · 로컬 실측 같음). 폰은 제목 한 줄이 18자쯤에서 잘려
제목의 절반이 사라졌다("목동 한신청구 리모델링 시공사 입찰 2…").

| | 전 | 후 |
|---|---|---|
| 묶음 | 없음 | 날짜(한국 시간) 머리 "10월 31일 (금) · 12건"(`lib/town/news-day` · 굵은 밑선) |
| 행 사이 선 · 여백 | `--divider` · 12/14px | `--border` · 14/16px |
| 요약 | 제목과 같은 `--text-2` | 한 단 옅게 `--text-3` |
| 썸네일(데스크톱) | 88px | 96px |
| 폰 제목 | 한 줄 말줄임 | 그대로 — 1012 폰 배율 규칙("최대한 한 줄로")이 소유자 지시라 두 줄로 풀지 않는다 |

날짜는 절대 날짜만 — "오늘 · 어제"는 서버(ISR 5분)와 브라우저가 다르게 그려 hydration 이 어긋난다. 연도는 첫 묶음과 다를 때만 붙는다.

## 지도(/map) — 열리는 길이 없던 상세 팝업

`selectedId` 를 값으로 놓는 코드가 어디에도 없어(1024 뒤로 목록 · 마커 모두 ComplexInfoPanel) "단지 클릭 → 상세 팝업"(탭 5개 · 노트 · 매물 조회
효과 · 고아 타입 · 헬퍼 · Esc 처리)이 죽은 채 지도 청크에 실려 있었다 — 6,208 → 5,714줄. 살아 있는 단지 패널(ComplexInfoPanel)은 그대로.

## AI 분석

- `/analysis/temperature`: 클라이언트가 읽는 값은 지역 id · 이름 · 점수 · 한 줄 · 직전 점수 다섯뿐인데 기록 414개 × 15개 필드가 RSC 에 통째로
  실렸다(한 장 276KB · RSC 209KB) → `slimTemperatureLatest` 로 다섯 값만. 한 장 276KB → 150KB(RSC 209KB → 67KB · 로컬 실측).
- 비교(/analysis/compare): 비교함은 5곳 · AI 비교 도구는 3곳(AI-22)이라 넷째부터 조용히 빠졌다 → 라벨 "AI 비교 해석 · 앞 3곳".
- 통폐합(도움 에이전트 조사 → 검토 뒤 반영): 갈아타기 추천(`/analysis/switch`)은 추천 엔진 없이 "준비 중" 한 장(noindex · robots 차단)이라 지우고
  `/analysis/timing` 으로, 공공 자료 현황(`/data/records` · 11개 자료 전부 0행 · 내부 링크 0 · 사이트맵 밖)은 `/data-sources` 의 한 절로 접고
  리다이렉트(`lib/seo/redirect-map`). 도구 목록 · 글리프 · robots · 캐시 정책 · check-links 에서 같이 뺐다.

## 설정 · 임장노트

- `/my/settings`: 알림 설정 훅(`usePrefs`)을 탭마다 새로 만들어 탭을 오갈 때마다 `/api/me/notification-prefs` 를 다시 받았고, 알림 탭에서 끈 값이
  개인정보 탭에선 옛 값으로 보일 수 있었다 → 화면에 한 벌.
- `/notes/compare`(회차 비교): 노트 허브 레일 "노트 비교"가 noteId 없이 들어와 "골라 주세요"뿐인 막다른 화면이었다 → 내 노트 중 같은 단지
  2회 이상인 단지를 칩으로(`lib/inspection/compare-candidates` · 최근 순 · 최대 12) · 누르면 그 비교로.

## 관리자

| 항목 | 전 | 후 |
|---|---|---|
| 이모지 | 🔴 심각 경보 · 👍👎 · ⚠ 자동 플래그 · ⚑ | 낱말 |
| 배너 미리보기 | 그라데이션(실제 슬롯은 1015 규칙 G 단색) + 쓰이지 않는 "끝색" 입력 | 단색 · 입력 하나 |
| 메뉴 | /admin/listings(검수 대기 · 신고 3건 숨김 · 소유 확인)만 메뉴에 없었다 | "매일 › 매물 검수" |
| 꼬리말 | "매물 검수 대기 · 소유확인 심사 큐"(값은 pending 매물) · "전체 가입 · profiles"(값은 app_users) | 사실대로 |
| AI 품질 카드 | "👍/👎 비율은 연동 후 제공"(실제로는 /admin/ai 가 이미 센다) | 링크 |
| 죽은 경로 | 모더레이션 정책 설명 "/admin/reports" | /admin/moderation |
| `loadAdminKpi`(조회 28개) | /admin/ops 가 직접 + getOperatingMetrics 경유로 두 번 | React `cache()` — 요청 안 한 번 |
| /admin/community | 같은 조회(댓글 500행)를 두 번 보내고 두 번째는 버림 | 한 번 |
| /admin/seo 단지 링크 패널 | 글 60 × 랜드마크 3 을 **차례로** 조회(콜드 캐시 최대 180회) | 묶음 조회 1회(`resolveComplexHrefs`) |
| 문구 | "지도 시세 색상" · "면적대 시세" · "지도·시세·임장노트" · "확인해 보세요" | 실거래 · 사실 낱말 |

## 통폐합 — 같은 셈이 여러 벌

| 셈 | 전 | 후 |
|---|---|---|
| `shiftYm`(yyyymm ± n) | 5벌(quiz · asking-check · dong · molit-core · region-overview) | `lib/format/ym.shiftYm` 하나 · 예전 이름 재수출(지역 개요는 부호 반대라 `ymMonthsBefore` 로) |
| `ymDot` / `ymDotLabel` | 3벌 + 2벌 | `ymDotLabel` |
| `formatYmKo` / `ymKo` | 2벌 + 1 | `ymKoLabel` |
| `ymShort` | 2벌 | `ymShortLabel` |
| `maskEmail` | qna/store 와 privacy/mask-email 이 글자 하나까지 같음 | `maskEmailPublic` |

남은 중복(다음 판): `medianOf` 3 · `deltaLabel` 3 · `normalizeComplexName` 3 · `ymLabel` 5(모양이 다르다) · `isKakaoOAuthConfigured` 2 ·
`turnstileSiteKey` 2 · InquiryForm/PartnerForm/VerdictCard/ScoreRing 각 2 · 관심 지역 저장소 4곳 · 관리자 매출 · 회원 수 · Web Vitals 가 각각 두세 원천.

## 문구 16곳

실거래 자료의 "시세"(설정 문자 알림 · 주간 요약 · 전세가율 실패 · 비교 지역 요약 · 노트 위치 안내) · 실패 "○○ 불러오기 실패 · 잠시 후 다시"(설정 3 ·
기록 기본값 · 문의 · 관리자 답변) · 빈 상태 "○○ 없음"(이달의 노트 · 온도 지도) · ✓ 기호 → 낱말(현장 인증 · 옮김 · 평면도 · 복사 6곳) ·
회차 비교의 예외 문장 노출 제거.

## 검증

- `tests/unit/review-1097.test.ts` 8건(뉴스룸 묶음 · 지도 · 온도 · 설정 · 회차 비교 후보 · 관리자 · 통폐합 동치 · 문구). 1055 · 1075 · 1023 · 1026b ·
  1012 · 1027 · 1010 핀 갱신. tsc 0 · eslint(map-client) 0 · 빌드 EXIT 0.
- 캡처: 뉴스룸 데스크톱 · 폰 전/후 · /data-sources "준비 중인 공공 자료" 절. 수치: /analysis/temperature 276KB → 150KB · 지도 클라이언트 6,208 → 5,714줄(청크 161KB → 153KB) · /analysis/switch · /data/records → 301.

## 소유자 작업(대시보드)

1. 11/1 배포 전 **Settings → Billing → Spend Management → nuguzip-homepage → Resume**.
2. 이 zip 적용 · 푸시(main 1089 위 · 1090~1096 을 안 얹었어도 그대로).
