// [1030 · 운영 루프] 디자인 일관성 실측 — 글자 크기·굵기·반경·그림자·색 수·카드 여백·채움 파랑 수·줄 길이·첫 화면 숫자.
// 쓰임: OUT=reports/review/2026-41 ROUTES=scripts/review/routes.json MODE=d|m node scripts/review/design-probe.mjs
import { chromium } from "playwright";
import fs from "node:fs";
const OUT = process.env.OUT; const BASE = process.env.BASE || "https://naezipnow.com";
const routesFile = JSON.parse(fs.readFileSync(process.env.ROUTES || new URL("./routes.json", import.meta.url), "utf8"));
const routes = Array.isArray(routesFile) ? routesFile : routesFile.routes;
const MODE = process.env.MODE || "d";
const BLOCK = /\/api\/(metrics|monitoring|platform\/event|ai\/analysis|ai\/feedback)|_vercel\/(insights|speed-insights)|fundingchoices/;
const UA_D = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const UA_M = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const b = await chromium.launch(); const results = [];
for (const path of routes) {
  const mobile = MODE === "m"; const vp = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const ctx = await b.newContext({ viewport: vp, userAgent: mobile ? UA_M : UA_D, serviceWorkers: "block", locale: "ko-KR", deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => false }); try { localStorage.setItem("nz_probe", "1"); /* [1043] 점검 로봇 표식 — 실사용 지표에 섞이지 않게(lib/client/probe.ts) */ localStorage.setItem("nz_cookie_consent", JSON.stringify({ analytics: false, decidedAt: "2026-10-03T00:00:00.000Z" })); localStorage.setItem("nz_tour_map", "1"); localStorage.setItem("nz_seen_auction_layer", "1"); } catch {} });
  await ctx.route("**/*", (r) => (BLOCK.test(r.request().url()) ? r.abort() : r.continue()));
  const pg = await ctx.newPage(); const rec = { path, mode: MODE };
  try { await pg.goto(BASE + path, { waitUntil: "load", timeout: 60000 }); } catch (e) { rec.err = String(e.message).slice(0, 100); }
  await pg.waitForTimeout(3500);
  try {
    rec.m = await pg.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(e); return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0"; };
      const all = [...document.body.querySelectorAll("*")].filter(vis);
      const txt = all.filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim().length > 1));
      const cnt = (arr) => { const m = {}; for (const k of arr) m[k] = (m[k] || 0) + 1; return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); };
      const fs = cnt(txt.map((e) => Math.round(parseFloat(getComputedStyle(e).fontSize) * 2) / 2));
      const fw = cnt(txt.map((e) => getComputedStyle(e).fontWeight));
      const ff = cnt(txt.map((e) => getComputedStyle(e).fontFamily.split(",")[0].replace(/"/g, "").trim()));
      const colors = cnt(txt.map((e) => getComputedStyle(e).color));
      const bgs = cnt(all.filter((e) => { const c = getComputedStyle(e).backgroundColor; return c && !c.endsWith(", 0)") && c !== "rgba(0, 0, 0, 0)"; }).map((e) => getComputedStyle(e).backgroundColor));
      const radii = cnt(all.filter((e) => getComputedStyle(e).borderTopLeftRadius !== "0px").map((e) => getComputedStyle(e).borderTopLeftRadius));
      const shadows = cnt(all.filter((e) => getComputedStyle(e).boxShadow !== "none").map((e) => getComputedStyle(e).boxShadow.slice(0, 60)));
      const grads = all.filter((e) => /gradient/.test(getComputedStyle(e).backgroundImage)).map((e) => e.tagName.toLowerCase() + "." + String(e.className).split(" ").slice(0, 2).join(".")).slice(0, 6);
      // 채움 파랑 버튼(= --primary 배경) 보이는 것
      const prim = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
      const toRgb = (hex) => { const h = hex.replace("#", ""); return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`; };
      const primRgb = prim.startsWith("#") ? toRgb(prim) : prim;
      const blueFills = all.filter((e) => ["A", "BUTTON"].includes(e.tagName) && getComputedStyle(e).backgroundColor === primRgb).map((e) => (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 24));
      // 카드 여백
      const cards = all.filter((e) => e.classList.contains("card"));
      const cardPad = cnt(cards.map((e) => { const cs = getComputedStyle(e); return `${cs.paddingTop}/${cs.paddingLeft}`; }));
      const cardRadius = cnt(cards.map((e) => getComputedStyle(e).borderTopLeftRadius));
      // 본문 줄 길이: p 요소의 폭 / (fontSize*0.95) ≈ 한글 글자 수
      const longLines = txt.filter((e) => ["P", "LI", "DD", "TD"].includes(e.tagName)).map((e) => { const r = e.getBoundingClientRect(); const f = parseFloat(getComputedStyle(e).fontSize); const chars = Math.round(r.width / (f * 0.95)); const len = (e.textContent || "").trim().length; return { chars, len, t: (e.textContent || "").trim().slice(0, 40) }; }).filter((x) => x.len > x.chars && x.chars > 60).slice(0, 5);
      // 첫 화면 숫자·글자
      const inView = txt.filter((e) => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
      const viewText = inView.map((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(" ")).join(" ");
      const numbers = (viewText.match(/\d[\d,.]*/g) || []).length;
      // 제목 위계
      const h = {}; for (const t of ["h1", "h2", "h3"]) { const el = [...document.querySelectorAll(t)].find(vis); if (el) h[t] = { fs: getComputedStyle(el).fontSize, fw: getComputedStyle(el).fontWeight, n: document.querySelectorAll(t).length }; }
      const body = txt.filter((e) => e.tagName === "P"); const bodyFs = body.length ? cnt(body.map((e) => getComputedStyle(e).fontSize)) : {};
      // 아이콘 크기
      const icons = cnt(all.filter((e) => e.tagName === "svg").map((e) => Math.round(e.getBoundingClientRect().width)));
      // 버튼 높이 종류 (보이는 button/a.btn)
      const btnH = cnt(all.filter((e) => e.tagName === "BUTTON" || /\bbtn-/.test(String(e.className))).map((e) => Math.round(e.getBoundingClientRect().height)));
      // 여백: 섹션 간 간격 — main 직계 자식들의 세로 간격
      const main = document.querySelector("main") || document.body; const kids = [...main.children].filter(vis);
      const gaps = []; for (let i = 1; i < kids.length; i++) { const a = kids[i - 1].getBoundingClientRect(), c = kids[i].getBoundingClientRect(); gaps.push(Math.round(c.top - a.bottom)); }
      return { fs, fw, ff, colorsN: Object.keys(colors).length, colors: Object.entries(colors).slice(0, 8), bgsN: Object.keys(bgs).length, radii, shadows, grads, blueFills, cardsN: cards.length, cardPad, cardRadius, longLines, numbers, viewChars: viewText.replace(/\s+/g, "").length, h, bodyFs, icons, btnH, gaps: cnt(gaps), docH: document.documentElement.scrollHeight };
    });
  } catch (e) { rec.err = (rec.err || "") + " probe:" + String(e.message).slice(0, 100); }
  results.push(rec); console.log(path, rec.err || "ok", rec.m ? `fs=${Object.keys(rec.m.fs).length} radii=${Object.keys(rec.m.radii).length} blue=${rec.m.blueFills.length} nums=${rec.m.numbers}` : "");
  await ctx.close();
}
fs.writeFileSync(`${OUT}/probe4_${MODE}.json`, JSON.stringify(results, null, 1)); await b.close();
