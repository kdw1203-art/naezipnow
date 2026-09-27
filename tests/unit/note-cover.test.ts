import test from "node:test";
import assert from "node:assert/strict";
import {
  COVER_SPEC_VERSION,
  FACT_MAX,
  HEADLINE_MAX,
  charLength,
  coverImagePath,
  coverVersion,
  isAllowedCoverPhoto,
  mergeCoverIntoMetadata,
  readCoverSpec,
  toCoverSpec,
  type CoverSpec,
} from "../../lib/notes/cover/spec.ts";
import {
  buildNumberCorpus,
  extractNumbers,
  noteScore100,
  unverifiedNumbers,
  verifyCoverText,
  type CoverNote,
} from "../../lib/notes/cover/verify.ts";
import {
  buildSub,
  composeCandidates,
  coverPhotoOf,
  isLabCoverNote,
  ruleFacts,
  sanitizeCoverDraft,
  shortName,
  splitTitle,
  titleFacts,
} from "../../lib/notes/cover/rules.ts";
import { resolveNoteCover } from "../../lib/notes/cover/resolve.ts";
import { buildCoverPrompt, coverPromptHash, parseCoverLlm } from "../../lib/notes/cover/prompt.ts";
import { backfillSql, backfillVariantAt, planBackfill } from "../../lib/notes/cover/backfill.ts";

/* 임장노트 썸네일 — 숫자 검증·규칙 폴백·후보 3장·저장 병합·목록 주소·백필 SQL 을 잠근다.
   픽스처는 실제 공개 Lab 노트(#30·#33)와 사람 노트의 모양을 줄인 것이다(Lab 의 sections 는 배열). */

const HOST = "proj.supabase.co";
const PHOTO = `https://${HOST}/storage/v1/object/sign/inspection/a/1.jpg?token=abc`;

const LAB_30: CoverNote & { id: string } = {
  id: "11111111-1111-4111-8111-111111111111",
  authorLabel: "내집나우 Lab 편집장",
  title: "상계주공9 거래1위·평단가 46위(Lab #30)",
  aptName: "상계주공9단지",
  region: "서울 노원구",
  summary: "상계주공9단지는 1~8월 노원구 거래 1위지만 평단가는 3,482만원/평로 46위다. 2,830세대, 용적률 207%.",
  sections: [
    { no: "00", title: "한 장 요약", lead: "거래량 1위인데 평단가는 46위 — 사업성은 13곳 중 최하위." },
  ],
  scores: { location: 4, school: 3, transport: 5, facility: 2, future: 2 },
  photos: ["https://proj.supabase.co/storage/v1/object/public/lab-cards/lab-030/card_01.png"],
  metadata: {
    note_no: "30",
    key_metrics: { far_pct: 207, households: 2830, nowon_rank: 46, rank_total: 83, raw_p1_p2_pct: -1.4 },
    geo: { lat: 37.65, lon: 127.06 },
  },
};

const LAB_33: CoverNote & { id: string } = {
  id: "d5b4d13a-5ec7-43ee-b01a-c160ebde99a3",
  authorLabel: "내집나우 Lab",
  title: "그라시엘 전세10억3건 월세71%(Lab #33)",
  aptName: "청량리역 한양수자인 그라시엘",
  region: "서울 동대문구",
  summary: "84㎡ 전세 10.00억은 1건이 아니라 3건이며 41·49·53층이 전부 같은 값이다. 71.4%가 월세·반전세다.",
  sections: [{ no: "10", title: "AI 스코어카드", lead: "종합 64점 + og 뱃지 고지" }],
  scores: { location: 3, school: 2, transport: 5, facility: 3, future: 3 },
  photos: [],
  metadata: { note_no: "33", key_metrics: { jeonse_ratio_pct: 54.5, wolse_share_84_p2_pct: { n: 21, v: 71.4 } } },
};

const USER_NOTE: CoverNote & { id: string } = {
  id: "22222222-2222-4222-8222-222222222222",
  authorLabel: "민지",
  title: "남향이라 오후 채광은 좋은데 이중주차가 걸린다",
  aptName: "상계주공9단지",
  region: "서울 노원구 상계동",
  summary: "저녁 7시 방문. 남향 동은 채광이 좋았고 단지 안이 조용했다.",
  sections: { memo: "주차는 이중주차가 많아 퇴근 시간엔 자리 찾기가 어려웠다", pros: "채광", cons: "주차" },
  scores: { location: 4, school: 3, transport: 4, facility: 2, future: 3 },
  photos: [PHOTO, `https://${HOST}/storage/v1/object/sign/inspection/a/2.jpg?token=def`],
  metadata: { decision: { choice: "hold", reasons: ["주차 2대 중 1대는 이중주차"], decidedAt: "2026-09-20T00:00:00.000Z" } },
};

/* ── 숫자 뽑기 ─────────────────────────────────────────────────────────────── */

test("숫자 뽑기 — 천 단위 쉼표·소수·날짜·부호를 값으로", () => {
  const keys = (s: string) => extractNumbers(s).map((t) => `${t.negative ? "-" : t.plus ? "+" : ""}${t.key}`);
  assert.deepEqual(keys("1,152세대 · 9.35억 · 25.00억"), ["1152", "9.35", "25"]);
  assert.deepEqual(keys("2025.06.18 계약"), ["2025", "6", "18"]);
  assert.deepEqual(keys("−22.6%는 구성효과 · +3억은"), ["-22.6", "+3"]);
  assert.deepEqual(keys("2023-06 준공 · H-033"), ["2023", "6", "33"], "숫자·글자 뒤의 - 는 부호가 아니다");
  assert.deepEqual(keys("전세10억3건"), ["10", "3"]);
});

/* ── 숫자 검증(브리프: 지어낸 숫자 금지) ───────────────────────────────────── */

test("검증 — 원문에 없는 숫자가 하나라도 있으면 후보를 버린다", () => {
  const corpus = buildNumberCorpus(LAB_30);
  assert.equal(verifyCoverText({ headline: "상계주공9단지", fact: "거래1위·평단가 46위", sub: "서울 노원구" }, corpus).ok, true);
  const fake = verifyCoverText({ headline: "상계주공9단지", fact: "전세가율 71%", sub: "서울 노원구" }, corpus);
  assert.equal(fake.ok, false);
  assert.match(fake.problems.join(" "), /71/);
  assert.equal(verifyCoverText({ headline: "상계주공9단지", fact: "평단가 47위", sub: "" }, corpus).ok, false, "46 → 47 은 지어낸 숫자");
  assert.equal(verifyCoverText({ headline: "상계주공10단지", fact: null, sub: "" }, corpus).ok, false, "제목의 숫자도 본다");
});

test("검증 — 값으로 비교한다(천 단위·끝자리 0) · 반올림은 인정하지 않는다", () => {
  const corpus = buildNumberCorpus(LAB_33);
  assert.deepEqual(unverifiedNumbers("전세 10억 3건", corpus), [], "10.00억 = 10억");
  assert.deepEqual(unverifiedNumbers("월세 71.4%", corpus), []);
  assert.deepEqual(unverifiedNumbers("월세 71%", corpus), [], "제목에 71% 가 그대로 있다");
  assert.deepEqual(unverifiedNumbers("월세 71.5%", corpus), ["71.5"]);
  assert.deepEqual(unverifiedNumbers("2,830세대", buildNumberCorpus(LAB_30)), [], "key_metrics 의 2830");
});

test("검증 — key_metrics 의 숫자(중첩 포함)는 원문이다 · metadata 의 다른 키는 아니다", () => {
  const corpus = buildNumberCorpus(LAB_33);
  assert.deepEqual(unverifiedNumbers("전세가율 54.5%", corpus), []);
  assert.deepEqual(unverifiedNumbers("21건", corpus), [], "key_metrics 안 {n:21}");
  const lab30 = buildNumberCorpus(LAB_30);
  assert.deepEqual(unverifiedNumbers("37.65", lab30), ["37.65"], "좌표(geo)는 원문이 아니다");
  const withCover = { ...LAB_30, metadata: { ...(LAB_30.metadata as object), cover: { fact: "999억" } } };
  assert.deepEqual(unverifiedNumbers("999억", buildNumberCorpus(withCover)), ["999"], "저장된 커버로 자기를 검증하지 않는다");
});

test("검증 — 부호를 뒤집으면 지어낸 숫자다", () => {
  const corpus = buildNumberCorpus(LAB_30);
  assert.deepEqual(unverifiedNumbers("−1.4%", corpus), [], "key_metrics 의 -1.4");
  assert.deepEqual(unverifiedNumbers("+1.4%", corpus), ["+1.4"]);
  assert.deepEqual(unverifiedNumbers("+207%", corpus), [], "양수 값에 + 는 통과");
  assert.deepEqual(unverifiedNumbers("−207%", corpus), ["−207"]);
});

test("검증 — 한글 수사(두 배·세 곳·절반)도 원문에 같은 말이 있어야 한다", () => {
  const corpus = buildNumberCorpus(LAB_30);
  assert.deepEqual(unverifiedNumbers("거래 두 배", corpus), ["두 배"]);
  assert.deepEqual(unverifiedNumbers("가격 절반", corpus), ["절반"]);
  const withPhrase = buildNumberCorpus({ ...LAB_30, summary: "거래가 두 배로 늘었다" });
  assert.deepEqual(unverifiedNumbers("거래 두 배", withPhrase), []);
});

test("검증 — 길이(제목 14·사실 16)·이모지·느낌표", () => {
  const corpus = buildNumberCorpus(USER_NOTE);
  assert.equal(HEADLINE_MAX, 14);
  assert.equal(FACT_MAX, 16);
  assert.equal(verifyCoverText({ headline: "가".repeat(15), fact: null, sub: "" }, corpus).ok, false);
  assert.equal(verifyCoverText({ headline: "가".repeat(14), fact: "나".repeat(17), sub: "" }, corpus).ok, false);
  assert.equal(verifyCoverText({ headline: "상계주공9단지", fact: "채광 최고!", sub: "" }, corpus).ok, false);
  assert.equal(verifyCoverText({ headline: "상계주공9단지 ✨", fact: null, sub: "" }, corpus).ok, false);
  assert.equal(charLength("84㎡ 28억"), 7, "㎡ 는 한 자");
});

test("점수 — 5축 평균×20(입력된 축만)은 노트가 가진 숫자다", () => {
  assert.equal(noteScore100(USER_NOTE.scores), 64);
  assert.equal(noteScore100({ location: 0, school: 0, transport: 0, facility: 0, future: 0 }), null);
  assert.deepEqual(unverifiedNumbers("기록 64점", buildNumberCorpus(USER_NOTE)), []);
});

/* ── 규칙 기반 폴백 ─────────────────────────────────────────────────────────── */

test("Lab 판정 — 작성자 표기 또는 제목 표식", () => {
  assert.equal(isLabCoverNote(LAB_30), true);
  assert.equal(isLabCoverNote({ title: "[내집나우 Lab] AI 임장노트 #3 — 분석" }), true);
  assert.equal(isLabCoverNote(USER_NOTE), false);
});

test("제목 가르기 — 이름 + 주장 (Lab 두 형식)", () => {
  assert.deepEqual(splitTitle(LAB_30), { name: "상계주공9", claim: "거래1위·평단가 46위" });
  assert.deepEqual(splitTitle(LAB_33), { name: "그라시엘", claim: "전세10억3건 월세71%" });
  assert.deepEqual(
    splitTitle({ title: "[내집나우 Lab] AI 임장노트 #14 — 은마아파트: 세입자 3,100가구 이주 통보", aptName: "은마아파트" }),
    { name: "은마아파트", claim: "세입자 3,100가구 이주 통보" },
  );
  assert.deepEqual(
    splitTitle({ title: "이촌동 한가람 84㎡ 28억 — 용산공원 3만가구 호재의 실제 거리 (Lab #17)", aptName: "한가람" }),
    { name: "이촌동 한가람", claim: "84㎡ 28억 — 용산공원 3만가구 호재의 실제 거리" },
  );
});

test("짧은 단지명 — 14자 넘으면 앞 낱말을 뗀다", () => {
  assert.equal(shortName(LAB_30), "상계주공9단지");
  assert.equal(shortName(LAB_33), "한양수자인 그라시엘", "청량리역 한양수자인 그라시엘(15자) → 앞 낱말 뗌");
  assert.equal(shortName({ title: "", aptName: "", region: "서울 강남구" }), "서울 강남구");
  assert.equal(shortName({}), "임장 기록");
});

test("보조 줄 — 지역 · 단지명, 제목과 같은 단지명은 다시 적지 않는다, 넘치면 줄인다", () => {
  assert.equal(buildSub(LAB_33, "한양수자인 그라시엘"), "동대문구 · 청량리역 한양수자인 그라시엘");
  assert.equal(buildSub(LAB_30, "상계주공9단지"), "서울 노원구");
  assert.equal(buildSub(LAB_30), "서울 노원구 · 상계주공9단지");
  assert.ok(charLength(buildSub({ aptName: "가".repeat(30), region: "서울 노원구" })) <= 24);
});

test("제목 주장 — 그대로 맞는 마디 먼저, 긴 주장은 뒤쪽 조각(조건절을 떼지 않는다)", () => {
  assert.equal(titleFacts(LAB_30)[0], "거래1위·평단가 46위");
  const eunma = { title: "[내집나우 Lab] AI 임장노트 #14 — 은마아파트: 세입자 3,100가구 이주 통보, 은마 빼면 대치동 8억 이하 전세는 7개월간 66건", aptName: "은마아파트" };
  const facts = titleFacts(eunma);
  assert.equal(facts[0], "3,100가구 이주 통보");
  assert.ok(!facts.includes("7개월간 66건"), "'은마 빼면' 을 떼면 66건이 은마 것이 된다");
  const money = { title: "[내집나우 Lab] AI 임장노트 #5 — 사가정: 매매가 3,600만원 차이가 필요 현금 2억 4,000만원 차이를 만든다", aptName: "사가정" };
  assert.ok(!titleFacts(money).some((f) => f.startsWith("4,000만원")), "2억 4,000만원 을 가르지 않는다");
  assert.deepEqual(titleFacts({ title: "[내집나우 Lab] AI 임장노트 #1 — 올림픽파크포레온 단지 분석", aptName: "올림픽파크포레온" }), [], "'단지 분석' 은 사실이 아니다");
});

test("규칙 사실 — 사람 노트: 판단 → 기록 점수 → 메모 · Lab: 제목 주장 → 지표", () => {
  const user = ruleFacts(USER_NOTE);
  assert.equal(user[0], "내 판단 · 보류");
  assert.equal(user[1], "기록 64점");
  const lab = ruleFacts(LAB_33);
  assert.equal(lab[0], "전세10억3건 월세71%");
  assert.ok(lab.includes("전세가율 54.5%"));
  assert.ok(lab.includes("종합 64점"), "본문에 '종합 64점' 이 그대로 있을 때만");
});

/* ── 후보 3장 ──────────────────────────────────────────────────────────────── */

test("후보는 항상 3장 — Lab 은 navy·hanji·light(데이터 카드 사진은 깔지 않는다)", () => {
  const c = composeCandidates(LAB_30, [], { photoHost: HOST });
  assert.equal(c.length, 3);
  assert.deepEqual(c.map((x) => x.variant), ["navy", "hanji", "light"]);
  assert.ok(c.every((x) => x.source === "rule"));
  assert.equal(coverPhotoOf(LAB_30, HOST), null);
});

test("후보는 항상 3장 — 사진 있는 사람 노트는 photo 가 첫 장", () => {
  const c = composeCandidates(USER_NOTE, [], { photoHost: HOST });
  assert.equal(c.length, 3);
  assert.deepEqual(c.map((x) => x.variant), ["photo", "navy", "hanji"]);
  assert.equal(coverPhotoOf(USER_NOTE, HOST), PHOTO);
  assert.equal(coverPhotoOf({ ...USER_NOTE, photos: ["http://169.254.169.254/latest"] }, HOST), null, "우리 스토리지 밖 주소는 깔지 않는다");
});

test("후보는 항상 3장 — 아무것도 없는 노트도", () => {
  const c = composeCandidates({ id: "x", title: "", region: "", scores: null, metadata: null }, [], { photoHost: HOST });
  assert.equal(c.length, 3);
  assert.ok(c.every((x) => x.headline && charLength(x.headline) <= HEADLINE_MAX));
});

test("AI 문구 — 검증 통과분만 앞에, 지어낸 숫자·긴 문구는 버리고 규칙으로 채운다", () => {
  const ai = [
    { headline: "상계주공9단지", fact: "거래 1위, 평단 46위" },
    { headline: "상계주공9단지", fact: "전세가율 71%" }, // 원문에 없는 71
    { headline: "상계주공9단지 재건축 사업성 최하위", fact: null }, // 제목 14자 초과
  ];
  const c = composeCandidates(LAB_30, ai, { photoHost: HOST });
  assert.equal(c.length, 3);
  assert.equal(c[0].source, "ai");
  assert.equal(c[0].fact, "거래 1위, 평단 46위");
  assert.ok(!c.some((x) => x.fact === "전세가율 71%"));
  assert.ok(c.slice(1).every((x) => x.source === "rule"));
  for (const x of c) {
    assert.equal(verifyCoverText(x, buildNumberCorpus(LAB_30)).ok, true, `${x.headline}/${x.fact}`);
  }
});

/* ── 저장 검증·병합 ───────────────────────────────────────────────────────── */

test("저장 검증 — 보낸 값을 다시 본다(변형·숫자), 보조 줄은 서버가 조립", () => {
  const ok = sanitizeCoverDraft(LAB_30, { variant: "hanji", headline: "상계주공9단지", fact: "거래1위·평단가 46위", sub: "아무거나 999", source: "ai" }, { photoHost: HOST });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.draft.sub, "서울 노원구", "클라이언트가 보낸 sub 는 무시");
    assert.equal(ok.draft.source, "ai");
  }
  assert.equal(sanitizeCoverDraft(LAB_30, { variant: "photo", headline: "상계주공9단지", fact: null }, { photoHost: HOST }).ok, false, "Lab 은 사진 변형 없음");
  assert.equal(sanitizeCoverDraft(USER_NOTE, { variant: "photo", headline: "상계주공9단지", fact: "기록 64점" }, { photoHost: HOST }).ok, true);
  assert.equal(sanitizeCoverDraft(LAB_30, { variant: "navy", headline: "상계주공9단지", fact: "평단가 1위" }, { photoHost: HOST }).ok, true, "1 은 원문에 있다(거래1위)");
  assert.equal(sanitizeCoverDraft(LAB_30, { variant: "navy", headline: "상계주공9단지", fact: "평단가 45위" }, { photoHost: HOST }).ok, false);
  assert.equal(sanitizeCoverDraft(LAB_30, { variant: "rainbow", headline: "상계주공9단지" }, { photoHost: HOST }).ok, false);
  assert.equal(sanitizeCoverDraft(LAB_30, null).ok, false);
});

test("metadata 병합 — cover 만 바뀌고 다른 키는 그대로", () => {
  const spec = toCoverSpec({ variant: "navy", headline: "상계주공9단지", fact: null, sub: "서울 노원구", source: "rule" }, "2026-09-27T00:00:00.000Z");
  const before = LAB_30.metadata as Record<string, unknown>;
  const merged = mergeCoverIntoMetadata(before, spec);
  assert.deepEqual(merged.key_metrics, before.key_metrics);
  assert.deepEqual(merged.geo, before.geo);
  assert.equal(merged.note_no, "30");
  assert.deepEqual(merged.cover, spec);
  assert.equal("cover" in before, false, "원본을 바꾸지 않는다");
  assert.deepEqual(mergeCoverIntoMetadata(null, spec), { cover: spec });
});

test("저장값 읽기 — 모양이 어긋나면 null", () => {
  const spec: CoverSpec = { v: COVER_SPEC_VERSION, variant: "light", headline: "대치삼성", fact: "전세 9억→11억의 정체", sub: "서울 강남구", source: "rule", chosenAt: "2026-09-27T00:00:00.000Z" };
  assert.deepEqual(readCoverSpec({ cover: spec }), spec);
  assert.equal(readCoverSpec({ cover: { ...spec, v: 2 } }), null);
  assert.equal(readCoverSpec({ cover: { ...spec, variant: "gold" } }), null);
  assert.equal(readCoverSpec({ cover: { ...spec, headline: "가".repeat(15) } }), null);
  assert.equal(readCoverSpec({ cover: { ...spec, chosenAt: "어제" } }), null);
  assert.equal(readCoverSpec(null), null);
});

/* ── 목록 주소 ─────────────────────────────────────────────────────────────── */

test("목록 커버 — 고른 썸네일이 있으면 렌더 주소, 없으면 첫 사진", () => {
  assert.equal(resolveNoteCover(LAB_30, { photoHost: HOST }).url, LAB_30.photos && (LAB_30.photos as string[])[0]);
  assert.equal(resolveNoteCover(LAB_30, { photoHost: HOST }).template, false);
  const spec = toCoverSpec({ variant: "hanji", headline: "상계주공9단지", fact: "거래1위·평단가 46위", sub: "서울 노원구", source: "rule" }, "2026-09-27T00:00:00.000Z");
  const withCover = { ...LAB_30, metadata: mergeCoverIntoMetadata(LAB_30.metadata, spec) };
  const r = resolveNoteCover(withCover, { photoHost: HOST });
  assert.equal(r.template, true);
  assert.equal(r.url, coverImagePath(LAB_30.id, coverVersion(spec)));
  assert.match(r.url ?? "", /^\/api\/og\/note-cover\/11111111-1111-4111-8111-111111111111\?v=[0-9a-z]+$/);
});

test("목록 커버 — 저장 뒤 본문에서 그 숫자가 사라지면 사진으로 돌아간다", () => {
  const spec = toCoverSpec({ variant: "navy", headline: "상계주공9단지", fact: "거래1위·평단가 46위", sub: "서울 노원구", source: "rule" }, "2026-09-27T00:00:00.000Z");
  const edited = {
    ...LAB_30,
    title: "상계주공9 거래 상위(Lab #30)",
    summary: "",
    sections: [],
    metadata: mergeCoverIntoMetadata({ key_metrics: {} }, spec),
  };
  const r = resolveNoteCover(edited, { photoHost: HOST });
  assert.equal(r.template, false);
  assert.equal(r.spec, null);
});

test("그림 주소의 v — 다시 고르면(chosenAt) 바뀌고, 사진 변형은 사진이 바뀌어도 바뀐다", () => {
  const a = { variant: "navy" as const, chosenAt: "2026-09-27T00:00:00.000Z" };
  const b = { variant: "navy" as const, chosenAt: "2026-09-27T00:00:01.000Z" };
  assert.notEqual(coverVersion(a), coverVersion(b));
  assert.equal(coverVersion(a, "p1"), coverVersion(a, "p2"), "글자 템플릿은 사진과 무관");
  const p = { variant: "photo" as const, chosenAt: a.chosenAt };
  assert.notEqual(coverVersion(p, "p1"), coverVersion(p, "p2"));
});

test("사진 허용 — 우리 Supabase 스토리지 객체만(https·호스트·경로)", () => {
  assert.equal(isAllowedCoverPhoto(PHOTO, HOST), true);
  assert.equal(isAllowedCoverPhoto(`http://${HOST}/storage/v1/object/x.jpg`, HOST), false);
  assert.equal(isAllowedCoverPhoto(`https://evil.supabase.co/storage/v1/object/x.jpg`, HOST), false);
  assert.equal(isAllowedCoverPhoto(`https://${HOST}/rest/v1/inspection_notes`, HOST), false);
  assert.equal(isAllowedCoverPhoto(`https://user:pw@${HOST}/storage/v1/object/x.jpg`, HOST), false);
  assert.equal(isAllowedCoverPhoto(PHOTO, null), false, "호스트 설정이 없으면 아무것도 받지 않는다");
});

/* ── LLM 프롬프트·응답 ─────────────────────────────────────────────────────── */

test("LLM 응답 해석 — 코드 펜스·잡음을 걷고 3개까지, null 문자열은 null", () => {
  const text = '설명입니다\n```json\n{"candidates":[{"angle":"결론형","headline":"상계주공9단지","fact":"거래1위"},{"angle":"숫자형","headline":"상계주공9단지","fact":"null"},{"angle":"질문형","headline":"","fact":"x"},{"headline":"a","fact":"b"},{"headline":"c","fact":"d"}]}\n```';
  const out = parseCoverLlm(text);
  assert.equal(out.length, 3);
  assert.equal(out[0].fact, "거래1위");
  assert.equal(out[1].fact, null);
  assert.equal(out[2].headline, "a", "빈 제목 항목은 버린다");
  assert.deepEqual(parseCoverLlm("모르겠어요"), []);
  assert.deepEqual(parseCoverLlm('{"candidates":'), []);
});

test("LLM 프롬프트 — 원문(제목·요약·지표)을 싣고, 내용이 같으면 캐시 키도 같다", () => {
  const { system, user } = buildCoverPrompt(LAB_33);
  assert.match(system, /14자 이하/);
  assert.match(system, /16자 이하/);
  assert.match(system, /결론형/);
  assert.match(user, /전세10억3건 월세71%/);
  assert.match(user, /jeonse_ratio_pct/);
  assert.equal(coverPromptHash(LAB_33), coverPromptHash({ ...LAB_33 }));
  assert.notEqual(coverPromptHash(LAB_33), coverPromptHash({ ...LAB_33, summary: "다른 요약" }));
});

/* ── 백필 SQL(출력만) ──────────────────────────────────────────────────────── */

test("백필 변형 — 대각선 회전이라 3열 격자에서 가로·세로로 같은 면이 붙지 않는다", () => {
  const grid = Array.from({ length: 33 }, (_, i) => backfillVariantAt(i));
  for (let i = 0; i < grid.length; i += 1) {
    if (i % 3 !== 2 && i + 1 < grid.length) assert.notEqual(grid[i], grid[i + 1], `가로 ${i}`);
    if (i + 3 < grid.length) assert.notEqual(grid[i], grid[i + 3], `세로 ${i}`);
  }
  const counts = grid.reduce<Record<string, number>>((a, v) => ((a[v] = (a[v] ?? 0) + 1), a), {});
  assert.deepEqual(counts, { navy: 11, hanji: 11, light: 11 });
});

test("백필 — Lab·공개·커버 없는 노트만, 규칙 문구, SQL 은 따옴표를 이스케이프하고 cover 키만 바꾼다", () => {
  const rows = [
    { id: LAB_33.id, title: LAB_33.title, apt_name: LAB_33.aptName, region: LAB_33.region, summary: LAB_33.summary, sections: LAB_33.sections, author_label: "내집나우 Lab", is_public: true, created_at: "2026-09-26T00:00:00Z", metadata: LAB_33.metadata, score_location: 3, score_school: 2, score_transport: 5, score_facility: 3, score_future: 3 },
    { id: LAB_30.id, title: "상계주공9 거래1위·평단가 46위(Lab #30)", apt_name: "상계주공9단지", region: "서울 노원구", summary: LAB_30.summary, author_label: "내집나우 Lab", is_public: true, created_at: "2026-09-25T00:00:00Z", metadata: LAB_30.metadata },
    { id: "33333333-3333-4333-8333-333333333333", title: "목동: 서울시가 '보류'를 찍었다 (Lab #7)", apt_name: "목동", region: "서울 양천구", author_label: "내집나우 Lab", is_public: true, created_at: "2026-09-01T00:00:00Z", metadata: {} },
    { id: USER_NOTE.id, title: USER_NOTE.title, apt_name: "상계주공9단지", region: "서울 노원구", author_label: "민지", is_public: true, created_at: "2026-09-27T00:00:00Z", metadata: {} },
    { id: "44444444-4444-4444-8444-444444444444", title: "(Lab #2) 이미 있음", apt_name: "x", author_label: "내집나우 Lab", is_public: true, created_at: "2026-09-02T00:00:00Z", metadata: { cover: { v: 1 } } },
    { id: "not-a-uuid", title: "(Lab #9)", author_label: "내집나우 Lab", is_public: true },
  ];
  const plan = planBackfill(rows, { chosenAt: "2026-09-27T00:00:00.000Z" });
  assert.deepEqual(plan.items.map((i) => i.id), [LAB_33.id, LAB_30.id, "33333333-3333-4333-8333-333333333333"], "최신순");
  assert.deepEqual(plan.items.map((i) => i.spec.variant), ["navy", "hanji", "light"]);
  assert.equal(plan.items[0].spec.fact, "전세10억3건 월세71%");
  assert.equal(plan.items[1].spec.fact, "거래1위·평단가 46위");
  assert.ok(plan.items.every((i) => i.spec.source === "rule" && i.spec.chosenAt === "2026-09-27T00:00:00.000Z"));
  assert.equal(plan.skipped.length, 3, "사람 노트 · 이미 커버 · uuid 아님");

  const sql = backfillSql(plan);
  assert.equal((sql.match(/^update public\.inspection_notes$/gm) ?? []).length, 3);
  assert.match(sql, /'\{cover\}'/);
  assert.match(sql, /and \(metadata -> 'cover'\) is null/);
  assert.match(sql, /''보류''/, "작은따옴표는 두 번");
  assert.ok(!/updated_at/.test(sql.replace(/^--.*$/gm, "")), "updated_at 은 건드리지 않는다");
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;$/m);
  assert.ok(!/\b(delete|drop|insert|grant|alter)\b/i.test(sql.replace(/^--.*$/gm, "")), "UPDATE 말고는 없다");
});
