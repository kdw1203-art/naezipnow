import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { TOWN_CATEGORY_LINKS } from "@/lib/town/category-links";
import { seedGradient } from "@/lib/town/shared";
import { buildTownCategorySubs, kstDayOf, kstYmOf } from "@/lib/town/category-subs";
import { JOURNEY_STAGES, journeyCountLabels } from "@/lib/journey/stages";

/* [1012] 동네·뉴스·청약·입주·공매·정비사업·다이제스트·Q&A·전문가 축 —
 * docs/design-system.md v3 "형태·문구 규율" 이 이 축의 화면 소스에 실제로 적용됐는지 잠근다.
 *
 * 두 종류다.
 *  1) 소스 규칙 — 게이트(scripts/check-ai-look.mjs)가 기계적으로 막는 것(이모지·금지 문구·
 *     장식 그라데이션·큰 그림자)에 더해, 게이트가 안 보는 굵기 800(font-extrabold)·유리(glass) 칩·
 *     권유형 빈 화면 문구("남겨 보세요")까지 이 축의 경로 전체에서 0 이어야 한다.
 *  2) 카탈로그·컴포넌트 규칙 — 카테고리 카드 부제는 숫자만, 아이콘 칩 색은 한 가지, 히어로는
 *     슬로건 대신 실데이터 한 줄.
 *
 * 문구를 못 박는 옛 테스트는 없었다(grep 결과 0건) — 갱신할 테스트도 없다. */

const ROOTS = [
  "app/town",
  "app/apply",
  "app/supply",
  "app/auctions",
  "app/redevelopment",
  "app/digest",
  "app/qna",
  "app/data",
  "app/data-sources",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}
const FILES = ROOTS.flatMap((r) => walk(r));
const read = (p: string): string => readFileSync(p, "utf8");
/** 주석은 규칙 기록을 남기는 자리라 검사에서 뺀다(게이트와 같은 방식) */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));
}

/* ── 1. 소스 규칙 (이 축 경로 전체) ─────────────────────────────────────────── */

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}]|[\u{2728}\u{2B50}\u{2705}\u{274C}\u{2757}]/u;
const BANNED = ["지금 시작", "시작하세요", "시작하기", "무료로 시작", "더 알아보기", "자세히 알아보기", "지금 바로", "Learn more", "Get started"];

test("[1012] 규칙 4·5 — 담당 경로의 UI 문자열에 이모지·금지 문구가 없다", () => {
  const bad: string[] = [];
  for (const f of FILES) {
    const lines = stripComments(read(f)).split("\n");
    lines.forEach((line, i) => {
      const l = line.replace(/name=\{?"[^"]*"\}?/g, "");
      if (EMOJI_RE.test(l)) bad.push(`${f}:${i + 1} 이모지`);
      for (const ph of BANNED) if (line.includes(ph)) bad.push(`${f}:${i + 1} "${ph}"`);
    });
  }
  assert.deepEqual(bad, []);
});

test("[1012] 규칙 3 — 장식 그라데이션은 0 (가로 레일 mask-image 만 예외)", () => {
  const bad: string[] = [];
  for (const f of FILES) {
    if (f.endsWith("app/town/TownCategoryNav.tsx")) continue; // 레일 오른쪽 페이드 마스크(게이트 예외 목록과 같다)
    const src = stripComments(read(f));
    if (/(?:linear|radial|conic|repeating-linear)-gradient\(|bg-gradient-to-/.test(src)) bad.push(f);
  }
  assert.deepEqual(bad, []);
});

test("[1012] 규칙 8·2 — font-extrabold/font-black · 손으로 적은 그림자 · 유리 칩(glass) 이 없다", () => {
  const bad: string[] = [];
  for (const f of FILES) {
    const src = stripComments(read(f));
    if (/font-(?:extrabold|black)/.test(src)) bad.push(`${f} 굵기 800+`);
    if (/shadow-\[0_/.test(src)) bad.push(`${f} 임의 그림자`);
    /* 채팅방 입력 바(ChatRoom·chat/page)는 플로팅 요소라 .glass 를 그대로 둔다(디자인 시스템 "글래스 제한") */
    /* 사진 위 가독 캡션(NewsHero)·호버 알약(.njn-glass)은 유리가 아니라 오버레이라 예외 */
    if (!/groups\/\[id\]/.test(f) && /className=["`](?:[^"`]*\s)?glass(?:-strong)?(?:\s[^"`]*)?["`]/.test(src)) bad.push(`${f} glass 칩`);
  }
  assert.deepEqual(bad, []);
});

test("[1012] 규칙 6 — 빈 화면·안내문에 권유형 어미('남겨 보세요' 류)가 없다", () => {
  const bad: string[] = [];
  for (const f of FILES) {
    const lines = stripComments(read(f)).split("\n");
    lines.forEach((line, i) => {
      if (/남겨\s?보세요|남겨보세요|물어보세요|확인하세요|확인해 보세요|모아보세요|나눠 보세요|질문해 보세요/.test(line)) {
        bad.push(`${f}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(bad, []);
});

test("[1012] 규칙 1 — 본문 카드(.card)에 12px(rounded-3xl) 를 덧씌우지 않는다", () => {
  const bad: string[] = [];
  for (const f of FILES) {
    stripComments(read(f))
      .split("\n")
      .forEach((line, i) => {
        if (!/rounded-3xl/.test(line)) return;
        if (!/(^|[\s"`'])card([\s"`']|$)/.test(line)) return;
        if (/brand-navy-card|ai-panel|bg-brand-hanji/.test(line)) return;
        bad.push(`${f}:${i + 1}`);
      });
  }
  assert.deepEqual(bad, []);
});

/* ── 2. 카탈로그·컴포넌트 규칙 ─────────────────────────────────────────────── */

test("[1012] 카테고리 카드 — 부제는 카탈로그에 없고(숫자는 화면이 채운다) 아이콘 칩 색은 한 가지", () => {
  for (const l of TOWN_CATEGORY_LINKS) {
    assert.equal(l.desc, "", `${l.href} 의 desc 는 비어 있어야 한다(설명 부제 금지)`);
    assert.equal(l.heroTitle, undefined, `${l.href} 의 슬로건 heroTitle 은 더 이상 없다`);
  }
  assert.equal(new Set(TOWN_CATEGORY_LINKS.map((l) => l.tone)).size, 1, "아이콘 칩 색 3종 나열 금지");
  /* CTA 라벨은 동사+대상 */
  for (const l of TOWN_CATEGORY_LINKS) for (const c of l.heroCta) assert.match(c.label, /보기$/);
});

test("[1012 → v4] /town 머리 — 슬로건·네이비 히어로·통계 줄 없이 제목 한 줄 + 작은 글쓰기", () => {
  const src = read("app/town/page.tsx");
  const code = stripComments(src);
  assert.doesNotMatch(code, /다녀온 사람의 기록이/, "슬로건 문장이 남아 있다");
  /* [v4] 1012 에서 못 박았던 히어로(네이비 면 + 실데이터 제목 "이번 주 이웃 N명 · …" + 부제 "마포구 등 N곳의 …" +
     카테고리 타일 counts)는 v4 "한 화면 한 가지"(규칙 1·4·7)로 통째로 걷혔다 — 옛 문자열 대신 새 머리를 잠근다. */
  assert.doesNotMatch(code, /brand-navy-card|BrandWatermark/, "v4 규칙 4 — 네이비 히어로·워터마크 금지");
  assert.doesNotMatch(code, /headlineParts|heroSub|Lab 데이터 카드|가장 활발한 동네/, "통계 줄은 없다");
  assert.match(code, /<h1 className="t-title text-ink">동네이야기<\/h1>/, "제목은 t-title 한 줄");
  assert.match(code, /<TownWriteMenu \/>/);
  assert.doesNotMatch(code, /btn-primary/, "머리에 채움 파랑 없음(모바일은 탭바 ＋)");
  assert.doesNotMatch(code, /t-display/, "머리에 display 크기를 쓰지 않는다");
});

test("[1012 → v4] TownHero — 카테고리 이름이 h1, 실측 숫자는 그 아래 사실 한 줄, heroTitle 은 읽지 않는다", () => {
  const code = stripComments(read("app/town/TownHero.tsx"));
  assert.doesNotMatch(code, /heroTitle/);
  /* [v4] 규칙 1·4 — 1012 에서 못 박았던 네이비 머리(h1 t-title text-on-dark + t-section 통계줄 statLine)는
     "한 화면 한 가지"에서 흰 머리로 바뀌었다: 제목 한 줄(t-title text-ink) + 사실 한 줄(t-sub text-text-3, 실측 숫자만). */
  assert.match(code, /<h1 className="t-title text-ink">\{link\.label\}<\/h1>/);
  assert.match(code, /shown\.length > 0 && \(\s*<p className="mt-0\.5 truncate t-sub text-text-3">/);
  assert.doesNotMatch(code, /brand-navy-card|BrandWatermark|CountUp|<Icon /, "네이비 면·워터마크·아이콘 칩 없음");
  assert.doesNotMatch(code, /btn-primary/, "머리에 채움 파랑 없음(작은 아웃라인 하나)");
  assert.doesNotMatch(code, /headSub/, "설명 한 줄(headSub)은 머리에 그리지 않는다");
});

test("[1012 → v4] TownCategoryNav — 아이콘 타일 없이 글자 밑줄 탭, 그림자·채움 파랑 없음", () => {
  const code = stripComments(read("app/town/TownCategoryNav.tsx"));
  assert.doesNotMatch(code, /shadow-\[var\(--shadow-md\)\]/);
  /* [v4] 규칙 7 — 96×80 타일(rounded-lg border px-2 + 아이콘 칩 + 부제 줄)을 글자 탭으로 바꿨다. 옛 클래스 대신 새 모양을 잠근다. */
  assert.doesNotMatch(code, /tile-ico|<Icon /, "아이콘 타일 금지");
  assert.match(code, /border-b-2 pb-2\.5 pt-3 t-body font-bold/);
  assert.match(code, /aria-current=\{activeHref === l\.href \? "page" : undefined\}/);
  assert.doesNotMatch(code, /bg-primary text-surface/, "활성 칸에 채움 파랑을 쓰지 않는다");
});

test("[1012 → v4] 피드 — 시각(CardTime)을 적고, 1px 선 행 목록, 빈 화면 CTA 는 동사+대상", () => {
  const code = stripComments(read("app/town/feed-client.tsx"));
  assert.match(code, /function CardTime\(/);
  assert.match(code, /suppressHydrationWarning/);
  /* [v4] 매소너리 카드(.story-card · .card tile) → 1px 구분선 행 목록. 옛 카드 클래스 대신 행 구조를 잠근다. */
  /* [v4.1 · 리퀴드 목록] 묶음 톤(data-tone)은 붙어도 된다 — 행 구조는 그대로 */
  assert.match(code, /<ul (?:data-tone="[a-z]+" )?className="divide-y divide-line">/);
  assert.doesNotMatch(code, /story-card|columns-2/);
  assert.match(code, /"임장노트 쓰기" : "동네이야기 쓰기"/);
  assert.match(code, /"이전 글 더 보기"/);
  assert.doesNotMatch(code, /name="📍"|name="🔖"/, "아이콘은 이름으로");
});

test("[1012 → v4] 뉴스룸 — 마스트헤드 슬로건 제거 · 흰 머리 사실 줄 · 배지·스트립 없이 한 행", () => {
  const news = stripComments(read("app/town/news/page.tsx"));
  assert.doesNotMatch(news, /오늘 부동산은 이렇게 움직였습니다/);
  /* [v4] 규칙 4·6 — 1012 의 한지 마스트헤드("자동 수집" 배지 + 제목 `오늘 기사 n건 · …`)는 흰 머리(TownHero)로 바뀌었다.
     오늘 기사 수는 사실 한 줄(stats)로, "자동 수집"은 배지가 아니라 맨 끝 "데이터 출처" 문장으로. */
  assert.match(news, /\{ label: "오늘 기사", value: todayCount, unit: "건" \}/);
  assert.doesNotMatch(news, /newsroom-masthead|news-dateline|>자동 수집<\/span>/, "마스트헤드·배지 없음");
  assert.doesNotMatch(news, /ai-panel/, "다이제스트 행은 AI 결과가 아니라 네이비 패널을 쓰지 않는다");
  assert.doesNotMatch(news, /AdZone|btn-primary/, "하우스 광고·채움 파랑 없음");
  assert.match(news, /<TownSources>/);
  /* [v4] 동네 홈의 뉴스 입구 — 한지 스트립(배지 · "뉴스룸 전체 보기" · 매체 열) → 허브와 같은 한 행 */
  const strip = stripComments(read("app/town/TownNewsStrip.tsx"));
  assert.doesNotMatch(strip, /자동 수집|news-strip|<Icon/, "배지·스트립 재질·아이콘 없음");
  assert.match(strip, /\{title\} <span className="t-num">\{rows\.length\.toLocaleString\("ko-KR"\)\}<\/span>건/);
  const detail = stripComments(read("app/town/news/[id]/page.tsx"));
  assert.match(detail, /<h1 className="t-title leading-\[1\.4\] text-ink">/, "기사 제목은 t-title(본문의 2배 안)");
});

test("[1012 → v4] 청약 — 캘린더 입구는 머리 한 곳, 빈 화면에 청약홈 기준일, 배지 대신 의미색 글자", () => {
  const apply = stripComments(read("app/apply/page.tsx"));
  /* [v4] 규칙 7·8 — 본문 칩 "📅→calendar 아이콘 + 청약 캘린더 보기"와 스트립 "날짜별 캘린더 보기"가 같은 곳으로 가는
     두 입구였다. 머리(TownHero)의 작은 아웃라인 하나 — 라벨은 카탈로그 heroCta("청약 캘린더 보기") — 로 합쳤다. */
  assert.match(apply, /<TownHero\s+href="\/apply"/);
  assert.doesNotMatch(apply, /<Icon |청약 캘린더 보기|AdZone/, "본문 칩·아이콘·광고 없음");
  const catalog = TOWN_CATEGORY_LINKS.find((l) => l.href === "/apply");
  assert.equal(catalog?.heroCta[0]?.label, "청약 캘린더 보기");
  assert.equal(catalog?.heroCta[0]?.href, "/apply/calendar");
  assert.doesNotMatch(apply, /CROSS_LINKS/, "아이콘 3개 나열 섹션은 뺐다");
  const cal = stripComments(read("app/apply/calendar/page.tsx"));
  assert.match(cal, /function asOfShort\(/);
  assert.match(cal, /desc=\{`청약홈 \$\{asOfShort\(cal\.fetchedAt\)\} 기준/);
  /* [v4] 규칙 5·6 — 스트립의 날짜 배지(rounded-sm px-1.5 py-px …)는 1px 선 행의 오른쪽 값 글자(의미색)가 됐다 */
  const strip = stripComments(read("app/apply/ApplyDailyStrip.tsx"));
  assert.doesNotMatch(strip, /rounded-sm px-1\.5|날짜별 캘린더 보기/);
  assert.match(strip, /<SummaryRow/);
  assert.match(strip, /u\.kind === "접수" \? "text-primary" : "text-warning"/);
});

test("[1012] 공매·입주·정비사업 — 히어로에 실측 stats, 채움 파랑은 CTA 하나", () => {
  const auctionsPage = stripComments(read("app/auctions/page.tsx"));
  assert.match(auctionsPage, /stats=\{\[\{ label: "입찰 중·예정", value: loaded\.activeTotal, unit: "건" \}\]\}/);
  const auctions = stripComments(read("app/auctions/AuctionsClient.tsx"));
  assert.equal((auctions.match(/btn-primary/g) ?? []).length, 1, "AuctionsClient 의 채움 파랑은 1개");
  assert.doesNotMatch(auctions, /border-\[1\.5px\] border-primary/);
  const supplyPage = stripComments(read("app/supply/page.tsx"));
  assert.match(supplyPage, /stats=\{all\.ok \? \[\{ label: "입주 예정 단지"/);
  const supply = stripComments(read("app/supply/SupplyClient.tsx"));
  assert.doesNotMatch(supply, /최근 적재/, "'적재' 는 내부 말");
  const redev = stripComments(read("app/redevelopment/page.tsx"));
  /* [v4] 규칙 1·3 — 지도 위 설명 문장(`구역 n곳 · 시군구 n곳 — …누르면 그 구역으로 지도가 이동해요`)의 숫자는
     머리 사실 한 줄(TownHero stats)로 올라가고 문장은 지웠다. */
  assert.match(redev, /\{ label: "구역", value: projects\.length, unit: "곳" \}/);
  assert.match(redev, /\{ label: "시군구", value: sigunguCounts\.length, unit: "곳" \}/);
  assert.doesNotMatch(redev, /지도가 이동해요/);
});

test("[1012] 자료실 — 커버 면 prop 은 face 이고 값은 단색 토큰", () => {
  const browser = read("app/town/library/LibraryBrowser.tsx");
  assert.match(browser, /face: string;/);
  assert.doesNotMatch(stripComments(browser), /n\.gradient/);
  assert.match(read("app/town/library/page.tsx"), /face: seedGradient\(/);
  for (const seed of ["강남구", "마포구", "x", ""]) {
    assert.match(seedGradient(seed), /^var\(--[a-z-]+\)$/, "단색 토큰이어야 한다");
  }
});

test("[1012] 아바타·지도 폴백 — 그라데이션 대신 --divider 단면", () => {
  assert.match(stripComments(read("app/town/LocationMap.tsx")), /bg-divider/);
  /* [v4] 규칙 7 — 댓글의 빈 아바타 원(--divider 단면, 글자·사진 없음)은 장식 칸이라 통째로 뺐다.
     1012 가 막은 것(그라데이션 아바타)이 돌아오지 않았는지, 빈 원도 다시 생기지 않았는지 잠근다. */
  const thread = stripComments(read("app/town/news/[id]/CommentThread.tsx"));
  assert.doesNotMatch(thread, /gradient|seedGradient/);
  assert.doesNotMatch(thread, /h-8 w-8 shrink-0 rounded-full/);
  assert.equal((stripComments(read("app/town/groups/[id]/ChatRoom.tsx")).match(/rounded-full bg-divider/g) ?? []).length, 2);
});

/* ── 3. [1012 · R2] 2라운드 — 카테고리 타일 실집계 부제 · 여정 카드 숫자 · 문구 ─────────────────── */

test("[1012 · R2] buildTownCategorySubs — 실집계가 있는 칸만 짧은 숫자 부제, null·0 은 비운다", () => {
  const subs = buildTownCategorySubs({
    counts: { applyOpen: 12, onbidActive: 1130, supplyMonth: 7, supplyYm: "202609", redevZones: 214 },
    todayNews: 4,
    weekPosts: 3,
  });
  assert.deepEqual(subs, {
    "/town": "이번 주 새 글 3",
    "/town/news": "오늘 기사 4건",
    "/apply": "접수 중 12건",
    "/auctions": "진행 1,130건",
    "/supply": "9월 입주 7곳",
    "/redevelopment": "구역 214곳",
  });
  /* 모든 키는 카탈로그의 href 다 — 없는 칸에 숫자를 만들지 않는다 */
  const hrefs = new Set(TOWN_CATEGORY_LINKS.map((l) => l.href));
  for (const k of Object.keys(subs)) assert.ok(hrefs.has(k), k);
  /* 조회 실패(null)·0·음수·NaN 은 부제 없음 — 지어내지 않는다 */
  assert.deepEqual(
    buildTownCategorySubs({
      counts: { applyOpen: 0, onbidActive: null, supplyMonth: 3, supplyYm: null, redevZones: NaN },
      todayNews: 0,
      weekPosts: -1,
    }),
    {},
  );
  assert.deepEqual(buildTownCategorySubs({ counts: null }), {});
  /* 입주 달은 supplyYm(YYYYMM)의 월 — 앞자리 0 없이 */
  assert.equal(
    buildTownCategorySubs({ counts: { applyOpen: null, onbidActive: null, supplyMonth: 1, supplyYm: "202701", redevZones: null } })["/supply"],
    "1월 입주 1곳",
  );
});

test("[1012 · R2] kstDayOf·kstYmOf — 한국 날짜 기준(UTC 자정 전후가 갈린다)", () => {
  /* 2026-09-27T15:30Z = 한국 9/28 00:30 */
  assert.equal(kstDayOf(Date.UTC(2026, 8, 27, 15, 30)), "2026-09-28");
  assert.equal(kstYmOf(Date.UTC(2026, 8, 27, 15, 30)), "202609");
  assert.equal(kstYmOf(Date.UTC(2026, 8, 30, 15, 0)), "202610");
});

test("[1012 · R2 → v4] TownCategoryNav — 숫자 부제(counts)는 허브 타일과 함께 사라졌다, 뉴스룸 전용 분기 없음", () => {
  const code = stripComments(read("app/town/TownCategoryNav.tsx"));
  /* [v4] counts 는 허브(/town)만 넘기던 prop 이다. 허브가 이 줄을 쓰지 않게 되면서(맨 아래 "동네 자료" 글자 줄)
     prop 도 걷었다 — 남겨 두면 아무도 채우지 않는 입력이다. */
  assert.doesNotMatch(code, /counts\?: TownCategorySubs;/);
  assert.doesNotMatch(code, /newsroom.*todayNews/);
  assert.doesNotMatch(stripComments(read("app/town/page.tsx")), /TownCategoryNav/, "허브는 카테고리 타일 줄을 쓰지 않는다");
});

test("[1012 · R2] category-counts — 네 원천은 각 화면이 읽는 표 그대로 · head 집계 · 하루 캐시 · 새 뷰 없음", () => {
  const code = stripComments(read("lib/town/category-counts.ts"));
  assert.match(code, /^import "server-only";/m);
  for (const table of ["applyhome_announcements", "apartment_supply", "redevelopment_projects"]) {
    assert.match(code, new RegExp(`\\.from\\("${table}"\\)\\s*\\.select\\("\\*", \\{ count: "exact", head: true \\}\\)`), table);
  }
  assert.match(code, /getActiveAuctionCount\(\)/, "공매는 /auctions 히어로와 같은 함수(같은 필터)");
  assert.match(code, /\.lte\("rcept_bgnde", today\)\s*\.gte\("rcept_endde", today\)/, "청약 = 오늘이 접수 기간 안");
  assert.match(code, /\.eq\("move_in_ym", ym\)/, "입주 = 이번 달");
  assert.match(code, /revalidate: 86_400/);
  assert.match(code, /tags: \[CACHE_TAGS\.market, CACHE_TAGS\.supply, CACHE_TAGS\.news\]/);
  assert.doesNotMatch(code, /\.rpc\(|create view|_source"\)/, "새 뷰·RPC 없음");
});

test("[1012 · R2 → v4] 뉴스 행 — 매체명은 말줄임 칸, 시각은 줄지 않는다 · 정렬 안내엔 숫자", () => {
  /* [v4] 매체 열이 있던 한지 스트립(news-source min-w-[7em])은 동네 홈에서 한 행이 됐다. 매체명·시각을 한 줄에 싣는
     자리는 이제 뉴스룸 목록 행이다 — 매체명은 min-w-0 말줄임 칸, 시각·지역·분류는 shrink-0 로 잘리지 않는다. */
  const list = stripComments(read("app/town/news/NewsListClient.tsx"));
  assert.match(list, /<span className="min-w-0 truncate font-bold text-text-2">\{row\.source\}<\/span>/);
  assert.match(list, /<span className="shrink-0 whitespace-pre">/);
  assert.match(list, /<span className="truncate t-body font-bold text-ink">\{row\.title\}<\/span>/, "제목 한 줄");
  const feed = stripComments(read("app/town/feed-client.tsx"));
  assert.doesNotMatch(feed, /최신 글이 먼저, 노트 평점·저장수만큼 위로 올라와요/);
  assert.match(feed, /평점·저장 있는 \$\{boostedByScore\.toLocaleString\("ko-KR"\)\}장은 그만큼 위로/);
});

test("[1012 · R2] journeyCountLabels — 실데이터가 있는 카드에만 숫자, 카탈로그엔 정적 count 없음", () => {
  const labels = journeyCountLabels({
    quizRounds: 10,
    regionCount: 218,
    latestYm: "202608",
    imjangRegions: 48,
    glossaryTerms: 56,
    brokerageBrackets: 6,
    loanRulesCheckedAt: "2026-09-21",
  });
  assert.deepEqual(labels.tasks, {
    "/quiz": "오늘 10문제",
    "/map": "218개 시군구",
    "/glossary": "용어 56개",
    "/imjang": "가이드 48곳",
    "/calculator/brokerage": "요율 구간 6개",
    "/calculator": "규정 2026.09 확인",
  });
  assert.deepEqual(labels.stages, { market: "국토교통부 2026.08 신고분까지" });
  /* 모든 키는 여정 카드의 href 다 */
  const hrefs = new Set(JOURNEY_STAGES.flatMap((s) => s.tasks.map((t) => t.href)));
  for (const k of Object.keys(labels.tasks)) assert.ok(hrefs.has(k), k);
  /* 실패(null)·0·형식 불일치는 비운다 */
  const empty = journeyCountLabels({
    quizRounds: null,
    regionCount: 0,
    latestYm: "2026-08",
    imjangRegions: null,
    glossaryTerms: null,
    brokerageBrackets: null,
    loanRulesCheckedAt: "26.09",
  });
  assert.deepEqual(empty, { tasks: {}, stages: {} });
  /* 카탈로그에는 정적 숫자를 박지 않는다 */
  for (const s of JOURNEY_STAGES) for (const t of s.tasks) assert.equal(t.count, undefined, `${t.href} 에 정적 count`);
});

test("[1012 · R2] /journey — 서버가 실데이터를 읽어 counts 로 넘기고, 보드는 카드 오른쪽에 그린다 · 문구 3곳", () => {
  const page = stripComments(read("app/journey/page.tsx"));
  assert.match(page, /export const dynamic = "force-static"/);
  assert.match(page, /export const revalidate = 86_400/);
  assert.match(page, /journeyCountLabels\(await loadJourneyCounts\(Date\.now\(\)\)\)/);
  assert.match(page, /<JourneyBoard counts=\{labels\.tasks\} stageNotes=\{labels\.stages\} \/>/);
  const board = stripComments(read("app/journey/JourneyBoard.tsx"));
  assert.match(board, /const count = t\.count \?\? counts\[t\.href\];/);
  /* [v4 · 규칙 5] 할 일 카드 → 구분선 목록 행(SummaryRow). 실측은 행 오른쪽 값(value)으로 — 예전 카드 안 span 대신 */
  assert.match(board, /<SummaryRow key=\{t\.href\} label=\{t\.label\}[^>]*value=\{count\} href=\{t\.href\} \/>/);
  /* [v4 · 규칙 3] 단계 실측(stageNotes)은 설명 문장 뒤가 아니라 단계 보조 한 줄의 사실 목록에 */
  assert.match(board, /stageNotes\[s\.id\] \?\? null,/);
  /* 문구: 저장 안내에 숫자(체크 칸 수) */
  assert.doesNotMatch(board, /체크는 이 기기에 저장돼요\. 로그인하면/);
  assert.match(board, /`체크 \$\{total\}개는 이 기기에 저장 · 로그인하면 계정에도 저장돼/);
  /* 단계 1 설명·게임 카드 부제 — 3W(언제·어디서·출처) */
  const market = JOURNEY_STAGES[0];
  assert.match(market.why, /국토교통부/);
  assert.doesNotMatch(market.why, /^요즘 얼마에 거래되는지/);
  const quiz = market.tasks.find((t) => t.href === "/quiz");
  assert.ok(quiz);
  assert.match(quiz.desc, /전용 84㎡ 안팎 두 단지/);
  assert.match(quiz.desc, /국토교통부 신고분 · 날마다 새 문제/);
  /* counts 로더는 개인화를 읽지 않고, 다른 화면과 같은 원천만 읽는다 */
  const counts = stripComments(read("lib/journey/counts.ts"));
  for (const src of ["@/lib/quiz/load-price-game", "@/lib/newui/home-coverage", "@/lib/imjang/guide", "@/lib/seo/glossary-terms", "@/lib/finance/brokerage", "@/lib/finance/loan-rules"]) {
    assert.match(counts, new RegExp(`from "${src.replace(/[/.]/g, (m) => `\\${m}`)}"`), src);
  }
  assert.doesNotMatch(counts, /cookies\(|headers\(|auth\(|getSession\(|getUser\(/);
  assert.match(counts, /listImjangRegions\(48\)/, "/imjang 인덱스와 같은 상한");
});
