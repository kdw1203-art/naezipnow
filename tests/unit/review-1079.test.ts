/* [1079] 소유자 2026-10-19 — "추가로 필요한 부분도 검토해서 같이 제공". 운영(1077b) 50쪽 PC·폰 재실측.
 *  S1 뉴스 썸네일 — 목록이 매체 원본(1200px · 최대 3.3MB)을 64×48 칸에 받아 폰 한 번 8.5MB. 매체 호스트는 /_next/image 허용 밖,
 *     수집기는 DB 함수(코드 밖) → 글 id 로 받는 /api/town/news/thumb/<id>(176×132 webp · CDN 30일). 주소가 아니라 id 라 프록시가 아니다.
 *  S2 썸네일 호출부 — 뉴스룸 목록 · "많이 본" 레일 · 홈 뉴스룸 · 주제 목록 · 다이제스트 전부 id 경로(원본 src 0).
 *  S3 고객센터 — "투자·제휴 문의"만 AI 남색 판(ai-panel)이라 옆 "광고 문의"(흰 카드)와 재질이 달랐다 → 같은 card.
 *  S4 /qna — 보관 영역이라 TownHero 가 비어 h1 0 · 제목 없음(운영 실측) → PageHead "단지 Q&A"(본문 h1 · 스켈레톤 h2).
 *  S5 폰 탭 — .chip 규칙 밖의 손수 만든 알약(용어사전 31 · 청약 정렬 29~31 · 개발물건 34 · 정비사업 34~36)과 텍스트 단추 → 40px/.tap-line ·
 *     비밀번호 찾기 ✕ 23px → 40×40 · "로그인" 15px → .tap-line.
 *  S6 지도 안내 말투 "…평균이에요. …다른 값이에요." → 낱말. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { isFetchableImageOrigin, newsThumbPath, NEWS_THUMB_H, NEWS_THUMB_ID_RE, NEWS_THUMB_W } from "@/lib/news/thumb";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("S1 썸네일 모듈 — 경로 · 원본 주소 판정 · 크기", () => {
  assert.equal(newsThumbPath("3a72cd15-23b8-4039-a35b-99197268bb2d"), "/api/town/news/thumb/3a72cd15-23b8-4039-a35b-99197268bb2d");
  assert.ok(NEWS_THUMB_ID_RE.test("3a72cd15-23b8-4039-a35b-99197268bb2d"));
  assert.ok(!NEWS_THUMB_ID_RE.test("../x") && !NEWS_THUMB_ID_RE.test("a b") && !NEWS_THUMB_ID_RE.test(""));
  assert.equal(NEWS_THUMB_W / NEWS_THUMB_H, 4 / 3);
  assert.equal(NEWS_THUMB_W, 176); // 목록 칸 88px 의 2배
  for (const ok of ["https://img1.newsis.com/2026/10/15/x.jpg", "http://www.domin.co.kr/news/photo/x.jpg"]) assert.ok(isFetchableImageOrigin(ok), ok);
  for (const bad of ["ftp://a.com/x.jpg", "https://localhost/x.jpg", "https://127.0.0.1/x.jpg", "https://10.0.0.5/x.jpg", "https://[::1]/x", "https://metadata.internal/x", "https://host/x.jpg", "not a url", ""])
    assert.ok(!isFetchableImageOrigin(bad), bad);
});

test("S1 썸네일 변환 — 1200×630 PNG → 176×132 webp(수 KB)", async () => {
  const big = await sharp({ create: { width: 1200, height: 630, channels: 3, background: { r: 30, g: 60, b: 120 } } }).png().toBuffer();
  const out = await sharp(big).rotate().resize(NEWS_THUMB_W, NEWS_THUMB_H, { fit: "cover", position: "centre" }).webp({ quality: 74 }).toBuffer();
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, NEWS_THUMB_W);
  assert.equal(meta.height, NEWS_THUMB_H);
  assert.ok(out.byteLength < 20 * 1024, `thumb ${out.byteLength}B`);
});

test("S1 라우트 — 글 id 로만 · 뉴스 글만 · CDN 30일 · 404 도 1시간", () => {
  const r = read("app/api/town/news/thumb/[id]/route.ts");
  assert.match(r, /export const runtime = "nodejs";/);
  assert.match(r, /if \(!NEWS_THUMB_ID_RE\.test\(id\)\) return miss\(400\);/);
  assert.match(r, /if \(!post \|\| !isNewsPost\(post\)\) return miss\(\);/);
  assert.match(r, /origin = newsImageUrl\(post\);/);
  assert.match(r, /if \(!origin \|\| !isFetchableImageOrigin\(origin\)\) return miss\(\);/);
  assert.match(r, /\.resize\(NEWS_THUMB_W, NEWS_THUMB_H, \{ fit: "cover", position: "centre" \}\)/);
  assert.match(r, /"Content-Type": "image\/webp"/);
  assert.match(r, /const OK_CACHE = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800";/);
  assert.match(r, /const MISS_CACHE = "public, max-age=600, s-maxage=3600";/);
  assert.match(r, /ORIGIN_MAX_BYTES = 12 \* 1024 \* 1024/);
  assert.match(r, /const THUMB_RATE_LIMIT = \{ max: 240, windowMs: 60_000 \}/);
  /* 주소(searchParams)로 받는 길이 없어야 프록시가 아니다 */
  assert.doesNotMatch(r, /searchParams|sp\.get\(/);
});

test("S2 호출부 — 다섯 화면 전부 id 경로 · 원본 src 0", () => {
  const list = strip(read("app/town/news/NewsListClient.tsx"));
  assert.match(list, /src=\{newsThumbPath\(row\.id\)\}/);
  assert.doesNotMatch(list, /src=\{row\.image\}/);
  assert.match(list, /const thumb = Boolean\(row\.image\) && !thumbFailed;/); // 원본 주소 없는 글은 요청하지 않는다
  assert.match(strip(read("app/town/news/(index)/page.tsx")), /<CoverImage src=\{newsThumbPath\(r\.id\)\} alt=""/);
  assert.match(strip(read("app/components/home/HomeTownBlock.tsx")), /<CoverImage src=\{newsThumbPath\(n\.id\)\} alt=\{n\.title\}/);
  assert.match(strip(read("app/town/news/tag/[tag]/page.tsx")), /src=\{newsImageUrl\(p\) \? newsThumbPath\(p\.id\) : null\}/);
  assert.match(strip(read("app/digest/(index)/page.tsx")), /<DigestThumb src=\{newsThumbPath\(n\.id\)\}/);
  for (const f of ["app/town/news/NewsListClient.tsx", "app/town/news/(index)/page.tsx", "app/components/home/HomeTownBlock.tsx", "app/town/news/tag/[tag]/page.tsx", "app/digest/(index)/page.tsx"])
    assert.match(read(f), /import \{ newsThumbPath \} from "@\/lib\/news\/thumb";/, f);
});

test("S3 고객센터 — 두 문의 카드 같은 재질", () => {
  const s = read("app/support/page.tsx");
  const partner = s.slice(s.indexOf('<section id="partner"'), s.indexOf('<section id="ads"'));
  assert.match(partner, /className="card flex scroll-mt-24 flex-col gap-2 rounded-2xl p-5"/);
  assert.doesNotMatch(partner, /ai-panel|text-white|text-ai-text|text-ai-accent/);
  assert.match(partner, /t-sub font-bold text-primary/);
});

test("S4 /qna — 머리 한 줄(h1) · 스켈레톤 h2", () => {
  const p = strip(read("app/qna/page.tsx"));
  assert.match(p, /<PageHead icon="help" title="단지 Q&A" sub="단지별 질문 · 답변" className="mb-4" \/>/);
  assert.doesNotMatch(p, /TownHero/);
  const l = strip(read("app/qna/loading.tsx"));
  assert.match(l, /<PageHead icon="help" title="단지 Q&A" sub="단지별 질문 · 답변" as="h2" className="mb-4" \/>/);
  assert.doesNotMatch(l, /TownHero/);
  assert.match(read("app/components/Icon.tsx"), /^\s+help: '/m);
});

test("S5 폰 탭 — 손수 만든 알약 40px · 텍스트 단추 .tap-line · ✕ 40×40", () => {
  assert.match(read("app/glossary/GlossarySearch.tsx"), /className="inline-flex min-h-10 items-center rounded-full border border-line bg-surface px-3 py-1\.5 t-sub font-bold text-text-1 md:min-h-8"/);
  const a = read("app/apply/ApplySearchClient.tsx");
  assert.match(a, /"press inline-flex min-h-10 items-center rounded-full bg-brand-navy px-3 py-1\.5 t-sub font-bold text-on-dark md:min-h-8"/);
  assert.match(a, /"press glass inline-flex min-h-10 items-center rounded-full px-3 py-1\.5 t-sub font-semibold text-text-2 md:min-h-8"/);
  assert.match(read("app/apply/page.tsx"), /className="glass press inline-flex min-h-10 items-center rounded-full px-3\.5 py-2 t-sub font-bold text-primary no-underline md:min-h-8"/);
  const d = read("app/dev-deals/DevDealsListClient.tsx");
  assert.equal((d.match(/glass inline-flex min-h-10 items-center rounded-full px-3\.5 py-2 t-sub font-bold text-(text-1|primary) no-underline press md:min-h-8/g) ?? []).length, 2);
  const r = read("app/redevelopment/RedevelopmentMap.tsx");
  assert.match(r, /press inline-flex min-h-10 items-center gap-1\.5 rounded-full border px-3\.5 py-2 t-body font-bold md:min-h-9/);
  assert.match(r, /press ml-auto inline-flex min-h-10 items-center gap-1 rounded-full border border-line bg-surface px-3 py-2 t-sub font-semibold text-text-2 md:min-h-9/);
  assert.match(read("app/notes/new/NoteMapPick.tsx"), /className="tap-line shrink-0 py-\[5px\] t-sub font-bold text-primary"/);
  assert.match(read("app/notes/new/NoteForm.tsx"), /className="tap-line shrink-0 py-1 t-sub font-bold text-primary"\s*>\s*지금 시간대/);
  assert.match(read("app/page.tsx"), /className="tap-line w-fit py-1\.5 t-sub font-bold text-ai-accent no-underline"\s*>\s*정리된 공개 노트 보기/);
  const f = read("app/forgot-password/page.tsx");
  assert.match(f, /<Link href=\{loginHref\} className="-mr-\[12px\] -mt-\[12px\] inline-flex h-10 w-10 items-center justify-center text-\[15px\] text-text-3" aria-label="닫기">/);
  assert.match(f, /<Link href=\{loginHref\} className="tap-line font-bold text-primary">\s*로그인/);
});

test("S6 지도 안내 — 낱말", () => {
  const m = read("app/map/map-client.tsx");
  assert.match(m, /body: "지도·목록 금액은 국토교통부 실거래가 평균 · 매물 호가와 다름",/);
  assert.doesNotMatch(m, /평균이에요|다른 값이에요|표시돼요/);
  assert.match(m, /목록 가격은 매매 실거래 평균 · 전세 보증금은 지도 마커/);
});
