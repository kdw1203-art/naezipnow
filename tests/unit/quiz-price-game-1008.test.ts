import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QUIZ_BUCKET_QUOTA,
  addDaysIso,
  areaLabel,
  buildQuizChain,
  compareFact,
  hashSeed,
  isCorrectGuess,
  kstDateOf,
  mulberry32,
  parseQuizStore,
  pickQuizCandidates,
  priceGap,
  quizScoreMessage,
  quizShareText,
  quizWindow,
  recordQuizResult,
  regionBucket,
  seededShuffle,
  shiftYm,
  ymDotLabel,
  type QuizCandidate,
} from "@/lib/quiz/price-game";
import { formatEokMan } from "@/lib/format/eok-man";

/* [1008 · Q] 실거래가 게임 규칙 — 숫자는 테스트용 가짜(운영 데이터를 박지 않는다). */

test("[1008·Q] regionBucket — 실거래 region_name 표기 그대로 서울·경기·광역시·그 외", () => {
  assert.equal(regionBucket("서울 관악구"), "seoul");
  assert.equal(regionBucket("부산 남구"), "metro");
  assert.equal(regionBucket("인천 서해구"), "metro");
  assert.equal(regionBucket("광주 북구"), "metro"); // 광주광역시(두 낱말)
  assert.equal(regionBucket("광주시"), "gyeonggi"); // 경기 광주시(한 낱말)
  assert.equal(regionBucket("세종시"), "metro");
  assert.equal(regionBucket("안양 동안구"), "gyeonggi");
  assert.equal(regionBucket("화성 동탄구"), "gyeonggi");
  assert.equal(regionBucket("남양주시"), "gyeonggi");
  assert.equal(regionBucket("양평군"), "gyeonggi");
  assert.equal(regionBucket("전주 덕진구"), "other");
  assert.equal(regionBucket("창원 성산구"), "other");
  assert.equal(regionBucket("사천시"), "other");
});

test("[1008·Q] 시드 — 같은 문자열은 같은 수열, 날짜가 다르면 다른 수열", () => {
  const r1 = mulberry32(hashSeed("nz-quiz:2026-09-21"));
  const r2 = mulberry32(hashSeed("nz-quiz:2026-09-21"));
  const r3 = mulberry32(hashSeed("nz-quiz:2026-09-22"));
  const s1 = [r1(), r1(), r1()];
  assert.deepEqual(s1, [r2(), r2(), r2()]);
  assert.notDeepEqual(s1, [r3(), r3(), r3()]);
  for (const v of s1) assert.ok(v >= 0 && v < 1);
  const shuffled = seededShuffle([1, 2, 3, 4, 5], mulberry32(7));
  assert.deepEqual([...shuffled].sort(), [1, 2, 3, 4, 5]);
});

function fakeRows(): QuizCandidate[] {
  const rows: QuizCandidate[] = [];
  const regions = ["서울 강남구", "서울 마포구", "수원 영통구", "고양 일산동구", "부산 해운대구", "대구 수성구", "청주 흥덕구", "전주 완산구"];
  for (const r of regions) for (let i = 0; i < 12; i++) rows.push({ region: r, name: `${r.split(" ")[1]}단지${i}` });
  return rows;
}

test("[1008·Q] pickQuizCandidates — 날짜가 같으면 입력 순서와 무관하게 같은 풀, 할당량대로 섞인다", () => {
  const rows = fakeRows();
  const a = pickQuizCandidates(rows, "2026-09-21");
  const b = pickQuizCandidates([...rows].reverse(), "2026-09-21");
  assert.deepEqual(a.primary, b.primary);
  assert.equal(a.primary.length, 22);
  const count = (bucket: string) => a.primary.filter((c) => regionBucket(c.region) === bucket).length;
  assert.equal(count("seoul"), QUIZ_BUCKET_QUOTA.seoul);
  assert.equal(count("gyeonggi"), QUIZ_BUCKET_QUOTA.gyeonggi);
  assert.equal(count("metro"), QUIZ_BUCKET_QUOTA.metro);
  assert.equal(count("other"), QUIZ_BUCKET_QUOTA.other);
  const c = pickQuizCandidates(rows, "2026-09-22");
  assert.notDeepEqual(a.primary, c.primary);
  // 예비 순서는 풀과 겹치지 않는다
  const keys = new Set(a.primary.map((x) => `${x.region}|${x.name}`));
  assert.ok(a.reserve.every((x) => !keys.has(`${x.region}|${x.name}`)));
});

test("[1008·Q] pickQuizCandidates — 같은 이름은 하루 한 번, 모자란 버킷은 남은 후보로 채운다", () => {
  const rows: QuizCandidate[] = [
    ...Array.from({ length: 20 }, (_, i) => ({ region: "서울 중구", name: `단지${i}` })),
    { region: "서울 중구", name: "롯데 캐슬" },
    { region: "서울 양천구", name: "롯데캐슬" },
    ...Array.from({ length: 10 }, (_, i) => ({ region: "수원 영통구", name: `경기${i}` })),
  ];
  const { primary } = pickQuizCandidates(rows, "2026-09-21");
  const names = primary.map((c) => c.name.replace(/\s+/g, ""));
  assert.equal(new Set(names).size, names.length);
  // 광역시·그 외가 0곳이라 9자리가 서울·경기 남은 후보로 채워진다
  assert.equal(primary.length, 22);
});

test("[1008·Q] buildQuizChain — ±3% 이내 이웃은 그 자리에 쓰지 않고 뒤로 미룬다", () => {
  const e = (name: string, p: number) => ({ name, priceManwon: p });
  const chain = buildQuizChain([e("a", 100000), e("b", 102000), e("c", 60000), e("d", 61000), e("e", 90000)], 10);
  assert.deepEqual(
    chain.map((x) => x.name),
    ["a", "c", "b", "d", "e"],
  );
  for (let i = 1; i < chain.length; i++) assert.ok(priceGap(chain[i - 1].priceManwon, chain[i].priceManwon) > 0.03);
  // 라운드 수 + 1 에서 멈춘다
  const many = Array.from({ length: 30 }, (_, i) => e(`x${i}`, 10000 * (i % 2 === 0 ? 1 : 2) + i));
  assert.equal(buildQuizChain(many, 10).length, 11);
  // 가격 없는 항목은 버린다
  assert.equal(buildQuizChain([e("z", 0), e("y", Number.NaN)], 10).length, 0);
});

test("[1008·Q] 채점·해설 — 더 비싸요/더 싸요, 차이 금액과 %", () => {
  assert.equal(isCorrectGuess(100000, 132000, "higher"), true);
  assert.equal(isCorrectGuess(100000, 132000, "lower"), false);
  assert.equal(isCorrectGuess(100000, 80000, "lower"), true);
  assert.deepEqual(compareFact(100000, 132000), { direction: "higher", diffManwon: 32000, pct: 32 });
  assert.deepEqual(compareFact(110500, 74300), { direction: "lower", diffManwon: 36200, pct: 33 });
});

test("[1008·Q] 날짜·창 — KST 자정 경계와 12개월 창", () => {
  // 2026-09-21 14:59:59Z = KST 23:59:59 → 21일, 15:00Z = KST 22일 0시
  assert.equal(kstDateOf(Date.UTC(2026, 8, 21, 14, 59, 59)), "2026-09-21");
  assert.equal(kstDateOf(Date.UTC(2026, 8, 21, 15, 0, 0)), "2026-09-22");
  assert.equal(addDaysIso("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftYm("202609", -11), "202510");
  assert.equal(shiftYm("202601", -1), "202512");
  assert.equal(shiftYm("202612", 1), "202701");
  assert.deepEqual(quizWindow("2026-09-21"), { fromYm: "202510", toYm: "202609" });
  assert.equal(ymDotLabel("202608"), "2026.08");
  assert.equal(areaLabel(84.9477), "84.94");
  assert.equal(areaLabel(82.2), "82.2");
});

test("[1008·Q] 기록 — 첫 판만 남기고 최고 기록은 점수·연속 순으로 갱신, 깨진 저장값은 빈 기록", () => {
  assert.deepEqual(parseQuizStore(null), { days: {}, best: null });
  assert.deepEqual(parseQuizStore("{not json"), { days: {}, best: null });
  assert.deepEqual(parseQuizStore(JSON.stringify({ days: { "2026-09-21": { score: "x" } } })), { days: {}, best: null });
  let s = parseQuizStore(null);
  s = recordQuizResult(s, "2026-09-20", { score: 6, total: 10, streak: 3 });
  s = recordQuizResult(s, "2026-09-21", { score: 8, total: 10, streak: 4 });
  const again = recordQuizResult(s, "2026-09-21", { score: 10, total: 10, streak: 10 });
  assert.equal(again, s); // 같은 날 두 번째 판은 기록을 바꾸지 않는다
  assert.deepEqual(s.best, { score: 8, total: 10, streak: 4, date: "2026-09-21" });
  const round = parseQuizStore(JSON.stringify(s));
  assert.deepEqual(round, s);
});

test("[1008·Q] 공유 문구 — 점수만, 단지명·개인정보 없음 · 다시 풀기는 그렇게 적는다", () => {
  const t = quizShareText("2026-09-21", { score: 7, total: 10, streak: 4 });
  assert.equal(t, "내집나우 실거래가 게임 9월 21일 — 7/10 정답 · 최장 연속 4");
  assert.equal(
    quizShareText("2026-09-21", { score: 10, total: 10, streak: 10 }, true),
    "내집나우 실거래가 게임 9월 21일(다시 풀기) — 10/10 정답 · 최장 연속 10",
  );
});

test("[1008·Q] 리뷰 C — 면적 표기가 부동소수 오차로 0.01 작아지지 않는다(게임 면적 범위 전수)", () => {
  // 예전: 80.07 → "80.06", 80.1 → "80.09", 81.6 → "81.59"
  assert.equal(areaLabel(80.07), "80.07");
  assert.equal(areaLabel(80.1), "80.1");
  assert.equal(areaLabel(81.6), "81.6");
  for (let i = 8_000; i <= 8_600; i++) {
    const m2 = i / 100;
    assert.equal(areaLabel(m2), String(i / 100), `${m2}`);
  }
  assert.equal(areaLabel(84.9477), "84.94"); // 셋째 자리부터는 자른다(반올림 아님)
  assert.equal(areaLabel(84.9999), "84.99");
});

test("[1008·Q] 리뷰 C — 끝 화면 한마디: 정확히 절반은 '절반 넘게'가 아니다", () => {
  assert.equal(quizScoreMessage(5, 10), "딱 절반 맞혔어요 — 내일은 한 문제 더!");
  assert.equal(quizScoreMessage(6, 10), "절반 넘게 맞혔어요");
  assert.equal(quizScoreMessage(4, 10), "어려웠죠? 오늘 본 단지를 둘러보고 내일 다시 도전해요");
  assert.equal(quizScoreMessage(8, 10), "훌륭해요 — 실거래가 감이 살아 있어요");
  assert.equal(quizScoreMessage(10, 10), "전부 맞혔어요! 실거래 감각이 대단해요");
  assert.equal(quizScoreMessage(3, 7), "어려웠죠? 오늘 본 단지를 둘러보고 내일 다시 도전해요");
  assert.equal(quizScoreMessage(4, 7), "절반 넘게 맞혔어요");
});

test("[1008·Q] formatEokMan — 신고 금액을 반올림 없이 억·만으로", () => {
  assert.equal(formatEokMan(124500), "12억 4,500만");
  assert.equal(formatEokMan(120000), "12억");
  assert.equal(formatEokMan(9800), "9,800만");
  assert.equal(formatEokMan(1234000), "123억 4,000만");
  assert.equal(formatEokMan(0), "—");
  assert.equal(formatEokMan(null), "—");
});
