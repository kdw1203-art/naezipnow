# 친구 기능 구독 플랜 (1035 · 2026-10-05)

지시: "친구 기능에 대한 구독 플랜도 도입해서 적용". 코드: `lib/subscriptions/access.ts`(FEATURE_RULES · friend_* 4키) · `lib/friends/plan.ts`(FRIEND_PLAN · 게이트 · 요금제 행) · `tests/unit/friends-plan-1035.test.ts`.

## 왜 새 상품이 아니라 기존 세 플랜 안인가
- 카드사 심사 동결(check:review-freeze): 가격·상품 카테고리·판매상태 변경 금지. 별도 "친구 패스"는 새 상품이라 지금은 만들 수 없다.
- 심사가 끝난 뒤 별도 패스가 필요하면 `tier-packages` 에 더하고 이 표만 갈아끼운다(게이트 코드는 그대로).

## 플랜표 (무료 · 플러스 2,900 · 프로 18,900 — 가격은 billing-periods 단일 출처, 여기 적지 않는다)

| 항목 | 무료 | 플러스 | 프로 | 출처 |
|---|---|---|---|---|
| 친구 요청·수락 · 친구 공개 노트 · 친구가 보는 단지 | 가능 | 가능 | 가능 | friend_add(minTier basic) |
| 친구 수(보유 상한) | 10명 | 100명 | 무제한 | FRIEND_PLAN.friendsMax |
| 친구 쪽지(1:1) | 월 30건 | 무제한 | 무제한 | FEATURE_RULES.friend_message |
| 친구 단체방 개설 | 불가(참여는 가능) | 3개 | 무제한 | friend_group(minTier pro) · FRIEND_PLAN.groupsMax |
| 같이 임장(동선 공유) | 월 2회 | 무제한 | 무제한 | FEATURE_RULES.friend_together |

원칙: 관계 자체에는 벽이 없다(커뮤니티가 시작되려면) · 유료가 사는 것은 "더 많은 사람·더 많은 방·더 자주" · 무료 한도는 가벼운 사용엔 닿지 않고 열심인 사람만 만나는 벽.

## 벽 문구 (friendGateLine — 사실만, 권유문 없음)
- 친구 10명 · 플러스 100명 / 쪽지 월 30건 · 플러스 무제한 / 단체방 · 플러스부터 / 같이 임장 월 2회 · 플러스 무제한

## 요금제 화면
- `FRIEND_PLAN_MATRIX_ROWS`(친구 · 친구 쪽지 · 친구 단체방 · 같이 임장)를 **친구 1단계가 배포될 때** PLAN_FEATURE_MATRIX 에 추가한다. 지금 넣지 않는 이유: 코드가 아직 막지 않는 한도를 광고하지 않는다([1004]) + 심사 동결 중 요금제 화면 변경 최소화.

## 집행 지점(친구 1단계 구현 때)
- 친구 요청 API: `friendAddGate(tier, 현재 친구 수 + 보낸 대기 요청)` → 402 + 문구
- 쪽지 전송 API: `friendMonthlyGate(tier, "friend_message", 이번 달 보낸 수)` — 카운터는 feature_usage_events(feature_key=friend_message)
- 단체방 개설: `friendGroupGate(tier, 내가 만든 방 수)`
- 같이 임장 공유: `friendMonthlyGate(tier, "friend_together", …)`
- 한도 표시는 마이 → 구독 관리의 기존 한도 줄과 같은 자리(숫자는 전부 이 두 표에서)
