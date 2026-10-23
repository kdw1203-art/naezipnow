/* [1086] 소유자 2026-10-22 — "대규모 개선" 4단계 가입·활동 전환 + (같은 때 요청) 서울 3D 동네 지도("동시에 해줘").
 *  A: 가입하던 일이 가입 뒤에 이어지게(노트 저장 · 관심 단지 · 돌아올 주소 · 관심 지역 화면) · 메일 인증 탭 · 전환 집계 정정 ·
 *     관심단지 알림 크론 500행 한계 · 공개 노트 벽 닫기·계측 · 공개 노트 카카오톡 공유.
 *  B: /map/3d — OpenFreeMap(OpenStreetMap) 벡터 타일 건물 높이 + 우리 단지(실거래 집계) 색칠 · 역 · 학교. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { RESUME_PARAM, readResume, resumeLabelFor, withResume, withoutResume } from "@/lib/onboarding/resume";
import {
  FRESH_SIGNUP_KEY,
  FRESH_SIGNUP_TTL_MS,
  claimSignupConversion,
  clearFreshSignup,
  markFreshSignup,
  peekFreshSignup,
} from "@/lib/analytics/fresh-signup";
import { batchAdvance, groupWatchRows, idleSeenAt, SEEN_MARGIN_MS, tsAfter, tsMicros } from "@/lib/notifications/watchlist-tx-plan";
import { decideNoteWall, NOTE_WALL_FREE_PER_DAY, parseNoteWallState } from "@/lib/notes/soft-wall";
import { loginReturnHref, signupReturnHref } from "@/lib/client/shell-gates";
import {
  assignBuildings,
  complexesNear,
  DEFAULT_RADIUS_M,
  distanceM,
  HIGHRISE_MIN_M,
  map3dPath,
  map3dSupported,
  medianCenter,
  priceBand,
  PRICE_BAND_LABELS,
  radiusFor,
  ringCentroid,
  type BuildingLite,
  type Map3DComplex,
} from "@/lib/map3d/geo";
import { HIDDEN_LAYER_IDS, KOREAN_NAME, complexExtrusionLayer, tuneLibertyStyle, type Map3DPalette } from "@/lib/map3d/style";
import { bandColors, mix, parseColor } from "@/lib/map3d/color";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}

/* ───────────────────────── A1 · A2 재개 표식 ───────────────────────── */

test("A1 재개 표식 — 붙이기 · 읽기 · 지우기(쿼리·해시 보존) · 모르는 값 무시", () => {
  assert.equal(RESUME_PARAM, "resume");
  assert.equal(withResume("/notes/new", "note_save"), "/notes/new?resume=note_save");
  assert.equal(withResume("/notes/new?apt=%EA%B0%9C%ED%8F%AC&region=x#top", "note_save"), "/notes/new?apt=%EA%B0%9C%ED%8F%AC&region=x&resume=note_save#top");
  assert.equal(withResume("/notes/new?resume=note_continue", "note_save"), "/notes/new?resume=note_save", "이미 있으면 바꾼다");
  assert.equal(readResume("?a=1&resume=note_save"), "note_save");
  assert.equal(readResume("resume=note_continue"), "note_continue");
  assert.equal(readResume("?resume=delete_all"), null);
  assert.equal(readResume(""), null);
  assert.equal(withoutResume("/notes/new?apt=x&resume=note_save#h"), "/notes/new?apt=x#h");
  assert.equal(withoutResume("/notes/new?resume=note_save"), "/notes/new");
  assert.equal(withResume("https://evil.example/x", "note_save"), "/?resume=note_save", "외부 주소는 받지 않는다");
});

test("A2 관심 지역 화면 — 이어서 할 일 이름(사실 낱말)", () => {
  assert.equal(resumeLabelFor(null), null);
  assert.equal(resumeLabelFor("/"), null);
  assert.equal(resumeLabelFor("/notes/new?resume=note_save"), "작성하던 임장노트 저장");
  assert.equal(resumeLabelFor("/notes/new?resume=note_continue"), "작성하던 임장노트");
  assert.equal(resumeLabelFor("/map?complexId=abc"), "지도의 그 단지");
  assert.equal(resumeLabelFor("/map"), "보던 지도");
  assert.equal(resumeLabelFor("/complex/%EA%B0%9C%ED%8F%AC"), "보던 단지");
  assert.equal(resumeLabelFor("/notes/123"), "보던 임장노트");
  assert.equal(resumeLabelFor("/dong/seoul-gangnam/%EA%B0%9C%ED%8F%AC%EB%8F%99"), "보던 동네");
  assert.equal(resumeLabelFor("/guides/x"), "보던 화면");
  const w = strip(read("app/welcome/WelcomeClient.tsx"));
  assert.match(w, /const resuming = !reentry && signupNext != null;/);
  assert.match(w, /disabled=\{\(regions\.length === 0 && !resuming\) \|\| busy\}/, "하던 화면으로 가는 사람은 지역 없이도");
  assert.match(w, /"하던 화면으로"/);
  assert.match(w, /가입 완료 · 이어서 할 일/);
});

test("A1 노트 작성 — 401 이면 초안을 바로 적고 돌아올 주소에 재개 표식 · 돌아오면 채우고 로그인일 때만 저장 한 번", () => {
  const f = strip(read("app/notes/new/NoteForm.tsx"));
  const i = f.indexOf("if (res.status === 401) {");
  const seg = f.slice(i, i + 700);
  assert.ok(seg.indexOf("writeDraft();") > 0 && seg.indexOf("writeDraft();") < seg.indexOf("promptSignup("), "초안 먼저");
  assert.match(seg, /callbackUrl: withResume\([\s\S]*?"note_save",\s*\)/);
  assert.match(f, /const resume = readResume\(window\.location\.search\);/);
  assert.match(f, /window\.history\.replaceState\(window\.history\.state, "", withoutResume\(/, "표식은 읽자마자 지운다");
  assert.match(f, /if \(action === "note_save"\) setResumeSave\(true\);/);
  assert.match(f, /if \(!authed\) \{\s*showToast\("작성하던 노트 복원 · 로그인 뒤 저장"\);\s*return;\s*\}/, "로그인 안 됐으면 다시 401 창을 띄우지 않는다");
  assert.match(f, /void handleSaveRef\.current\(\);\s*\}\);\s*\}, \[resumeSave, showToast\]\);/);
  assert.equal((f.match(/withResume\(window\.location\.pathname \+ window\.location\.search, "note_continue"\)/g) ?? []).length, 2, "사진·AI 초안 창은 채우기만");
});

/* ───────────────────────── A3 · A4 돌아올 곳 ───────────────────────── */

test("A3 지도 관심 단지 — 가입 뒤 그 단지 패널로 돌아와 한 번만 담는다", () => {
  const p = strip(read("app/map/ComplexInfoPanel.tsx"));
  assert.match(p, /savePendingWatch\(complexId, complexName\);\s*promptSignup\(\{/);
  assert.match(p, /callbackUrl: `\/map\?complexId=\$\{encodeURIComponent\(complexId\)\}`/);
  assert.match(p, /onDismiss: \(\) => clearPendingWatch\(\)/);
  assert.match(p, /if \(!j\.watching && !replayedRef\.current && takePendingWatch\(complexId\)\)/);
  assert.match(p, /if \(!opts\.replay\) askSignup\(\);/, "마저 담기 중 401 은 창을 또 띄우지 않는다");
  assert.doesNotMatch(p, /callbackUrl: "\/map"/);
});

test("A4 회원가입·로그인 링크 — 지금 화면으로 돌아오게", () => {
  assert.equal(signupReturnHref("/"), "/signup");
  assert.equal(signupReturnHref("/login"), "/signup");
  assert.equal(signupReturnHref("/complex/abc", "?tab=tx"), `/signup?callbackUrl=${encodeURIComponent("/complex/abc?tab=tx")}`);
  assert.equal(loginReturnHref("/complex/abc"), `/login?callbackUrl=${encodeURIComponent("/complex/abc")}`);
  assert.match(read("app/components/HeaderAuth.tsx"), /href=\{signupHref\}/);
  assert.match(read("app/components/MobileMenu.tsx"), /href=\{signupHref\}/);
  assert.match(read("app/components/KeywordAlertButton.tsx"), /href=\{loginHref\}/);
  assert.match(read("app/components/ReportButton.tsx"), /router\.push\(currentLoginReturnHref\(\)\)/);
  const ai = read("app/analysis/ai-note-analysis.tsx");
  assert.doesNotMatch(ai, /href="\/login"/);
  assert.equal((ai.match(/href=\{loginHref\}/g) ?? []).length, 2);
});

/* ───────────────────────── A5 관심단지 알림 크론 ───────────────────────── */

test("A5 관심단지 새 실거래 — 쪽 넘김 · 단지별 한 번 조회 · 오래된 단지 먼저 · 쓰기 묶음", () => {
  const rows = [
    { id: 1, userEmail: "a@x", complexId: "c2", complexName: "B", since: "2026-10-20T00:00:00+00:00" },
    { id: 2, userEmail: "b@x", complexId: "c1", complexName: "A", since: "2026-10-21T00:00:00+00:00" },
    { id: 3, userEmail: "c@x", complexId: "c1", complexName: "A", since: "2026-10-19T00:00:00+00:00" },
    { id: 4, userEmail: "d@x", complexId: "c3", complexName: "C", since: null },
  ];
  const g = groupWatchRows(rows);
  assert.deepEqual(g.map((x) => x.complexId), ["c3", "c1", "c2"], "기준만 세울 단지 → 고수위선 오래된 순");
  assert.equal(g[1].minSince, "2026-10-19T00:00:00+00:00");
  assert.equal(g[1].rows.length, 2);
  const start = Date.parse("2026-10-23T00:00:00Z");
  assert.equal(idleSeenAt("2026-10-01T00:00:00+00:00", start), new Date(start - SEEN_MARGIN_MS).toISOString());
  assert.equal(idleSeenAt("2026-10-22T23:55:00+00:00", start), "2026-10-22T23:55:00+00:00", "이미 더 늦으면 그대로");
  const b = batchAdvance(
    [
      { id: 1, seenAt: "x" },
      { id: 2, seenAt: "x" },
      { id: 3, seenAt: "y" },
      { id: 4, seenAt: "x" },
    ],
    2,
  );
  assert.deepEqual(b, [
    { seenAt: "x", ids: [1, 2] },
    { seenAt: "x", ids: [4] },
    { seenAt: "y", ids: [3] },
  ]);
  /* DB 는 마이크로초까지 비교한다(gt) — 같은 밀리초 안의 더 늦은 신고를 놓치지 않는다 */
  assert.ok(tsAfter("2026-10-20T03:12:45.123789+00:00", "2026-10-20T03:12:45.123456+00:00"));
  assert.ok(!tsAfter("2026-10-20T03:12:45.123456+00:00", "2026-10-20T03:12:45.123456+00:00"));
  assert.ok(tsAfter("2026-10-20T03:12:46+00:00", "2026-10-20T03:12:45.999999+00:00"));
  assert.equal(tsMicros("not a date"), null);
  const r = strip(read("app/api/cron/watchlist-new-tx/route.ts"));
  assert.match(r, /\.order\("id", \{ ascending: true \}\)\s*\.range\(from, from \+ PAGE - 1\)/);
  assert.doesNotMatch(r, /\.limit\(BATCH\)/);
  assert.match(r, /for \(const group of groupWatchRows\(rows\)\)/);
  assert.match(r, /\.in\("id", b\.ids as Array<string \| number>\)/);
  assert.ok(r.includes("관심단지 새 실거래 ${total}건"), "알림 제목(수신함 분류 규칙)은 그대로");
  assert.doesNotMatch(r, /^export (?!const (runtime|dynamic|maxDuration)\b|async function GET\b)/m, "라우트 파일은 정해진 이름만 내보낸다");
});

/* ───────────────────────── A6 공개 노트 벽 ───────────────────────── */

test("A6 공개 노트 벽 — 하루 3편 · 하루 한 번 닫기 · 닫은 노트는 다시 안 섬 · 예전 저장값 그대로", () => {
  assert.equal(NOTE_WALL_FREE_PER_DAY, 3);
  const today = "2026-10-23";
  assert.deepEqual(parseNoteWallState(JSON.stringify({ date: today, ids: ["a", "b"] }), today), { date: today, ids: ["a", "b"], passed: null });
  assert.deepEqual(parseNoteWallState(JSON.stringify({ date: "2026-10-22", ids: ["a"] }), today).ids, [], "날이 바뀌면 초기화");
  assert.deepEqual(parseNoteWallState("{깨짐", today).ids, []);
  let s = parseNoteWallState(null, today);
  for (const id of ["a", "b", "c"]) {
    const d = decideNoteWall(s, id);
    assert.equal(d.walled, false);
    assert.equal(d.write, true);
    s = d.state;
  }
  const d4 = decideNoteWall(s, "d");
  assert.equal(d4.walled, true);
  assert.equal(d4.canPass, true, "오늘 첫 벽 — 닫기 가능");
  assert.equal(decideNoteWall(s, "a").walled, false, "이미 본 노트는 다시 열린다");
  const passed = { ...s, passed: "d" };
  assert.equal(decideNoteWall(passed, "d").walled, false, "닫은 노트는 그날 다시 안 섬");
  const d5 = decideNoteWall(passed, "e");
  assert.equal(d5.walled, true);
  assert.equal(d5.canPass, false, "닫기는 하루 한 번");
  const w = read("app/notes/[id]/NoteSoftWall.tsx");
  assert.doesNotMatch(w, /linear-gradient|#ffffff|rgba\(15,23,42/, "다크 모드 흰 띠 · 손으로 적은 그림자 없음");
  for (const ev of ["note_wall_view", "note_wall_signup", "note_wall_login", "note_wall_pass"]) assert.ok(w.includes(`"${ev}"`), ev);
  assert.match(w, /sessionStorage\.setItem\("nz_signup_via", "soft:note_wall"\)/);
  assert.match(w, /이 노트만 마저 보기 · 하루 1회/);
});

/* ───────────────────────── A7 · A8 · A9 ───────────────────────── */

test("A7 공개 노트 카카오톡 공유 — 공개일 때만 · 노트 상세 번들 밖(지연 청크)", () => {
  const page = read("app/notes/[id]/page.tsx");
  assert.match(page, /\{realNote\.isPublic && \(\s*<NoteKakaoShare/);
  assert.match(page, /utm_source=kakao&utm_medium=note/);
  assert.doesNotMatch(page, /from "@\/app\/components\/KakaoShareButton"/, "페이지가 직접 import 하지 않는다");
  assert.match(read("app/notes/[id]/NoteLazyParts.tsx"), /nextDynamic\(\(\) => import\("@\/app\/components\/KakaoShareButton"\)/);
});

test("A8 가입 전환 집계 — 방금 가입한 브라우저에서만 · 표식당 한 번 · 24시간", () => {
  const st = memStorage();
  const t0 = 1_800_000_000_000;
  assert.equal(claimSignupConversion(st, t0), null, "표식 없으면 안 보낸다(관심 지역 수정 재진입)");
  markFreshSignup("google", st, t0);
  assert.equal(peekFreshSignup(st, t0 + 1000)?.method, "google");
  assert.equal(claimSignupConversion(st, t0 + 1000), "google");
  assert.equal(claimSignupConversion(st, t0 + 2000), null, "한 번만");
  assert.equal(peekFreshSignup(st, t0 + 2000)?.gaSent, true, "표식은 남는다(관심 지역 화면이 읽는다)");
  clearFreshSignup(st);
  assert.equal(st.raw.has(FRESH_SIGNUP_KEY), false);
  markFreshSignup("password", st, t0);
  assert.equal(claimSignupConversion(st, t0 + FRESH_SIGNUP_TTL_MS), null, "24시간 지나면 버린다");
  assert.equal(st.raw.has(FRESH_SIGNUP_KEY), false);
  st.setItem(FRESH_SIGNUP_KEY, JSON.stringify({ method: "evil", at: t0 }));
  assert.equal(peekFreshSignup(st, t0), null);
  assert.equal(claimSignupConversion(null), null, "저장소 없음 — 조용히");
  const loader = read("components/ga4-gtag-loader.tsx");
  assert.match(loader, /const method = claimSignupConversion\(\);\s*if \(!method\) return;\s*window\.gtag\("event", "sign_up", \{ method \}\);/);
  assert.doesNotMatch(loader, /nz_conv_signup/);
  assert.match(read("app/signup/SignupClient.tsx"), /markFreshSignup\(provider\);/);
  assert.match(read("app/signup/SignupClient.tsx"), /markFreshSignup\("password"\);/);
  assert.match(read("app/auth/confirm/AuthConfirmClient.tsx"), /markFreshSignup\("password"\);/);
  assert.match(read("app/welcome/WelcomeClient.tsx"), /eventName: "signup_social_return"/);
});

test("A9 인증 메일 안내 화면 — 같은 브라우저에서 인증하면 이 탭도 다음 단계로(비밀번호 재사용 없음)", () => {
  const s = strip(read("app/signup/SignupClient.tsx"));
  const i = s.indexOf('document.addEventListener("visibilitychange", check);');
  assert.ok(i > 0);
  const seg = s.slice(s.lastIndexOf("useEffect(() => {", i), i);
  assert.match(seg, /if \(!done\) return;/);
  assert.match(seg, /hasSession\(\)\.then/);
  assert.match(seg, /router\.replace\(welcomeHref\);/);
  assert.doesNotMatch(seg, /password/, "입력한 비밀번호를 다시 쓰지 않는다");
  assert.match(s, /이 브라우저에서 인증하면 이 화면도 다음 단계로 이동/);
});

/* ───────────────────────── B 서울 3D ───────────────────────── */

const C = (o: Partial<Map3DComplex> & { href: string; lat: number; lng: number }): Map3DComplex => ({
  name: o.href,
  region: "서울특별시 강남구",
  households: null,
  buildYear: null,
  avgPerPyeongKrw: null,
  txCount: 0,
  inDong: true,
  ...o,
});

function square(lat: number, lng: number, d = 0.0002): BuildingLite["ring"] {
  return [
    [lng - d, lat - d],
    [lng + d, lat - d],
    [lng + d, lat + d],
    [lng - d, lat + d],
    [lng - d, lat - d],
  ];
}

test("B 3D — 거리 · 반경 · 중심 · 가격 단계", () => {
  const d = distanceM({ lat: 37.4979, lng: 127.0276 }, { lat: 37.5665, lng: 126.978 });
  assert.ok(d > 8_500 && d < 9_000, `강남역–시청 약 8.8km (${Math.round(d)})`);
  assert.equal(radiusFor(null), DEFAULT_RADIUS_M);
  assert.equal(radiusFor(0), DEFAULT_RADIUS_M);
  assert.equal(radiusFor(100), 72);
  assert.equal(radiusFor(1000), 141);
  assert.equal(radiusFor(20_000), 260, "상한");
  assert.equal(radiusFor(1), 70, "하한");
  const c = ringCentroid(square(37.5, 127.0));
  assert.ok(c && Math.abs(c.lat - 37.5) < 1e-9 && Math.abs(c.lng - 127.0) < 1e-9);
  /* 실제 건물 크기(수십 m) · 서울 좌표 그대로 — 예전 계산은 중심이 10m 가까이 어긋났다(첫 꼭짓점 기준으로 옮겨 계산) */
  const c2 = ringCentroid([[127.0551, 37.4891], [127.0556, 37.4893], [127.0554, 37.4897], [127.0549, 37.4895], [127.0551, 37.4891]]);
  assert.ok(c2 && distanceM(c2, { lat: 37.4894, lng: 127.05525 }) < 0.05, JSON.stringify(c2));
  assert.deepEqual(ringCentroid([]), null);
  assert.deepEqual(ringCentroid([[127, 37.5], [127, 37.5]]), { lng: 127, lat: 37.5 }, "퇴화 고리 → 꼭짓점 평균");
  assert.deepEqual(medianCenter([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 100, lng: 100 }]), { lat: 2, lng: 2 }, "멀리 떨어진 한 곳에 끌려가지 않는다");
  assert.equal(medianCenter([]), null);
  assert.equal(priceBand(null), null);
  assert.equal(priceBand(0), null);
  assert.equal(priceBand(39_999_999), 0);
  assert.equal(priceBand(40_000_000), 1);
  assert.equal(priceBand(80_000_000), 3);
  assert.equal(priceBand(200_000_000), 4);
  assert.equal(PRICE_BAND_LABELS.length, 5);
});

test("B 3D — 건물 배정: 고층만 · 반경 안 · 가장 가까운 단지 하나", () => {
  const a = C({ href: "/complex/a", lat: 37.5, lng: 127.0, households: 1000 });
  const b = C({ href: "/complex/b", lat: 37.5, lng: 127.002 });
  const blds: BuildingLite[] = [
    { ring: square(37.5, 127.0003), heightM: 60 }, // a 에서 약 26m
    { ring: square(37.5, 127.0003), heightM: HIGHRISE_MIN_M - 1 }, // 저층 — 칠하지 않는다
    { ring: square(37.5, 127.0011), heightM: 45 }, // a 97m · b 80m → b
    { ring: square(37.51, 127.0), heightM: 80 }, // 1.1km — 어느 반경에도 없음
  ];
  assert.deepEqual(assignBuildings(blds, [a, b]), ["/complex/a", null, "/complex/b", null]);
  assert.deepEqual(assignBuildings(blds, []), [null, null, null, null]);
  assert.equal(complexesNear({ lat: 37.5, lng: 127.001 }, [a, b, C({ href: "/complex/near", lat: 37.5, lng: 127.001, inDong: false })], 600), 2, "주변 단지(inDong false)는 세지 않는다");
});

test("B 3D — 주소 · 서울만", () => {
  assert.equal(map3dPath("서울특별시 강남구", "개포동"), `/map/3d?region=${encodeURIComponent("서울특별시 강남구")}&dong=${encodeURIComponent("개포동")}`.replace(/%20/g, "+"));
  assert.match(map3dPath("서울특별시 강남구", "개포동", "/complex/x"), /&focus=%2Fcomplex%2Fx$/);
  assert.equal(map3dSupported("서울특별시 강남구"), true);
  assert.equal(map3dSupported("서울 송파구"), true);
  assert.equal(map3dSupported("경기도 성남시 분당구"), false);
  assert.equal(map3dSupported(null), false);
});

test("B 3D — 스타일 변환: 한국어 이름 · 잡음 층 숨김 · 학교 이름표 · 원본 불변", () => {
  const pal: Map3DPalette = { bg: "#fff", water: "#00f", park: "#0f0", road: "#eee", roadCasing: "#ddd", building: "#ccc", text: "#111", textHalo: "#fff", school: "#123" };
  const input = {
    version: 8,
    sources: { openmaptiles: {} },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#000" } },
      { id: "poi_r1", type: "symbol", layout: { "text-field": ["get", "name"] } },
      { id: "label_city", type: "symbol", layout: { "text-field": ["concat", ["get", "name:latin"], " ", ["get", "name:nonlatin"]] } },
      { id: "highway-shield", type: "symbol", layout: { "text-field": ["get", "ref"] } },
      { id: "building-3d", type: "fill-extrusion", paint: {} },
    ],
  };
  const before = JSON.stringify(input);
  const out = tuneLibertyStyle(input, pal);
  assert.equal(JSON.stringify(input), before, "원본을 바꾸지 않는다");
  const ids = out.layers.map((l) => l.id);
  for (const h of HIDDEN_LAYER_IDS) assert.ok(!ids.includes(h), h);
  assert.equal(ids[ids.length - 1], "nz-school", "학교 이름표는 맨 위");
  assert.deepEqual(out.layers.find((l) => l.id === "label_city")?.layout?.["text-field"], KOREAN_NAME);
  assert.deepEqual(out.layers.find((l) => l.id === "highway-shield")?.layout?.["text-field"], ["get", "ref"], "도로 번호는 그대로");
  assert.equal(out.layers.find((l) => l.id === "background")?.paint?.["background-color"], "#fff");
  assert.equal(complexExtrusionLayer().type, "fill-extrusion");
  assert.deepEqual(complexExtrusionLayer().paint?.["fill-extrusion-height"], ["get", "h"]);
});

test("B 3D — 색: 토큰 섞기(새 색을 정하지 않는다)", () => {
  assert.deepEqual(parseColor("#1d4fd8"), { r: 29, g: 79, b: 216 });
  assert.deepEqual(parseColor("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseColor("rgb(1, 2, 3)"), { r: 1, g: 2, b: 3 });
  assert.equal(parseColor("var(--x)"), null);
  assert.equal(mix("#000000", "#ffffff", 0.5), "rgb(128, 128, 128)");
  const bands = bandColors("#1d4fd8", "#ffffff");
  assert.equal(bands.length, 5);
  assert.equal(bands[4], "rgb(29, 79, 216)", "가장 비싼 단계 = 주 색 그대로");
});

test("B 3D — 화면 · API · 연결(동 페이지 · 단지 칩 · CSP · 색인 제외)", () => {
  assert.ok(existsSync("app/map/3d/page.tsx") && existsSync("app/map/3d/Map3DClient.tsx") && existsSync("app/api/map/3d/route.ts"));
  const page = read("app/map/3d/page.tsx");
  assert.match(page, /robots: \{ index: false, follow: true \}/);
  const route = strip(read("app/api/map/3d/route.ts"));
  assert.doesNotMatch(route, /^export (?!const (runtime|dynamic|maxDuration)\b|async function GET\b)/m);
  assert.match(route, /s-maxage=86400/);
  assert.match(read("lib/security/content-security-policy.ts"), /https:\/\/tiles\.openfreemap\.org/);
  assert.match(read("app/dong/[region]/[dong]/page.tsx"), /map3dSupported\(region\) && \(/);
  assert.match(read("app/complex/[id]/page.tsx"), /3D 동네 ›/);
  const client = read("app/map/3d/Map3DClient.tsx");
  assert.match(client, /OpenStreetMap/, "출처 표기");
  assert.doesNotMatch(strip(client), /linear-gradient|#[0-9a-fA-F]{6}\b|rgba\(/, "색·그림자는 화면 토큰에서");
  assert.match(client, /attributionControl: \{ compact: true \}/, "지도 출처(OpenFreeMap · OpenMapTiles · OpenStreetMap) 표기");
  assert.match(read("package.json"), /"maplibre-gl": "5\.24\.0"/, "정확한 판 고정");
  /* 지연 청크에서 CSS 를 import 하면 webpack 런타임에 CSS 지연 로더가 붙어 모든 화면 첫 로드가 1.3KB 는다(빌드 실측) */
  assert.doesNotMatch(client, /import "[^"]+\.css";/);
  assert.match(page, /import "maplibre-gl\/dist\/maplibre-gl\.css";/);
  /* 노트 쓰기 화면 예산 — "됐다" 장면은 문맥 모듈만 받는다 */
  assert.match(read("app/notes/new/NoteForm.tsx"), /import \{ useMoment \} from "@\/app\/components\/motion\/moment-context";/);
  assert.doesNotMatch(read("app/components/motion/moment-context.ts"), /CONFETTI|jsx/);
  /* 가입 창도 같은 방식 — 부르는 화면은 문맥 모듈만(창 그리기 · 실험 등록부는 루트 레이아웃의 Provider 에만) */
  assert.match(read("app/notes/new/NoteForm.tsx"), /import \{ useSoftSignup \} from "@\/app\/components\/soft-signup\/soft-signup-context";/);
  assert.doesNotMatch(read("app/components/soft-signup/soft-signup-context.ts"), /useExperiment|experiments/);
  assert.match(read("app/layout.tsx"), /import \{ SoftSignupProvider \} from "\.\/components\/soft-signup\/SoftSignupProvider";/);
});
