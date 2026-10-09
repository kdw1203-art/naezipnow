/* [1052] 단지 위치 지도 · 마이 사용량 표 · 성장(가입 경로 · 관심 등록 대기 · IndexNow) 다듬기.
 *
 * 잠그는 사실:
 *  M1 Overpass 가 200 + remark(시간 초과 등)로 답하면 실패(던진다 → 30일 캐시에 안 남는다) · 한 곳 4.5초 · 전체 9초.
 *  M2 반경 원은 같은 값이면 같은 객체(useMemo) · 지도 key 는 media 를 담는다.
 *  M3 실패 뒤 "다시 불러오기" · 못 읽은 원천 숫자는 "—" · "크게 보기"는 폰 40px.
 *  M4 닮음 점수 없으면 "주변 단지 · 가까운 순" · 0.3 미만은 뺀다 · 거리는 "직선".
 *  Y2 사용량 표는 줄마다 기간(이번 달 · 누적 · 보유) · 월 줄은 초기화 날짜 · "이번 달" = 한국 시간 달.
 *  G1 가입 경로 잇기: 계정별(이메일 해시) 끝남 표시 · 2xx/4xx 끝 · 네트워크/5xx 는 탭당 한 번 더 · 이메일 원문 저장 없음.
 *  G2 관심 등록 가입 창을 닫으면 대기 기록을 지운다.
 *  G4 IndexNow 단지: 새로 들어온 순 · 상한에 닿으면 truncated. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SIMILARITY_MIN,
  areaLayerCount,
  formatStraightDistance,
  mergeAreaData,
  overpassFailure,
  overpassQuery,
  pickSimilarComplexes,
  similarLayerLabel,
  similarView,
  walkMinutesAtLeast,
  type AreaComplex,
  type AreaData,
} from "@/lib/map/area-pick";
import {
  formatResetLabel,
  kstMonthStart,
  kstNextMonthStart,
  usagePeriodFor,
  usagePeriodLabel,
  usagePeriodNote,
} from "@/lib/subscriptions/usage-period";
import {
  ATTR_DONE_PREFIX,
  ATTR_MAX_TRIES_PER_TAB,
  ATTR_TRY_PREFIX,
  attributionOutcome,
  claimAttributionAttempt,
  emailMarker,
  recordAttributionOutcome,
} from "@/lib/growth/attribution-retry";
import {
  PENDING_WATCH_ACTION,
  PENDING_WATCH_KEY,
  clearPendingWatch,
  hasPendingWatch,
  savePendingWatch,
} from "@/lib/client/pending-watch";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const C = { lat: 37.3943, lng: 126.9568 };

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}

/* ── MAP ───────────────────────────────────────────────────────────────── */

test("M1 overpassFailure — 200 + remark(시간 초과·메모리) · elements 없음은 실패, 정상은 null", () => {
  assert.equal(overpassFailure({ elements: [] }), null, "빈 결과(정말 0곳)는 실패가 아니다");
  assert.equal(overpassFailure({ elements: [{ type: "node" }] }), null);
  assert.match(
    overpassFailure({ elements: [], remark: 'runtime error: Query timed out in "query" at line 1 after 4 seconds.' }) ?? "",
    /timed out/,
  );
  assert.ok(overpassFailure({ elements: [{}], remark: "runtime error: Query run out of memory using about 2048 MB of RAM." }));
  assert.ok(overpassFailure({ remark: "x" }), "elements 없는 응답");
  assert.ok(overpassFailure(null));
  assert.ok(overpassFailure("<html>"));
  assert.equal(overpassFailure({ elements: [], remark: "note: nothing to see" }), null, "오류가 아닌 remark 는 그대로");
});

test("M1 Overpass 대기 — 서버 한도 4초 < 한 곳 4.5초 · 전체 9초 · 실패는 던져 캐시에 남기지 않는다", () => {
  const q = overpassQuery(C.lat, C.lng);
  assert.match(q, /^\[out:json\]\[timeout:4\];/);
  assert.match(q, /out center 80;$/, "응답 크기 상한은 그대로(80개)");
  const load = code("lib/map/area-load.ts");
  const ms = (name: string) => Number((load.match(new RegExp(`const ${name} = ([\\d_]+);`))?.[1] ?? "NaN").replace(/_/g, ""));
  assert.equal(ms("OVERPASS_TIMEOUT_MS"), 4_500);
  assert.equal(ms("OVERPASS_BUDGET_MS"), 9_000);
  assert.ok(ms("OVERPASS_BUDGET_MS") < 3 * 7_000, "예전 최악 21초보다 짧다");
  assert.ok(4_000 < ms("OVERPASS_TIMEOUT_MS"), "서버가 먼저 시간 초과를 알린다");
  assert.match(load, /AbortSignal\.any\(\[AbortSignal\.timeout\(OVERPASS_TIMEOUT_MS\), budget\]\)/);
  assert.match(load, /const failure = overpassFailure\(json\);\s*if \(failure\) throw new Error\(failure\);/);
  assert.match(load, /\["area-osm-v2"\]/, "v1 캐시의 '0곳' 결과를 버린다");
});

const cx = (name: string, distanceM: number, similarity: number | null): AreaComplex => ({
  name,
  regionName: "안양 동안구",
  lat: C.lat,
  lng: C.lng,
  distanceM,
  avgPerPyeongKrw: null,
  buildYear: null,
  households: null,
  similarity,
});

test("M4 similarView — 점수 있으면 '유사 단지'(0.3 미만·점수 없음 제외) · 없으면 '주변 단지'(가까운 순 그대로)", () => {
  assert.equal(SIMILARITY_MIN, 0.3);
  const scored = similarView([cx("닮은", 300, 0.91), cx("경계", 400, 0.3), cx("덜 닮은", 200, 0.29), cx("모름", 100, null)]);
  assert.equal(scored.basis, "similar");
  assert.deepEqual(scored.items.map((c) => c.name), ["닮은", "경계"]);
  const near = similarView([cx("가", 100, null), cx("나", 300, null)]);
  assert.equal(near.basis, "nearest");
  assert.deepEqual(near.items.map((c) => c.name), ["가", "나"]);
  assert.equal(similarLayerLabel("similar"), "유사 단지");
  assert.equal(similarLayerLabel("nearest"), "주변 단지");
  /* 실제 고르기와 이어서 — 평당가가 두 배인 "가까운 비싼"(닮음 0)은 유사 단지로 올리지 않는다 */
  const row = (name: string, dLat: number, price: number | null, year: number | null) => ({
    regionName: "안양 동안구",
    complexName: name,
    lat: C.lat + dLat,
    lng: C.lng,
    avgPerPyeongKrw: price,
    buildYear: year,
    households: null,
  });
  const picked = pickSimilarComplexes(
    [row("공작아파트", 0, 40_000_000, 1993), row("가까운 비싼", 0.001, 80_000_000, 2020), row("닮은", 0.004, 41_000_000, 1994)],
    { name: "공작 아파트", lat: C.lat, lng: C.lng },
  );
  assert.deepEqual(similarView(picked).items.map((c) => c.name), ["닮은"]);
});

const area = (over: Partial<AreaData> = {}): AreaData => ({
  center: C,
  radiusM: 1000,
  similar: [cx("닮은", 300, 0.9), cx("먼 닮은", 800, 0.8), cx("덜 닮은", 200, 0.1)],
  stations: [{ name: "평촌역", lat: C.lat, lng: C.lng, distanceM: 450, line: null }],
  offices: [],
  missing: [],
  ...over,
});

test("M3 areaLayerCount — 읽는 중 null · 못 읽은 원천은 '—'(0 아님) · 반경 안 · 유사 단지는 걸러진 수", () => {
  assert.equal(areaLayerCount(null, "similar", 1000), null);
  assert.equal(areaLayerCount(area(), "similar", 1000), "2", "덜 닮은(0.1)은 세지 않는다");
  assert.equal(areaLayerCount(area(), "similar", 500), "1");
  assert.equal(areaLayerCount(area(), "stations", 500), "1");
  assert.equal(areaLayerCount(area(), "offices", 1000), "0", "읽었고 없으면 0");
  const noSimilar = area({ similar: [], missing: ["similar"] });
  assert.equal(areaLayerCount(noSimilar, "similar", 1000), "—");
  assert.equal(areaLayerCount(noSimilar, "stations", 1000), "1");
  const noOsm = area({ stations: [], offices: [], missing: ["osm"] });
  assert.equal(areaLayerCount(noOsm, "stations", 1000), "—");
  assert.equal(areaLayerCount(noOsm, "offices", 1000), "—");
  assert.equal(areaLayerCount(noOsm, "similar", 1000), "2");
});

test("M3 mergeAreaData — 다시 불러온 응답과 합칠 때 원천별로 읽은 쪽을 남긴다", () => {
  const first = area({ stations: [], offices: [], missing: ["osm"] });
  const retry = area({ similar: [], missing: ["similar"] });
  const merged = mergeAreaData(first, retry);
  assert.deepEqual(merged.missing, []);
  assert.equal(merged.similar.length, 3, "처음 읽은 유사 단지를 지우지 않는다");
  assert.equal(merged.stations.length, 1);
  assert.equal(mergeAreaData(null, retry), retry);
  const bothFail = mergeAreaData(area({ similar: [], stations: [], missing: ["similar", "osm"] }), area({ similar: [], stations: [], missing: ["similar", "osm"] }));
  assert.deepEqual(bothFail.missing, ["similar", "osm"]);
});

test("M4 거리 표기 — 직선 · 도보는 '이상'", () => {
  assert.equal(formatStraightDistance(450), "직선 450m");
  assert.equal(formatStraightDistance(1234), "직선 1.2km");
  assert.equal(walkMinutesAtLeast(450), "도보 6분 이상");
  assert.equal(walkMinutesAtLeast(10), "도보 1분 이상");
});

test("M2·M3·M4 지도 카드 — 원 useMemo · key 에 media · 다시 불러오기 · 40px · 정직한 이름표", () => {
  const raw = read("app/complex/[id]/ComplexAreaMap.tsx");
  const map = code("app/complex/[id]/ComplexAreaMap.tsx");
  assert.match(map, /const circle = useMemo\(\(\) => \(\{ lat, lng, radiusM: radius \}\), \[lat, lng, radius\]\);/);
  assert.match(map, /circle=\{circle\}/);
  assert.doesNotMatch(map, /circle=\{\{/, "렌더마다 새 원 객체를 넘기지 않는다");
  assert.match(map, /key=\{`\$\{media\}-\$\{radius\}`\}/);
  assert.match(map, /id=\{`area-map-title-\$\{media\}`\}/);
  /* 다시 불러오기 */
  assert.match(map, /\{showRetry && \(\s*<button\s+type="button"\s+onClick=\{reload\}/);
  assert.match(map, /const showRetry = failed \|\| missingSimilar \|\| missingOsm;/);
  assert.match(map, /areaUrl\(lat, lng, name, buildYear, `m\$\{n\}`\)/, "손 재시도는 실패 응답 캐시 칸을 피한다");
  assert.match(map, /setData\(\(prev\) => mergeAreaData\(prev, d\)\)/);
  /* 폰 40px · 데스크톱 24px */
  assert.match(map, /className="inline-flex min-h-\[40px\] items-center gap-1 t-sub font-bold text-primary no-underline lg:min-h-6"/);
  assert.match(map, /className="inline-flex min-h-\[40px\] items-center gap-1 t-sub font-bold text-primary disabled:text-text-3 lg:min-h-6"/);
  assert.doesNotMatch(map, /min-h-6 items-center gap-1 t-sub font-bold text-primary no-underline"/);
  /* 이름표 */
  assert.match(map, /for \(const c of similar\.items\)/, "지도 핀도 걸러진 목록");
  assert.match(map, /주변 단지 = 가까운 순/);
  assert.match(map, /거리는 직선 거리/);
  assert.match(map, /formatStraightDistance\(nearestStation\.distanceM\)/);
  assert.match(map, /© OpenStreetMap 기여자/);
  /* 디자인 규칙 */
  assert.doesNotMatch(raw, /text-\[\d+px\]|font-extrabold|btn-primary|bg-gradient/);
  assert.doesNotMatch(raw, /해 보세요|!"/);
  assert.match(map, /<Icon name="repeat"/);
});

/* ── MY PAGE ───────────────────────────────────────────────────────────── */

test("Y2 한국 시간 달 — 10/31 16:00Z(=11/1 01:00 KST) 실행은 11월로 센다", () => {
  const run = "2026-10-31T16:00:00.000Z";
  const since = kstMonthStart(run);
  assert.equal(since.toISOString(), "2026-10-31T15:00:00.000Z");
  assert.ok(run >= since.toISOString(), "11월 한도에 들어간다");
  assert.equal(kstMonthStart("2026-10-31T14:59:59.000Z").toISOString(), "2026-09-30T15:00:00.000Z", "아직 10월(KST)");
  assert.ok(!("2026-10-31T14:30:00.000Z" >= kstMonthStart("2026-11-01T02:00:00.000Z").toISOString()), "10월 31일 23:30 KST 실행은 11월에 안 센다");
  assert.equal(kstNextMonthStart("2026-10-09T03:00:00.000Z").toISOString(), "2026-10-31T15:00:00.000Z");
  assert.equal(kstNextMonthStart("2026-12-31T15:30:00.000Z").toISOString(), "2027-01-31T15:00:00.000Z", "해 넘김");
  assert.equal(formatResetLabel("2026-10-31T15:00:00.000Z"), "11월 1일 초기화");
  assert.equal(formatResetLabel("2026-12-31T15:00:00.000Z"), "1월 1일 초기화");
  assert.equal(formatResetLabel("x"), "");
  assert.equal(formatResetLabel(undefined), "");
});

test("Y2 줄마다 기간 — AI(이번 달/누적) · 북마크·관심 단지(보유)", () => {
  assert.equal(usagePeriodFor("ai_analysis", false), "month");
  assert.equal(usagePeriodFor("ai_analysis", true), "lifetime");
  assert.equal(usagePeriodFor("bookmark", false), "current");
  assert.equal(usagePeriodFor("interest_complex", false), "current");
  assert.deepEqual(["month", "lifetime", "current"].map((p) => usagePeriodLabel(p as "month")), ["이번 달", "누적", "보유"]);
  assert.equal(usagePeriodNote("month", "2026-10-31T15:00:00.000Z"), "이번 달 · 11월 1일 초기화");
  assert.equal(usagePeriodNote("month"), "이번 달");
  assert.equal(usagePeriodNote("lifetime"), "누적 · 초기화 없음");
  assert.equal(usagePeriodNote("current", "2026-10-31T15:00:00.000Z"), "보유", "보유 줄엔 초기화 날짜를 적지 않는다");
});

test("Y2 소스 — 한도 셈 · 요약 · 마이 표가 같은 기간 규칙을 쓴다", () => {
  const store = code("lib/ai/presets-store.ts");
  const fn = store.slice(store.indexOf("export async function countRunsThisMonth"), store.indexOf("export async function countRunsTotal"));
  assert.match(fn, /const since = kstMonthStart\(\)\.toISOString\(\);/);
  assert.doesNotMatch(fn, /setDate\(1\)|setHours\(0/, "서버 시간대 달 시작을 쓰지 않는다");
  const sum = code("lib/subscriptions/usage-summary.ts");
  assert.equal((sum.match(/withPeriod\(\{/g) ?? []).length, 3, "세 줄 모두 기간을 단다");
  assert.match(sum, /period === "month" && item\.limit != null \? \{ resetsAt: kstNextMonthStart\(now\)\.toISOString\(\) \}/);
  const view = code("app/my/MyHubView.tsx");
  assert.match(view, /usagePeriodNote\(period, r\.resetsAt\)/);
  assert.match(view, /<span className="t-sub font-bold text-ink">사용량<\/span>/);
  assert.doesNotMatch(view, /"이번 달 사용량"/, "표 제목 하나로 세 줄의 기간을 말하지 않는다");
  assert.match(code("app/my/page.tsx"), /\.\.\.\(i\.resetsAt \? \{ resetsAt: i\.resetsAt \} : \{\}\)/);
});

/* ── GROWTH ────────────────────────────────────────────────────────────── */

test("G1 attributionOutcome — 2xx·4xx 끝 · 401 은 이 탭만 멈춤 · 네트워크·5xx·408·429 는 다시", () => {
  assert.equal(attributionOutcome(200), "done");
  assert.equal(attributionOutcome(204), "done");
  assert.equal(attributionOutcome(400), "done");
  assert.equal(attributionOutcome(404), "done");
  assert.equal(attributionOutcome(401), "stop");
  assert.equal(attributionOutcome(null), "retry");
  assert.equal(attributionOutcome(500), "retry");
  assert.equal(attributionOutcome(503), "retry");
  assert.equal(attributionOutcome(429), "retry");
  assert.equal(attributionOutcome(408), "retry");
});

test("G1 emailMarker — 이메일 해시(32자 hex) · 대소문자·공백 무시 · 원문이 드러나지 않는다", async () => {
  const a = await emailMarker("Kim@Example.com ");
  const b = await emailMarker("kim@example.com");
  const c = await emailMarker("lee@example.com");
  assert.ok(a && /^[0-9a-f]{32}$/.test(a), String(a));
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(!a.includes("kim"));
  assert.equal(await emailMarker(""), null);
  assert.equal(await emailMarker(null), null);
  /* Web Crypto 가 없는 환경 — 대체 해시(16자 hex)로도 같은 규칙 */
  const desc = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  if (desc?.configurable) {
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true, writable: true });
    try {
      const f1 = await emailMarker("Kim@Example.com");
      const f2 = await emailMarker("kim@example.com");
      assert.ok(f1 && /^[0-9a-f]{16}$/.test(f1), String(f1));
      assert.equal(f1, f2);
    } finally {
      Object.defineProperty(globalThis, "crypto", desc);
    }
  }
});

test("G1 다시 묻기 — 실패는 탭당 한 번 더 · 끝은 계정별로 영구 · 저장소엔 이메일 원문 없음", async () => {
  const local = memStorage();
  let tab = memStorage();
  const m = (await emailMarker("kim@example.com")) as string;
  assert.equal(claimAttributionAttempt(m, local, tab), true, "첫 시도");
  recordAttributionOutcome(m, attributionOutcome(503), local, tab);
  assert.equal(claimAttributionAttempt(m, local, tab), true, "5xx 뒤 한 번 더");
  recordAttributionOutcome(m, attributionOutcome(null), local, tab);
  assert.equal(claimAttributionAttempt(m, local, tab), false, `이 탭에서는 ${ATTR_MAX_TRIES_PER_TAB}번까지`);
  tab = memStorage();
  assert.equal(claimAttributionAttempt(m, local, tab), true, "새 탭 세션에서 다시");
  recordAttributionOutcome(m, attributionOutcome(400), local, tab);
  assert.equal(local.getItem(ATTR_DONE_PREFIX + m), "1", "4xx = 끝");
  assert.equal(claimAttributionAttempt(m, local, memStorage()), false, "끝난 계정은 어느 탭에서도 다시 안 보낸다");
  /* 같은 브라우저의 다른 계정은 따로 */
  const other = (await emailMarker("lee@example.com")) as string;
  assert.equal(claimAttributionAttempt(other, local, tab), true);
  recordAttributionOutcome(other, attributionOutcome(401), local, tab);
  assert.equal(claimAttributionAttempt(other, local, tab), false, "401 은 이 탭에서 멈춘다");
  assert.equal(local.getItem(ATTR_DONE_PREFIX + other), null, "401 은 끝이 아니다");
  assert.equal(claimAttributionAttempt(other, local, memStorage()), true, "다음 탭에서 다시");
  for (const s of [local, tab]) {
    for (const [k, v] of s.raw) assert.ok(!k.includes("@") && !v.includes("@") && !k.includes("example"), `${k}=${v}`);
  }
  assert.ok([...tab.raw.keys()].every((k) => k.startsWith(ATTR_TRY_PREFIX)));
  assert.equal(claimAttributionAttempt(m, null, tab), false, "저장소가 없으면 보내지 않는다(끝을 적을 곳이 없다)");
});

test("G1 TrafficRecorder — 동의 뒤 · 로그인 뒤 · 계정 해시로 묻고 · 결과를 규칙대로 적는다", () => {
  const src = code("app/components/TrafficRecorder.tsx");
  const i = src.indexOf('fetch("/api/me/attribution"');
  assert.ok(i > 0);
  const effect = src.slice(src.lastIndexOf("useEffect(", i), src.indexOf("}, [consented, pathname]);", i));
  assert.match(effect, /if \(!consented\) return;/);
  assert.match(effect, /s\?\.user\?\.email/);
  assert.match(effect, /const marker = await emailMarker\(s\.user\.email\);/);
  assert.match(effect, /if \(!claimAttributionAttempt\(marker, local, session\)\) return;/);
  assert.match(effect, /recordAttributionOutcome\(marker, attributionOutcome\(r\.status\), local, session\)/);
  assert.match(effect, /recordAttributionOutcome\(marker, attributionOutcome\(null\), local, session\)/);
  assert.match(effect, /if \(attrInFlight\.current\) return;/, "보내는 중엔 겹쳐 보내지 않는다");
  assert.doesNotMatch(src, /setItem\([^)]*email/i, "이메일 원문을 저장소에 쓰지 않는다");
  assert.doesNotMatch(src, /\bATTR_DONE_KEY\b/, "브라우저 하나에 끝남 하나(계정 구분 없음)는 없앴다");
});

test("G2 관심 등록 가입 창을 닫으면 대기 기록을 지운다", () => {
  const s = memStorage();
  savePendingWatch("seoul-a", "가단지", s, 1_000);
  assert.equal(hasPendingWatch("seoul-a", s, 2_000), true);
  clearPendingWatch(s);
  assert.equal(hasPendingWatch("seoul-a", s, 2_000), false);
  assert.equal(s.raw.has(PENDING_WATCH_KEY), false);
  clearPendingWatch(null);
  const throwing = { getItem: () => null, setItem: () => undefined, removeItem: () => { throw new Error("blocked"); } };
  clearPendingWatch(throwing);
  assert.equal(PENDING_WATCH_ACTION, "watchlist_add");
  assert.match(code("app/complex/[id]/hub-client.tsx"), /action: "watchlist_add"/, "가입 창 행동 이름이 같아야 지운다");
  const provider = code("app/components/soft-signup/SoftSignupProvider.tsx");
  const dismiss = provider.slice(provider.indexOf("const dismiss = useCallback"), provider.indexOf("useEffect(", provider.indexOf("const dismiss = useCallback")));
  /* 뒷정리는 부르는 쪽이 넘긴다(onDismiss) — Provider 는 모든 화면 레이아웃이라 pending-watch 를 직접 import 하지 않는다 */
  assert.match(dismiss, /cur\.onDismiss\?\.\(\);/);
  assert.doesNotMatch(provider, /from "@\/lib\/client\/pending-watch"/);
  assert.match(code("app/complex/[id]/hub-client.tsx"), /action: "watchlist_add",[\s\S]{0,600}onDismiss: \(\) => clearPendingWatch\(\),/);
  assert.match(provider, /aria-label="닫기"\s+onClick=\{dismiss\}/, "바깥 누르기도 같은 닫기");
  assert.match(provider, /if \(e\.key === "Escape"\) dismiss\(\);/);
});

test("G4 IndexNow 단지 — 새로 들어온 순으로 읽고 · 상한에 닿으면 truncated 를 돌려주고 남긴다", () => {
  const lib = code("lib/seo/indexnow-complexes.ts");
  const iOrder = lib.indexOf('.order("created_at", { ascending: false })');
  assert.ok(iOrder > 0);
  assert.ok(iOrder < lib.indexOf(".limit(READ_LIMIT)"), "자르기 전에 정렬");
  assert.match(lib, /const truncated = rows\.length >= READ_LIMIT;/);
  assert.match(lib, /if \(truncated\) \{\s*logger\.warn\(/);
  assert.match(lib, /rows: rows\.length, truncated \}/);
  assert.match(lib, /truncated: boolean;/);
});
