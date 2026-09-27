import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  needsRemoteEntryData,
  parseNoteNewParams,
  revisitLoginHref,
} from "../../lib/notes/new-entry.ts";
import {
  parseSubscriptionParams,
  weeklyCheckoutHref,
} from "../../lib/subscriptions/page-params.ts";
import {
  budgetFromEntry,
  countNotesByName,
  listingTypeFromEntry,
  overlayMyNoteCounts,
  parseCoordFocus,
  parseEokParam,
  parseMapEntryParams,
  regionForFocus,
} from "../../lib/map/entry-params.ts";
import { PUBLIC_CACHE_RULES, publicDocumentCacheControl } from "../../lib/http/cache-policy.ts";

/* [1007] 봇 함수 호출 상위 6종(/notes/new 1,790 · /analysis 1,828 · /login 796 · /map 911 ·
   /notes 398 · /subscription 200 회/일 — 사람 페이지뷰는 7일 합계 ~120건)의 정적/ISR 전환을 잠근다.
   ① 여섯 page.tsx 에 세션·쿠키·searchParams 서버 읽기와 force-dynamic 이 다시 생기지 않는지(소스),
   ② 세션·주소 판정을 옮겨 둔 순수 모듈의 규칙이 예전 서버 판정과 같은지,
   ③ 공개 CDN 캐시 목록(cache-policy)에 ISR 눈금 그대로 올라가 있는지. */

const ROOT = path.resolve(process.cwd());
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
/** 주석을 걷어낸 본문 — 주석 속 언급("useSearchParams 를 안 쓰는 이유")은 표식이 아니다 */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/* ---------- ① 소스 검사 ---------- */

/* [1010] revalidate 는 **소스에 적힌 리터럴 그대로** 적는다 — 브리프 규칙대로 긴 값은
   자리수 구분(`86_400`)으로 쓰기 때문에, 숫자 86400 으로는 소스와 문자열이 맞지 않는다. */
const PAGES: Record<string, { mode: "static" | "isr"; revalidate?: number | string }> = {
  "app/notes/new/page.tsx": { mode: "static" },
  "app/login/page.tsx": { mode: "static" },
  /* [1010] 3600 → 86_400. 원천(실거래·부동산원 집계)은 하루 1회 적재이고, 적재 직후
     SOURCE_MAP.molit·reb 이 "/analysis" 를 비운다 — 시간 눈금은 안전망일 뿐이다.
     이 줄이 잠그는 것은 값 자체가 아니라 "이 페이지가 ISR 로 남아 있다" 이다. */
  "app/analysis/page.tsx": { mode: "isr", revalidate: "86_400" },
  /* [1010] 600 → 21_600. 지도 화면의 서버 HTML 을 바꾸는 것은 국토부 실거래 적재뿐이고,
     적재 직후 SOURCE_MAP.molit 이 "/map" 을 비운다. 실측 하루 911회 함수 호출 — 10분 눈금은
     크롤 1회당 재렌더 1회와 같았다. (cache-policy 의 /map sMaxAge 도 같이 올려야 한다 —
     아래 ③ 의 기대값은 그 파일이 바뀔 때 함께 고친다.) */
  "app/map/page.tsx": { mode: "isr", revalidate: "21_600" },
  /* [1010] 300 → 86_400. 공개 노트가 바뀌는 모든 지점이 /notes 를 비운다
     (invalidatePublicNoteRoutes) — 같은 판에서 이 페이지의 데이터 캐시도 1일 + public-notes
     태그로 올렸다(그 캐시가 300초인 동안에는 라우트 TTL 이 300초로 눌렸다). */
  "app/notes/page.tsx": { mode: "isr", revalidate: "86_400" },
  /* [1010] 3600 → 86_400. 비회원 기준 요금 카드·FAQ·JSON-LD 뿐이고 값은 코드 상수라
     배포로만 바뀐다(로그인 조각은 클라이언트). cache-policy 의 sMaxAge 도 같이 올려야 한다. */
  "app/subscription/page.tsx": { mode: "isr", revalidate: "86_400" },
};

/** 서버 렌더에 사용자별 상태를 끌어들이는 표식 — check-cache-policy.mjs 의 목록 + 이 판의 원인(safeAuth·auth·searchParams) */
const SERVER_PERSONALIZATION = [
  "safeAuth",
  'from "@/auth"',
  "auth()",
  "cookies()",
  "headers()",
  "searchParams",
  "getUser(",
  "getSession(",
  "createServerClient",
  "@/lib/supabase/server",
];

for (const [file, want] of Object.entries(PAGES)) {
  test(`${file} — 세션·쿠키·searchParams 서버 읽기 없음 · force-dynamic 없음 · ${want.mode}`, () => {
    const src = read(file);
    /* 주석 속 언급은 허용하되, import·호출은 막는다 — 주석을 걷어낸 본문에서 찾는다 */
    const body = stripComments(src);
    for (const marker of SERVER_PERSONALIZATION) {
      assert.ok(!body.includes(marker), `${file}: "${marker}" 가 서버 코드에 있습니다`);
    }
    assert.ok(!src.includes('dynamic = "force-dynamic"'), `${file}: force-dynamic 이 남아 있습니다`);
    if (want.mode === "static") {
      assert.ok(src.includes('export const dynamic = "force-static"'), `${file}: force-static 이어야 합니다`);
    } else {
      assert.ok(
        src.includes(`export const revalidate = ${want.revalidate};`),
        `${file}: revalidate = ${want.revalidate} 이어야 합니다`,
      );
    }
    /* 페이지 함수가 searchParams 를 받지 않는다(받기만 해도 다음 사람이 읽기 쉽다) */
    assert.ok(!/export default (async )?function \w+\(\s*\{/.test(src), `${file}: 페이지가 props 를 받습니다`);
  });
}

test("클라이언트 판정 컴포넌트 — use client · useSearchParams 미사용(정적 셸 규칙) · 마운트 뒤 window.location", () => {
  const files = [
    "app/notes/new/NoteNewEntry.tsx",
    "app/analysis/hub-viewer.ts",
    "app/analysis/hub-record-start.tsx",
    "app/analysis/hub-picker.tsx",
    "app/map/MapClientLazy.tsx",
    "app/notes/notes-feed-client.tsx",
    "app/subscription/viewer.ts",
    "app/subscription/ViewerCards.tsx",
    "app/subscription/PlanCards.tsx",
    "app/subscription/BillingPanel.tsx",
  ];
  for (const f of files) {
    const src = read(f);
    assert.ok(/^\s*"use client";/.test(src), `${f}: "use client" 가 첫 줄이어야 합니다`);
    assert.ok(!stripComments(src).includes("useSearchParams"), `${f}: useSearchParams 는 정적 셸에서 Suspense 없이는 프리렌더를 깬다`);
  }
  for (const f of [
    "app/notes/new/NoteNewEntry.tsx",
    "app/map/MapClientLazy.tsx",
    "app/notes/notes-feed-client.tsx",
    "app/subscription/PlanCards.tsx",
    "app/subscription/ViewerCards.tsx",
    "app/analysis/hub-picker.tsx",
  ]) {
    assert.ok(read(f).includes("window.location.search"), `${f}: 주소는 마운트 뒤 window.location 에서 읽는다`);
  }
});

test("ai-note-analysis 는 첫 로드 밖 — hub-picker 가 next/dynamic 으로만 부른다(/analysis 예산 490, 실측 488)", () => {
  const picker = read("app/analysis/hub-picker.tsx");
  assert.ok(picker.includes('import("./ai-note-analysis")'), "동적 import 가 없습니다");
  assert.ok(!/^import .*ai-note-analysis/m.test(picker), "정적 import 로 되돌아갔습니다");
  const page = read("app/analysis/page.tsx");
  assert.ok(!page.includes("ai-note-analysis"), "page.tsx 가 카드를 직접 import 합니다");
});

test("/notes/new 페이지는 loading.tsx 골격을 그대로 fallback 으로 쓴다(클라이언트 번들에 골격 JSX 없음)", () => {
  const page = read("app/notes/new/page.tsx");
  assert.ok(page.includes('from "./loading"'), "loading.tsx 를 import 하지 않습니다");
  assert.ok(page.includes("<NoteNewEntry fallback={<NoteNewLoading />} />"));
  const entry = read("app/notes/new/NoteNewEntry.tsx");
  assert.ok(entry.includes('import("@/lib/inspection/revisit-prefill")'), "회차 프리필은 필요할 때만 동적 import");
  assert.ok(!/^import .*revisit-prefill"/m.test(entry.replace(/^import type .*$/gm, "")), "revisit-prefill 정적 import 금지");
});

/* ---------- ③ 공개 캐시 목록 ---------- */

test("cache-policy — 다섯 경로가 ISR 눈금 그대로, /login 은 목록에 없다(PRIVATE_PREFIXES)", () => {
  const byPath = new Map(PUBLIC_CACHE_RULES.map((r) => [r.path, r]));
  assert.equal(byPath.get("/notes/new")?.sMaxAge, 3600);
  /* [1010] 라우트 revalidate(86_400)와 같은 눈금 — s-maxage 만 1시간에 두면
     CDN 이 시간마다 오리진으로 재검증을 보내 함수 호출·전송이 그대로 남는다 */
  assert.equal(byPath.get("/analysis")?.sMaxAge, 86400);
  /* [1010] 통합 반영 완료 — 라우트 revalidate 와 같은 눈금이다.
     s-maxage 가 라우트보다 짧으면 CDN 이 그 주기로 오리진 재검증을 보내 함수 호출·전송이
     그대로 남는다(둘은 재는 대상이 다르다 — cache-policy.ts 의 /complex/[id] 주석 참고). */
  assert.equal(byPath.get("/map")?.sMaxAge, 21_600);
  assert.equal(byPath.get("/notes")?.sMaxAge, 86_400);
  assert.equal(byPath.get("/subscription")?.sMaxAge, 86_400);
  assert.equal(byPath.get("/login"), undefined);
  assert.equal(
    publicDocumentCacheControl("/map"),
    "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400",
  );
  assert.equal(publicDocumentCacheControl("/login"), null);
  /* 게이트 스크립트의 개인 경로 목록과 어긋나지 않는다 */
  const gate = read("scripts/check-cache-policy.mjs");
  const m = gate.match(/const PRIVATE_PREFIXES = \[([^\]]+)\]/);
  assert.ok(m, "PRIVATE_PREFIXES 를 찾지 못했습니다");
  const prefixes = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  for (const p of ["/notes/new", "/analysis", "/map", "/notes", "/subscription"]) {
    assert.ok(!prefixes.some((pre) => p === pre || p.startsWith(`${pre}/`)), `${p} 는 개인 경로 접두와 겹칩니다`);
  }
});

/* ---------- ② 순수 판정 모듈 ---------- */

test("notes/new 진입값 — quick·intent·from·memo·tpl·revisit 판정이 예전 서버와 같다", () => {
  const p = parseNoteNewParams("?quick=1&intent=AI&memo=%20hello%20&tpl=official-basic");
  assert.equal(p.quickStart, true);
  assert.equal(p.quickExplicit, true);
  assert.equal(p.preferAi, true);
  assert.equal(p.fromWelcome, false);
  assert.equal(p.presetMemo, "hello");
  assert.equal(p.tplId, "official-basic");
  assert.equal(p.revisitId, null);
  assert.equal(needsRemoteEntryData(p), true);

  /* [1006] ?quick=0 도 명시다 — 설정의 퀵 기본값보다 URL 이 우선 */
  const q0 = parseNoteNewParams("?quick=0");
  assert.equal(q0.quickStart, false);
  assert.equal(q0.quickExplicit, true);
  assert.equal(needsRemoteEntryData(q0), false);

  /* from=welcome 은 preferAi 도 켠다 */
  const w = parseNoteNewParams("?from=Welcome");
  assert.equal(w.fromWelcome, true);
  assert.equal(w.preferAi, true);

  /* 메모 상한 2000자 */
  const long = parseNoteNewParams(`?memo=${"가".repeat(2100)}`);
  assert.equal(long.presetMemo?.length, 2000);

  /* revisit 은 uuid 모양만 — 봇·오타 링크에 로그인 벽을 세우지 않는다 */
  const bad = parseNoteNewParams("?revisit=not-a-uuid");
  assert.equal(bad.revisitId, null);
  assert.equal(needsRemoteEntryData(bad), false);
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const ok = parseNoteNewParams(`?revisit=${id}`);
  assert.equal(ok.revisitId, id);
  assert.equal(revisitLoginHref(id), `/login?callbackUrl=${encodeURIComponent(`/notes/new?revisit=${id}`)}`);

  /* 빈 주소 → 전부 기본값 */
  const none = parseNoteNewParams("");
  assert.deepEqual(none, {
    tplId: null,
    presetMemo: null,
    preferAi: false,
    fromWelcome: false,
    quickStart: false,
    quickExplicit: false,
    revisitId: null,
  });
});

test("subscription 진입값 — billing·plan·returnTo(내부 경로만) 판정과 주간권 링크", () => {
  assert.deepEqual(parseSubscriptionParams("?plan=pro&billing=annual"), {
    billing: "annual",
    highlightPlan: "pro",
    returnTo: "",
  });
  assert.deepEqual(parseSubscriptionParams("?billing=weekly&plan=expert"), {
    billing: "monthly",
    highlightPlan: "weekly",
    returnTo: "",
  });
  assert.equal(parseSubscriptionParams("?plan=enterprise").highlightPlan, null);
  /* returnTo 는 내부 경로만 — 오픈 리다이렉트 차단(safe-path) */
  assert.equal(parseSubscriptionParams("?returnTo=%2Fnotes%2Fabc").returnTo, "/notes/abc");
  assert.equal(parseSubscriptionParams("?returnTo=https%3A%2F%2Fevil.com").returnTo, "");
  assert.equal(parseSubscriptionParams("?returnTo=%2F%2Fevil.com").returnTo, "");
  assert.equal(parseSubscriptionParams("?returnTo=%2F").returnTo, "");
  const base = "/subscription/checkout?tier=pro&billing=weekly";
  assert.equal(weeklyCheckoutHref(base, ""), base);
  assert.equal(weeklyCheckoutHref(base, "/"), base);
  assert.equal(weeklyCheckoutHref(base, "/analysis"), `${base}&returnTo=%2Fanalysis`);
  assert.equal(weeklyCheckoutHref(base, "https://evil.com"), base);
});

test("map 진입값 — 좌표 범위·억 범위·줌·유형·지역 우선순위가 예전 page.tsx 와 같다", () => {
  assert.deepEqual(parseCoordFocus("37.5", "127.0"), { lat: 37.5, lng: 127.0 });
  assert.equal(parseCoordFocus("0", "0"), null);
  assert.equal(parseCoordFocus("abc", "127"), null);
  assert.equal(parseCoordFocus(null, "127"), null);
  assert.equal(parseEokParam("12"), 12);
  assert.equal(parseEokParam("201"), null);
  assert.equal(parseEokParam("-1"), null);
  assert.equal(parseEokParam(""), null);

  const p = parseMapEntryParams(
    "?region=%EC%84%9C%EC%9A%B8%20%EB%A7%88%ED%8F%AC%EA%B5%AC&type=jeonse&priceMax=9&lat=37.55&lng=126.9&z=15.4",
  );
  assert.equal(p.region, "서울 마포구");
  assert.equal(p.listingType, "jeonse");
  assert.equal(p.priceMinEok, null);
  assert.equal(p.priceMaxEok, 9);
  assert.deepEqual(p.coordFocus, { lat: 37.55, lng: 126.9 });
  assert.equal(p.initialLevel, 15);
  const b = budgetFromEntry(p);
  assert.deepEqual(b, { type: "jeonse", minEok: null, maxEok: 9, label: null });
  assert.equal(listingTypeFromEntry(p, b), "jeonse");

  /* 가격만 있으면 예산은 sale, 매물 유형은 예산의 type */
  const p2 = parseMapEntryParams("?priceMin=3");
  const b2 = budgetFromEntry(p2);
  assert.deepEqual(b2, { type: "sale", minEok: 3, maxEok: null, label: null });
  assert.equal(listingTypeFromEntry(p2, b2), "sale");

  /* 아무것도 없으면 예산 null → 로그인 사용자의 온보딩 예산이 뒤를 잇는다 */
  const p3 = parseMapEntryParams("?z=99&type=rent");
  assert.equal(budgetFromEntry(p3), null);
  assert.equal(listingTypeFromEntry(p3, null), null);
  assert.equal(p3.initialLevel, null);
  assert.equal(p3.listingType, null);

  /* 지역 포커스 우선순위: region → 노트의 지역 → district → q */
  assert.equal(regionForFocus(parseMapEntryParams("?q=%EC%9E%A0%EC%8B%A4&district=%EC%86%A1%ED%8C%8C"), null), "송파");
  assert.equal(regionForFocus(parseMapEntryParams("?q=%EC%9E%A0%EC%8B%A4"), "서울 송파구"), "서울 송파구");
  assert.equal(regionForFocus(parseMapEntryParams("?region=A&district=B&q=C"), "N"), "A");
  assert.equal(regionForFocus(parseMapEntryParams(""), null), null);
});

test("map 내 노트 덧입힘 — 공유 목록에 그 사람 노트 수만, 정규화 이름(공백·아파트 제거) 기준", () => {
  const counts = countNotesByName(["잠실 엘스", "잠실엘스아파트", null, "", "리센츠"]);
  assert.equal(counts.get("잠실엘스"), 2);
  assert.equal(counts.get("리센츠"), 1);
  const items = [
    { name: "잠실엘스", note: null as string | null, price: "30억" },
    { name: "파크리오", note: null as string | null, price: "25억" },
  ];
  const out = overlayMyNoteCounts(items, counts);
  assert.equal(out[0].note, "노트 2건");
  assert.equal(out[1].note, null);
  assert.equal(out[1], items[1], "노트가 없는 항목은 같은 객체(불변)");
  assert.equal(overlayMyNoteCounts(items, new Map()), items, "빈 맵이면 목록 그대로");
});
