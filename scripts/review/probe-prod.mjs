// [1030 · 운영 루프] 운영 실측 — 경로별 콘솔 오류·실패 요청·응답 코드·메타·접근성(axe)·가로 넘침·키보드 초점·다크 캡처.
// 쓰임: OUT=reports/review/2026-41 ROUTES=scripts/review/routes.json MODE=d|m DARK=0|1 node scripts/review/probe-prod.mjs
import { chromium } from "playwright";
import fs from "node:fs";
const OUT = process.env.OUT; fs.mkdirSync(OUT + "/dark", { recursive: true });
const BASE = process.env.BASE || "https://naezipnow.com";
const routesFile = JSON.parse(fs.readFileSync(process.env.ROUTES || new URL("./routes.json", import.meta.url), "utf8"));
const routes = Array.isArray(routesFile) ? routesFile : [...routesFile.routes, ...(routesFile.notfound || [])];
const AXE = fs.readFileSync(new URL("../../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const BLOCK = /\/api\/(metrics|monitoring|platform\/event|ai\/analysis|ai\/feedback)|_vercel\/(insights|speed-insights)/;
const UA_D = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const UA_M = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const MODE = process.env.MODE || "d"; // d | m
const DARK = process.env.DARK === "1";
const b = await chromium.launch();
const results = [];
for (const path of routes) {
  const mobile = MODE === "m";
  const vp = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const ctx = await b.newContext({ viewport: vp, userAgent: mobile ? UA_M : UA_D, serviceWorkers: "block", locale: "ko-KR", deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, colorScheme: DARK ? "dark" : "light" });
  await ctx.addInitScript((dark) => { Object.defineProperty(navigator, "webdriver", { get: () => false }); try { localStorage.setItem("nz_cookie_consent", JSON.stringify({ analytics: false, decidedAt: "2026-10-03T00:00:00.000Z" })); localStorage.setItem("nz_tour_map", "1"); localStorage.setItem("nz_seen_auction_layer", "1"); localStorage.setItem("theme", dark ? "dark" : "light"); } catch {} }, DARK);
  await ctx.route("**/*", (r) => (BLOCK.test(r.request().url()) ? r.abort() : r.continue()));
  const pg = await ctx.newPage();
  const rec = { path, mode: MODE, dark: DARK, status: null, pageErrors: [], consoleErrors: [], consoleWarns: [], failed: [], meta: {}, a11y: {}, overflow: {}, focus: [], axe: null };
  pg.on("pageerror", (e) => rec.pageErrors.push(String(e.message).slice(0, 240)));
  pg.on("console", (m) => { const t = m.type(); if (t === "error") rec.consoleErrors.push(m.text().slice(0, 240)); else if (t === "warning") rec.consoleWarns.push(m.text().slice(0, 160)); });
  pg.on("response", (resp) => { const s = resp.status(); const u = resp.url(); if (s >= 400 && !BLOCK.test(u)) rec.failed.push(`${s} ${u.replace(BASE, "")}`.slice(0, 200)); });
  pg.on("requestfailed", (rq) => { const u = rq.url(); if (!BLOCK.test(u)) rec.failed.push(`FAIL ${rq.failure()?.errorText} ${u.replace(BASE, "")}`.slice(0, 200)); });
  try {
    const resp = await pg.goto(BASE + path, { waitUntil: "load", timeout: 60000 });
    rec.status = resp?.status();
  } catch (e) { rec.pageErrors.push("goto:" + String(e.message).slice(0, 120)); }
  await pg.waitForTimeout(3500);
  try {
    rec.meta = await pg.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const c = (s) => q(s)?.getAttribute("content") || null;
      return {
        title: document.title, titleLen: document.title.length,
        description: c('meta[name="description"]'), descLen: (c('meta[name="description"]') || "").length,
        canonical: q('link[rel="canonical"]')?.getAttribute("href") || null,
        ogImage: c('meta[property="og:image"]'), ogTitle: c('meta[property="og:title"]'), robots: c('meta[name="robots"]'),
        lang: document.documentElement.lang, h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim().slice(0, 80)),
        jsonld: document.querySelectorAll('script[type="application/ld+json"]').length,
        themeClass: document.documentElement.className,
      };
    });
    rec.a11y = await pg.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const imgsNoAlt = [...document.images].filter((i) => !i.hasAttribute("alt")).map((i) => (i.currentSrc || i.src).slice(-60));
      const name = (e) => (e.getAttribute("aria-label") || e.textContent || e.getAttribute("title") || "").trim();
      const btnsNoName = [...document.querySelectorAll("button, a[role=button]")].filter((e) => vis(e) && !name(e) && !e.querySelector("img[alt]") && !e.getAttribute("aria-labelledby")).map((e) => e.outerHTML.slice(0, 120));
      const linksNoName = [...document.querySelectorAll("a[href]")].filter((e) => vis(e) && !name(e) && !e.querySelector("img[alt]") && !e.getAttribute("aria-labelledby")).map((e) => e.outerHTML.slice(0, 120));
      const inputsNoLabel = [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].filter((e) => vis(e) && !e.labels?.length && !e.getAttribute("aria-label") && !e.getAttribute("aria-labelledby") && !e.getAttribute("placeholder")).map((e) => e.outerHTML.slice(0, 120));
      const headings = [...document.querySelectorAll("h1,h2,h3,h4")].map((h) => +h.tagName[1]);
      let skips = 0; for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) skips++;
      const dupIds = (() => { const m = {}; document.querySelectorAll("[id]").forEach((e) => (m[e.id] = (m[e.id] || 0) + 1)); return Object.entries(m).filter(([, n]) => n > 1).map(([k]) => k).slice(0, 10); })();
      const smallText = [...document.querySelectorAll("p,span,a,li,td,th,button,div")].filter((e) => vis(e) && e.children.length === 0 && (e.textContent || "").trim().length > 2).filter((e) => parseFloat(getComputedStyle(e).fontSize) < 11).length;
      return { imgsNoAlt: imgsNoAlt.slice(0, 5), imgsNoAltN: imgsNoAlt.length, btnsNoName: btnsNoName.slice(0, 5), btnsNoNameN: btnsNoName.length, linksNoName: linksNoName.slice(0, 5), linksNoNameN: linksNoName.length, inputsNoLabel: inputsNoLabel.slice(0, 5), inputsNoLabelN: inputsNoLabel.length, headingSkips: skips, headingsN: headings.length, dupIds, smallText, skipLink: !!document.querySelector('a[href="#main"], a[href^="#content"], .skip-link, [data-skip]'), main: document.querySelectorAll("main").length, docH: document.documentElement.scrollHeight };
    });
    // 가로 넘침 — 폰 360 · 태블릿 820 (현재 뷰포트에서도)
    for (const w of mobile ? [390, 360, 320] : [1440, 1024, 820]) {
      await pg.setViewportSize({ width: w, height: mobile ? 844 : 900 });
      await pg.waitForTimeout(500);
      rec.overflow[w] = await pg.evaluate(() => {
        const de = document.documentElement; const over = de.scrollWidth - de.clientWidth;
        const cul = [];
        if (over > 1) { for (const e of document.body.querySelectorAll("*")) { const r = e.getBoundingClientRect(); if (r.right > de.clientWidth + 1 && r.width > 20 && getComputedStyle(e).position !== "fixed") { cul.push(`${e.tagName.toLowerCase()}.${String(e.className).split(" ").slice(0, 3).join(".")}:${Math.round(r.right - de.clientWidth)}`); if (cul.length >= 4) break; } } }
        return { over, cul };
      });
    }
    await pg.setViewportSize(vp);
    // 포커스 — Tab 20번, 보이는 표시(outline/box-shadow 변화) 여부
    if (!DARK) {
      await pg.evaluate(() => window.scrollTo(0, 0));
      for (let i = 0; i < 20; i++) {
        await pg.keyboard.press("Tab");
        const f = await pg.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); const vis = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none"; const r = e.getBoundingClientRect(); return { tag: e.tagName.toLowerCase(), text: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30), vis, onscreen: r.top >= 0 && r.bottom <= innerHeight, w: Math.round(r.width), h: Math.round(r.height) }; });
        if (f) rec.focus.push(f);
      }
    }
    // axe
    await pg.addScriptTag({ content: AXE });
    const ax = await pg.evaluate(async () => { const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] }, resultTypes: ["violations"] }); return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => ({ t: n.target.join(" ").slice(0, 100), s: n.failureSummary?.slice(0, 160) })) })); });
    rec.axe = ax;
    if (DARK) {
      const name = path.replace(/[^A-Za-z0-9가-힣]+/g, "_").replace(/^_|_$/g, "") || "home";
      await pg.screenshot({ path: `${OUT}/dark/${MODE}_${name}.png`, fullPage: false });
    }
  } catch (e) { rec.pageErrors.push("probe:" + String(e.message).slice(0, 160)); }
  results.push(rec);
  console.log(`${path} ${rec.status} err=${rec.pageErrors.length}/${rec.consoleErrors.length} fail=${rec.failed.length} axe=${rec.axe ? rec.axe.reduce((a, v) => a + v.n, 0) : "-"} over=${Object.values(rec.overflow).map((o) => o.over).join("/")}`);
  await ctx.close();
}
fs.writeFileSync(`${OUT}/probe3_${MODE}${DARK ? "_dark" : ""}.json`, JSON.stringify(results, null, 1));
await b.close();
