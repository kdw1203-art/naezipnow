/* [1075] 전 페이지 검토(1073 §4) 세 번째 묶음 — 소유자 2026-10-18 지시 셋을 한 묶음으로:
 *  "이런 2줄로 되어 있는 부분, 불필요 설명이 있는 부분들은 … 신뢰도 하락" (전문가 소개 칸 캡처)
 *  "동네이야기, 청약센터, 공매물건, 입주물량, 정비사업지도, 전문가의 디자인 테마가 달라 … 신뢰도 하락"
 *  "이것도 두 줄이고 뉴스 이외의 요소들이 너무 복잡해보여" (뉴스룸 캡처)
 *  Q1 한 가지 테마 — .theme-auction(보라) · .theme-supply(초록) · .theme-dev-deals(앰버) · .qna-theme(청록) 의 --primary 계열을 루트로(inherit).
 *  Q2 어두운 요약 판 — /auctions "공매 요약" · /supply "입주 물량 요약"(머리 숫자와 같은 수를 남색 판에 한 번 더) 삭제.
 *  Q3 제목 한 줄 — 전문가 소개(두 줄 제목 + 설명 세 줄 → 제목 + 분야 칩) · 전문가 참여(h1 + 분야 줄) · 지역 상세 h2(건수는 옆 캡션) ·
 *     시장 온도 결론(차가운 곳은 근거 줄로) · 공매 입찰마감 날짜(같은 해·달 한 번만).
 *  Q4 설명 덜기 — /agent 두 문단 → 한 줄 · 지역 머리 "통계 아직 없음" 문단 → 출처 줄 하나.
 *  Q5 뉴스룸 — 머리 아래 주제 칩 18개 줄 삭제(레일 "주제" 카드로) · 첫 행 톱기사(t-title 두 줄) 삭제 · 남색 다이제스트 판 → 흰 카드 ·
 *     "정비사업 · 입주 물량" 레일 카드 삭제. 제목은 한 줄 말줄임.
 *  Q6 임장노트 — 연구소 커버(4:5)가 넓은 칸(1200/630)에서 아래가 잘림 → 커버 비율 · 연구소 커버 위에 제목 덧씌우기 금지 · "✓" 기호 삭제.
 *  Q7 정비사업 지도 — 형제와 같은 폭(1080px 가운데 → 전폭).
 *  Q8 경보 메일 — 대상 단위 줄(2026-10-08 발송분에서 같은 검사의 둘째 문제가 접혀 사라졌다). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

test("Q1 한 가지 테마 — 네 화면 테마의 --primary 계열은 루트 값(inherit) · 뒤에 덧붙임", () => {
  const css = read("app/globals.css");
  const at = css.indexOf("[1075 · 한 가지 테마]");
  assert.ok(at > 0, "1075 블록이 없다");
  assert.ok(at > css.lastIndexOf(".theme-dev-deals {\n  --primary: #"), "원래 정의보다 뒤에 있어야 이긴다");
  const block = css.slice(at);
  assert.match(
    block,
    /\.theme-auction,\s*\.theme-supply,\s*\.theme-dev-deals,\s*\.qna-theme,\s*\.dark \.theme-auction,\s*\.dark \.theme-supply,\s*\.dark \.theme-dev-deals,\s*\.dark \.qna-theme \{\s*--primary: inherit;\s*--primary-soft: inherit;\s*--primary-strong: inherit;\s*--primary-fill: inherit;\s*\}/,
  );
  /* 테마 클래스는 화면에 그대로(대비 검사 PAGE_THEMES 가 보는 자리) */
  assert.match(read("app/auctions/page.tsx"), /className="theme-auction"/);
  assert.match(read("app/supply/page.tsx"), /className="theme-supply"/);
  /* 동네 카테고리 줄 여섯 칸 · 머리 아이콘 칩 — 초록(뜻색) 대신 전부 파랑 */
  const links = read("lib/town/category-links.ts");
  assert.equal((links.match(/tone: "bg-primary-soft text-primary"/g) ?? []).length, 6);
  assert.doesNotMatch(links, /tone: "bg-success-soft/);
  assert.match(read("app/redevelopment/seoul/page.tsx"), /tone="bg-primary-soft text-primary"/);
  assert.match(read("app/redevelopment/seoul/[gu]/page.tsx"), /tone="bg-primary-soft text-primary"/);
});

test("Q2 어두운 요약 판 삭제 — 공매 · 입주 물량(머리 숫자는 그대로)", () => {
  const a = read("app/auctions/AuctionsClient.tsx");
  assert.doesNotMatch(a, /AIPanel/);
  assert.doesNotMatch(a, /aria-label="공매 요약"|title="공매 요약"/);
  assert.match(a, /aria-label="공매 물건 요약"/);
  const s = read("app/supply/SupplyClient.tsx");
  assert.doesNotMatch(s, /AIPanel/);
  assert.doesNotMatch(s, /aria-label="입주 물량 요약"|title="입주 물량 요약"/);
});

test("Q3 제목 한 줄 — 전문가 · 참여 · 지역 h2 · 시장 온도 · 입찰마감", () => {
  const e = read("app/town/experts/page.tsx");
  assert.match(e, /<p className="t-section text-ink">인증 전문가<\/p>/);
  assert.match(e, /<nav className="mt-2 flex flex-wrap gap-1\.5" aria-label="분야별 전문가">/);
  assert.match(e, /href=\{`\/town\/experts\/c\/\$\{t\.id\}`\}/);
  assert.match(e, /className="chip inline-flex min-h-\[40px\] items-center border border-line bg-surface px-2\.5 t-sub font-bold text-text-2 no-underline md:min-h-\[32px\]"/);
  assert.doesNotMatch(e, /KeywordChips/);
  assert.doesNotMatch(e, /개인 · 개인사업자 · 법인 모두/);

  const j = read("app/town/experts/join/page.tsx");
  assert.match(j, /<h1 className="mt-1 t-title text-ink">전문가 참여 신청<\/h1>\s*<p className="mt-2 t-body text-text-2">공인중개사 · 세무사 · 감정평가사 · 대출상담사 · 건축사<\/p>/);

  const r = read("app/region/[id]/page.tsx");
  assert.match(r, /<h2 className="t-section text-ink">면적대·가격대별 실거래<\/h2>\s*<span className="t-caption tabular-nums text-text-3">국토부 신고 \{txBandRegion\.txCount\.toLocaleString\("ko-KR"\)\}건 기준<\/span>/);

  const c = read("lib/market/region-conclusion.ts");
  assert.match(c, /const title = same \? `\$\{head\} \$\{nm\(i\.hottest\.label\)\} \$\{i\.hottest\.score\}` : `\$\{head\} 가장 뜨거운 곳 \$\{nm\(i\.hottest\.label\)\} \$\{i\.hottest\.score\}`;/);
  assert.match(c, /same \? null : `가장 차가운 곳 \$\{nm\(i\.coldest!\.label\)\} \$\{i\.coldest!\.score\}`/);

  const a = read("app/auctions/AuctionsClient.tsx");
  assert.match(a, /function fmtDtRange\(a: string, b: string\): string \{/);
  assert.match(a, /if \(a\.slice\(0, 6\) === b\.slice\(0, 6\)\) return `\$\{fmtDt\(a\)\}~\$\{b\.slice\(6, 8\)\}`;/);
  assert.match(a, /if \(a\.slice\(0, 4\) === b\.slice\(0, 4\)\) return `\$\{fmtDt\(a\)\}~\$\{b\.slice\(4, 6\)\}\.\$\{b\.slice\(6, 8\)\}`;/);
  assert.match(a, /endDigits\.length > 0 \? fmtDtRange\(endDigits\[0\], endDigits\[endDigits\.length - 1\]\) : null/);
});

test("Q4 설명 덜기 — 에이전트 한 줄 · 지역 머리 출처 한 줄", () => {
  const ag = read("app/agent/page.tsx");
  assert.match(ag, /내 임장노트 · 국토교통부 실거래 <b>직접 조회<\/b> 후 답변 · 기억·추정 시세 없음 · 조회한 데이터 목록 표시 · 수도권 실거래 기준/);
  assert.doesNotMatch(ag, /에이전트는 여러 데이터를 검색·조합해/);
  const h = read("app/region/[id]/RegionHero.tsx");
  assert.doesNotMatch(h, /아래 숫자는 국토교통부 실거래 신고/);
  /* 인용 문단(speakable) 첫 문장 — 통계 없는 지역은 세 문장 → 한 문장 · 빈 추세 칸은 "○○ 없음" 꼴 */
  const rp = read("app/region/[id]/page.tsx");
  assert.match(rp, /`\$\{name\}의 실거래·거래량은 국토교통부 신고 자료입니다\(한국부동산원 R-ONE 지역 시세 통계는 공표되면 반영\)\.`/);
  assert.doesNotMatch(rp, /그때 붙습니다|모이지 않았어요/);
  assert.match(rp, /매매가격지수·월별 거래량 두 달 치 이상 없음/);
  /* 시장 온도 타일 — 지역은 줄이고 점수는 늘 보인다 · "지난주 대비" 설명 한 줄 */
  const tm = read("app/analysis/temperature/TempMapClient.tsx");
  assert.equal((tm.match(/<span className="kpi-v flex items-baseline gap-1\.5">\s*<span className="min-w-0 truncate">\{stats\.(hottest|coldest)\.current\.regionLabel\}<\/span>\s*<span className="shrink-0">\{stats\.(hottest|coldest)\.current\.score\}<\/span>/g) ?? []).length, 2);
  assert.match(tm, /<span className="kpi-d">비교 가능한 \{stats\.compared\}곳 기준<\/span>/);
  assert.doesNotMatch(tm, /kpi-v truncate/);
  assert.match(h, /overview\.hasReb \? "한국부동산원\(R-ONE\) 월간 통계" : "국토교통부 실거래 신고\(한국부동산원 지역 통계 없음 · 공표되면 반영\)"/);
});

test("Q5 뉴스룸 — 머리 아래 칩 줄 없음 · 톱기사 없음 · 제목 한 줄 · 다이제스트 흰 카드 · 주제는 레일 카드", () => {
  const idx = read("app/town/news/(index)/page.tsx");
  assert.match(idx, /<section className="card rounded-2xl px-4 py-4" aria-label="주제별 뉴스">\s*<h2 className="t-section text-ink">주제<\/h2>/);
  assert.equal((idx.match(/NEWS_TAGS\.map\(/g) ?? []).length, 1, "주제 칩은 한 곳(레일)");
  assert.ok(idx.indexOf("NEWS_TAGS.map(") > idx.indexOf('aria-label="뉴스룸 보조"'), "칩은 레일 안");
  assert.doesNotMatch(idx, /aria-label="정비사업 · 입주 물량"|>정비사업 · 입주 물량</);
  assert.doesNotMatch(idx, /brand-navy-card|ai-panel|AIPanel/);
  assert.match(idx, /className="rise-in card flex items-center justify-between gap-3 rounded-2xl px-4 py-4 no-underline"/);

  const list = read("app/town/news/NewsListClient.tsx");
  assert.match(list, /\{list\.map\(\(row\) => \(\s*<NewsRowView key=\{row\.id\} row=\{row\} \/>\s*\)\)\}/);
  assert.doesNotMatch(list, /lead=\{/);
  assert.match(list, /<span className=\{lead \? "line-clamp-3" : "line-clamp-1"\}>\{row\.title\}<\/span>/);
});

test("Q6 임장노트 — 연구소 커버 비율 · 덧씌우기 금지 · 기호 없음", () => {
  const m = read("app/notes/market/page.tsx");
  assert.match(m, /import \{ isLabAuthor \} from "@\/lib\/notes\/author-label";/);
  assert.match(m, /const lab = isLabAuthor\(note\.authorLabel\);/);
  assert.match(m, /className=\{`relative w-full overflow-hidden bg-bg \$\{lab \? "aspect-\[4\/5\]" : "aspect-\[1200\/630\]"\}`\}/);
  assert.match(m, /<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">/);
  assert.doesNotMatch(m, /✓/);
  assert.match(m, />\s*직접 방문 인증\s*<\/span>/);
  const f = read("app/notes/notes-feed-client.tsx");
  assert.match(f, /\{!n\.coverTemplate && !n\.lab && \(/);
});

test("Q7 정비사업 지도 — 형제와 같은 폭", () => {
  const p = read("app/redevelopment/(index)/page.tsx");
  assert.doesNotMatch(p, /max-w-\[1080px\]/);
  assert.match(p, /<TownCategoryNav stick \/>\s*\{\/\* \[1075[^]*?\*\/\}\s*<div className="flex w-full flex-col gap-6 max-md:gap-3">/);
});

test("Q8 경보 메일 — 대상 단위 줄 · 제목은 종류 수 · 발생 합계", () => {
  const r = read("app/api/cron/alert-email/route.ts");
  assert.match(r, /const rows = active;\s*const total = rows\.reduce\(\(n, a\) => n \+ a\.count, 0\);/);
  assert.match(r, /const lines = rows\.map\(\(a\) => `• \$\{a\.checkName\} — \$\{a\.count\}회\$\{a\.detail \? `\\n  \$\{a\.detail\}` : ""\}`\);/);
  assert.match(r, /const names = \[\.\.\.new Set\(rows\.map\(\(a\) => a\.checkName\)\)\];/);
  assert.match(r, /subject: `\[내집나우 경보\] 심각 \$\{names\.length\}종 · \$\{total\}건 \(24시간\)`/);
  assert.match(r, /p_alert_count: total,/);
  /* 예전 꼴(검사 이름으로 다시 접기)은 없다 */
  assert.doesNotMatch(r, /byName|new Map<string/);
});
