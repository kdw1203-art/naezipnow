# 1046 — 1년 1만 회원 계획 · 첫 주 실행: 검색 노출 · 가입 누수 · 가입 경로 · 주간표

소유자 지시(2026-10-08): "1년 내 회원수 1만명 … 무엇을 버리고, 무엇에 집중해야하는지 … 고속성장 계획을 만들어주고 실행해줘".
계획 문서: Claude Docs "1년 1만 회원 — 시간 압축 성장 계획". 1045 위에 누적. 가격·상품 변경 없음.
DB 변경 1건(운영 적용 완료 · 미러 `supabase/migrations/20261008234525_1046_growth_attribution_weekly.sql`).

## 출발점(실측 · 2026-09-08~10-08 · 관리자 접속 제외)

방문자 40명 · 세션 48 · 페이지뷰 113 · 신규 가입 1명(누적 15명, 테스트 계정 포함) · 관심 단지 등록 회원 3명.
유입: 구글 21 · 직접 17 · 네이버 7 · ChatGPT 3. 첫 화면의 46%가 단지 상세.

## 1. 단지 페이지를 IndexNow 로 알린다(네이버 · 빙)

- 예전: 하루 5개 안팎(허브 3 · 월간 리포트 2 · 최근 노트). 단지 페이지는 0.
- 이제: 지난 하루 사이 **최근 계약월(당월·전월) 거래**가 새로 들어온 단지 — 하루 최대 900개(실측 하루 약 210곳). 같은 날 들어오는 옛 연도 이력 백필(하루 수만 행)은 고르지 않는다. "바뀐 것만 알린다" 원칙 그대로.
- 경로는 사이트맵과 같은 함수(`complexCanonicalPathFromNames`). 못 읽으면 응답의 `missing` 에 `complexes(…)` 로 남는다.
- 파일: `lib/seo/indexnow-pick.ts`(순수 규칙) · `lib/seo/indexnow-complexes.ts` · `app/api/cron/indexnow-submit/route.ts`.

## 2. 가입 전에 누른 관심 등록 — 가입 뒤 마저 담는다

- 예전: 비회원이 관심 등록 → 가입 창 → 가입 후 같은 단지로 돌아오지만 단지는 안 담겨 있어 한 번 더 눌러야 했다.
- 이제: 누른 단지를 이 브라우저에 적어 두고(24시간), 로그인 상태로 그 단지에 오면 한 번만 담고 "가입 전에 누른 관심 등록을 마쳤어요 · 새 실거래가 올라오면 알려 드려요".
- 가입 창 문구가 가입 이유를 말한다: "가입하면 이 단지에 새 실거래가 올라올 때 메일로 알려 드려요. 임장 기록도 한곳에 모여요." (새 실거래 메일은 이미 매일 돌고 기본 켜짐)
- 파일: `lib/client/pending-watch.ts` · `app/complex/[id]/hub-client.tsx`.

## 3. 가입 경로 기록 + 성장 주간표

- 분석 동의한 방문자가 로그인 상태가 되면 방문자 키를 한 번 건네고, 서버가 그 키의 첫 착지(유입 호스트 · UTM · 첫 화면)를 가입 기록에 붙인다. 가입 14일 안의 계정만, 첫 기록이 정본. 동의 전·거부면 아무것도 보내지 않는다.
- 관리 › 트래픽 맨 위 **성장 주간표**: 이번 달 신규 가입 / 계획 목표(10월 30 · 11월 80 · 12월 160 …), 8주 표(방문자 · 검색 착지 · 신규 가입 · 방문 대비 가입 · 첫 관심 등록), 최근 28일 가입 채널. 직전 2주 연속 전환 2% 미만(주 방문자 50 이상)이면 멈출 기준 경고.
- 관리자 방문(관리 화면을 연 방문자 키)과 관리자 계정(allowlist · app_users.role ≠ user)은 뺀다.
- DB: `public.signup_attribution`(RLS · service_role 전용 · 키는 소문자 이메일 — 탈퇴 파기 조회에 자동으로 잡힌다) · `link_signup_attribution` · `admin_growth_weekly` · `admin_signup_channels`(셋 다 service_role 만 실행).
- 파일: `app/components/TrafficRecorder.tsx` · `app/api/me/attribution/route.ts` · `lib/growth/channels.ts` · `lib/admin/growth-weekly.ts` · `app/admin/traffic/GrowthWeekly.tsx`.

## 4. 주간 요약 메일 — 동의 기록을 본다

- 예전: 발송 스위치(`notification_preferences.email_marketing`)만 봐서, 가입 화면에서 마케팅 수신에 동의한 사람이 설정에서 한 번 더 켜기 전까지 주간 요약 메일을 못 받았다.
- 이제: 동의 기록(`user_consents.marketing_agreed`) — 설정 화면이 그리는 값, 재방문 알림이 보는 값과 같다. 동의 안 한 사람에게는 여전히 안 간다.

## 5. 단지 공유 링크에 출처

- 단지 화면 "공유" 링크에 `?utm_source=share&utm_medium=complex`. 관리 › 트래픽 '공유 유입'과 가입 채널 '공유 링크'가 센다. 정규 URL 은 canonical 이 지킨다.

## 확인

- `tests/unit/growth-1046.test.ts`(17) · 빌드 전체.
- 운영 DB: 주간표 함수 실행 확인(8주) · anon/authenticated 실행권 없음 · 존재하지 않는 계정으로 잇기 → `no_user`(쓰기 없음).

## 배포 뒤 볼 것

- 다음 날 06:00 UTC IndexNow 크론 응답의 `detail.complexes`(200 안팎 예상).
- 관리 › 트래픽 성장 주간표 — 가입 채널은 이 배포 뒤 가입부터 채워진다.
