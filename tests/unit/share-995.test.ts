import test from "node:test";
import assert from "node:assert/strict";
import {
  CARD_FALLBACK_PATH,
  cardLandingPath,
  isShortCode,
  noteShortCode,
  shortCodeUuidRange,
  shortNoteLabel,
  shortNoteUrl,
} from "../../lib/notes/short-code.ts";
import { buildKakaoFeedShare } from "../../lib/kakao/share-template.ts";
import { CARD_BRAND_DOMAIN, getFrame, type NoteCardSource } from "../../lib/notes/card-frames.ts";
import {
  aggregateShareInflow,
  type FollowView,
  type LandingView,
} from "../../lib/admin/share-inflow.ts";

/* 995 — 공유 카드 유입(D2).
   카드 이미지에 인쇄되는 링크는 되돌릴 수 없다. 코드 파생·검증·주소 조립이 어긋나면
   수천 장의 이미지가 죽은 링크를 들고 돌아다닌다 — 그래서 여기서 못 박는다. */

const ID = "3F2A9C7E-1b2c-4d5e-8f90-abcdef123456";

test("짧은 코드 = uuid 앞 8자, 소문자", () => {
  assert.equal(noteShortCode(ID), "3f2a9c7e");
  assert.equal(noteShortCode("  3f2a9c7e-1b2c-4d5e-8f90-abcdef123456 "), "3f2a9c7e");
});

test("isShortCode — 8자 소문자 hex 만 통과", () => {
  assert.equal(isShortCode("3f2a9c7e"), true);
  assert.equal(isShortCode("3F2A9C7E"), false, "대문자는 라우트가 먼저 소문자로 내린다");
  assert.equal(isShortCode("3f2a9c7"), false);
  assert.equal(isShortCode("3f2a9c7e9"), false);
  assert.equal(isShortCode("zzzzzzzz"), false);
  assert.equal(isShortCode("../../etc"), false);
});

test("shortNoteUrl / shortNoteLabel — 운영 도메인 기본, base 뒤 슬래시는 정리", () => {
  assert.equal(shortNoteUrl(ID), "https://naezipnow.com/n/3f2a9c7e");
  assert.equal(shortNoteUrl(ID, "https://preview.example.com/"), "https://preview.example.com/n/3f2a9c7e");
  assert.equal(shortNoteLabel(ID), "naezipnow.com/n/3f2a9c7e");
});

test("리다이렉트 목적지 — 노트 상세엔 card utm 3종, 폴백도 utm 을 잃지 않는다", () => {
  assert.equal(
    cardLandingPath(ID),
    `/notes/${ID}?utm_source=card&utm_medium=image&utm_campaign=note-card`,
  );
  assert.equal(CARD_FALLBACK_PATH, "/notes?utm_source=card&utm_medium=image");
});

test("uuid 범위 — 앞 8자를 고정한 최소·최대 uuid 사이에 원본이 든다(문자열 순서 = uuid 바이트 순서)", () => {
  const { lo, hi } = shortCodeUuidRange("3f2a9c7e");
  const id = ID.toLowerCase();
  assert.equal(lo, "3f2a9c7e-0000-0000-0000-000000000000");
  assert.equal(hi, "3f2a9c7e-ffff-ffff-ffff-ffffffffffff");
  assert.ok(lo <= id && id <= hi);
  assert.ok(!("3f2a9c7f-0000-0000-0000-000000000000" <= hi), "다음 코드는 범위 밖");
});

test("마무리 장(cta) — shareLabel 이 있으면 짧은 링크, 없으면 도메인", () => {
  const cta = getFrame("cta")!;
  const base: NoteCardSource = {
    title: "t", aptName: null, region: null, visitLabel: null, verdict: null, intent: null,
    budgetLabel: null, summary: null, risks: null, weather: null, transportation: null,
    scores: [], checks: [], pros: [], cons: [], tags: [], hasLocation: false, market: null,
  };
  const withLink = cta.build({ ...base, shareLabel: shortNoteLabel(ID) });
  const without = cta.build(base);
  assert.equal(withLink.kind, "cta");
  assert.equal(without.kind, "cta");
  if (withLink.kind === "cta" && without.kind === "cta") {
    assert.equal(withLink.sub, "naezipnow.com/n/3f2a9c7e");
    assert.equal(without.sub, CARD_BRAND_DOMAIN);
  }
});

test("카카오 피드 템플릿 — 제목·설명 200자 절단, 링크 두 곳 동일, 버튼 문구는 넘긴 값", () => {
  const url = shortNoteUrl(ID);
  const t = buildKakaoFeedShare({
    title: "가".repeat(250),
    description: "종합 81점 · 채광은 확실",
    shareUrl: url,
    imageUrl: "https://naezipnow.com/api/og/note?title=x",
    buttonTitle: "임장노트 보기",
  }) as {
    objectType: string;
    content: { title: string; description: string; imageUrl: string; link: { mobileWebUrl: string; webUrl: string } };
    buttons: { title: string; link: { mobileWebUrl: string; webUrl: string } }[];
  };
  assert.equal(t.objectType, "feed");
  assert.equal(t.content.title.length, 200);
  assert.equal(t.content.description, "종합 81점 · 채광은 확실");
  assert.equal(t.content.imageUrl, "https://naezipnow.com/api/og/note?title=x");
  assert.deepEqual(t.content.link, { mobileWebUrl: url, webUrl: url });
  assert.equal(t.buttons.length, 1);
  assert.equal(t.buttons[0].title, "임장노트 보기");
  assert.deepEqual(t.buttons[0].link, t.content.link);
});

test("카카오 피드 템플릿 — 버튼 문구 생략 시 예전 기본값 그대로", () => {
  const t = buildKakaoFeedShare({ title: "a", description: "b", shareUrl: "https://x.test/n/1", imageUrl: "https://x.test/i.png" }) as {
    buttons: { title: string }[];
  };
  assert.equal(t.buttons[0].title, "앱에서 보기");
});

test("공유 유입 집계 — 랜딩 뒤 같은 세션의 단지·가입 뷰만 센다", () => {
  const landings: LandingView[] = [
    { session_key: "s1", utm_source: "card", occurred_at: "2026-09-10T10:00:00Z" },
    { session_key: "s1", utm_source: "card", occurred_at: "2026-09-11T10:00:00Z" }, // 같은 세션 두 번 랜딩
    { session_key: "s2", utm_source: "card", occurred_at: "2026-09-10T12:00:00Z" },
    { session_key: "s3", utm_source: "share", occurred_at: "2026-09-10T13:00:00Z" },
    { session_key: "s4", utm_source: "kakao", occurred_at: "2026-09-10T14:00:00Z" },
  ];
  const follows: FollowView[] = [
    { session_key: "s1", path: "/complex/123", occurred_at: "2026-09-10T10:05:00Z" }, // 뒤 → 센다
    { session_key: "s1", path: "/signup", occurred_at: "2026-09-10T10:06:00Z" },
    { session_key: "s2", path: "/complex/9", occurred_at: "2026-09-10T11:00:00Z" }, // 랜딩보다 앞 → 안 센다
    { session_key: "s3", path: "/login", occurred_at: "2026-09-10T13:30:00Z" },
    { session_key: "s9", path: "/complex/1", occurred_at: "2026-09-10T13:30:00Z" }, // 공유 유입 아님
    { session_key: "s4", path: "/complex/7", occurred_at: "2026-09-10T14:00:00Z" }, // 같은 시각 → 뒤가 아니다
  ];
  const rows = aggregateShareInflow(landings, follows);
  assert.deepEqual(rows, [
    { source: "card", landings: 3, sessions: 2, complexSessions: 1, authSessions: 1 },
    { source: "share", landings: 1, sessions: 1, complexSessions: 0, authSessions: 1 },
    { source: "kakao", landings: 1, sessions: 1, complexSessions: 0, authSessions: 0 },
  ]);
  assert.deepEqual(aggregateShareInflow([], follows), [], "랜딩이 없으면 빈 표");
});
