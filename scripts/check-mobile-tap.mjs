#!/usr/bin/env node
/**
 * 모바일 조작 검사 — 390×844 터치 화면에서 **실제로 닿는 크기**를 잰다.
 *
 * 클래스만 봐서는 알 수 없다. globals.css 의 @media (pointer: coarse) 블록이
 * ::after 로 히트 영역을 넓히는 곳이 여럿이라 "보이는 상자"는 32px 인데 실제
 * 히트는 44px 인 경우가 많고, 반대로 넓힌 히트끼리 겹쳐 나중에 그려진 쪽이
 * 옆 요소의 탭을 가져가는 경우도 있다(둘 다 소스만 읽어서는 안 보인다).
 * 그래서 진짜 브라우저에서 document.elementFromPoint 로 점을 찍어 확인한다.
 *
 * 두 기준을 나눠 쓴다 — 하나로 묶으면 반드시 한쪽이 틀린다:
 *   · 주요 조작(버튼·칩·아이콘 버튼·입력·단독 링크)  → 40px  (WCAG 2.5.5 권고 44px 에
 *     맞춰 키우되, 인접 히트가 1~2px 겹치는 것까지 실패로 보지는 않는다)
 *   · 문장 속·목록 안 촘촘한 텍스트 링크            → 24px  (WCAG 2.5.8 최소 기준)
 * 약관 줄처럼 촘촘한 링크에 44px 를 강요하면 위아래 히트가 겹쳐 **엉뚱한 링크가
 * 열린다** — 넓히는 게 아니라 띄우는 게 맞는 자리다.
 *
 * 빌드 게이트 체인에는 넣지 않는다(서버 기동 + 브라우저 필요).
 *
 *   npm run build && npm start        (다른 창에서)
 *   npm run check:mobile
 *
 * 환경변수: TAP_BASE(기본 http://127.0.0.1:3000) · TAP_PAGES(쉼표 구분)
 *           TAP_PRIMARY(40) · TAP_INLINE(24) · TAP_MIN_FONT(11)
 */

const BASE = process.env.TAP_BASE || "http://127.0.0.1:3000";
const PRIMARY_MIN = Number(process.env.TAP_PRIMARY || 40);
const INLINE_MIN = Number(process.env.TAP_INLINE || 24);
const MIN_FONT = Number(process.env.TAP_MIN_FONT || 11);
const PAGES = (
  process.env.TAP_PAGES || "/,/map,/notes,/town,/analysis,/subscription,/notes/new,/support"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** 페이지 안에서 도는 코드 — 점을 찍어 실제 히트 범위를 잰다 */
function audit({ primaryMin, inlineMin, minFont, vw }) {
  const de = document.documentElement;
  const out = {
    overflowX: Math.max(0, de.scrollWidth - de.clientWidth),
    coarse: matchMedia("(pointer: coarse)").matches,
    small: [],
    tiny: [],
    offscreen: [],
  };
  const SEL = 'a,button,[role="button"],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
  /* 주요 조작 — 화면에서 **면을 가진** 조작. 버튼 태그라고 다 주요는 아니다:
     푸터의 "쿠키 설정"처럼 배경도 테두리도 없이 글자만 있는 <button> 은 옆 약관
     링크들과 같은 촘촘한 줄에 서 있어서, 여기에 40px 을 강요하면 위아래 링크의
     탭을 가져간다. 그래서 태그가 아니라 **보이는 면**으로 가른다. */
  const PRIMARY_CLASS =
    ".btn-primary,.btn-secondary,.btn-soft,.btn-outline,.btn-ghost,.btn-md,.btn-lg,.btn-sm," +
    ".chip,.map-chip,.icon-btn,.tap-44,.tab-link,[role=\"button\"]";
  const BOXY_TAG = /^(BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/;
  const hasSurface = (el, cs) => {
    if (el.tagName === "SUMMARY") return true; /* 줄 전체가 토글이라 항상 주요 */
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return true;
    const bg = cs.backgroundColor;
    const opaque = bg && bg !== "transparent" && !/rgba\(\s*0,\s*0,\s*0,\s*0\)/.test(bg);
    const bordered = ["Top", "Right", "Bottom", "Left"].some(
      (side) => parseFloat(cs["border" + side + "Width"]) > 0,
    );
    return opaque || bordered;
  };
  const seen = new Set();
  for (const el of document.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.pointerEvents === "none") continue;
    if (el.closest(".sr-only")) continue;
    /* 화면 밖으로 스크롤된 요소는 elementFromPoint 로 잴 수 없다 — 보이는 것만 */
    if (r.bottom < 0 || r.top > innerHeight) continue;

    const name = (
      el.tagName +
      (typeof el.className === "string" && el.className
        ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
        : "")
    ).slice(0, 80);
    const txt = (el.textContent || "").trim().slice(0, 24) || el.getAttribute("aria-label") || "";
    const key = name + "|" + txt;

    const isPrimary =
      el.matches(PRIMARY_CLASS) || (BOXY_TAG.test(el.tagName) && hasSurface(el, cs));
    const need = isPrimary ? primaryMin : inlineMin;
    const half = Math.floor(need / 2) - 1; /* 경계 1px 은 봐준다 */
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const reach = (dx, dy) => {
      const hit = document.elementFromPoint(cx + dx, cy + dy);
      return hit ? hit === el || el.contains(hit) || hit.contains(el) : false;
    };
    const vOk = r.height >= need || (reach(0, -half) && reach(0, half));
    const hOk = r.width >= need || (reach(-half, 0) && reach(half, 0));
    if ((!vOk || !hOk) && !seen.has(key)) {
      seen.add(key);
      out.small.push({
        el: name,
        txt,
        w: Math.round(r.width),
        h: Math.round(r.height),
        need,
        kind: isPrimary ? "주요" : "촘촘",
        why: [!vOk ? "세로" : null, !hOk ? "가로" : null].filter(Boolean).join("+"),
      });
    }

    if (r.right > vw + 1 || r.left < -1) {
      let inRail = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ov = getComputedStyle(a).overflowX;
        if (ov === "auto" || ov === "scroll") {
          inRail = true;
          break;
        }
      }
      if (!inRail) out.offscreen.push({ el: name, txt, left: Math.round(r.left), right: Math.round(r.right) });
    }
  }

  /* 글자 크기 — 직접 텍스트를 가진 요소만(부모가 상속시킨 것은 중복이라 뺀다) */
  const tseen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!direct) continue;
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize);
    if (!px || px >= minFont) continue;
    const key = el.tagName + cs.fontSize + String(el.className || "").slice(0, 40);
    if (tseen.has(key)) continue;
    tseen.add(key);
    out.tiny.push({
      el: el.tagName + "." + String(el.className || "").trim().split(/\s+/).slice(0, 2).join("."),
      px: cs.fontSize,
      txt: (el.textContent || "").trim().slice(0, 26),
    });
  }
  return out;
}

async function main() {
  let chromium;
  for (const mod of ["playwright", "@playwright/test"]) {
    try {
      ({ chromium } = await import(mod));
      break;
    } catch {
      /* 다음 후보 */
    }
  }
  if (!chromium) {
    console.error("✗ playwright 가 없습니다. `npx playwright install chromium` 후 다시 실행하세요.");
    process.exit(2);
  }
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    locale: "ko-KR",
  });
  const page = await ctx.newPage();
  /* 광고 요청은 막는다 — 없어도 화면 구조는 같고, 네트워크가 느려 검사가 흔들린다 */
  for (const h of ["googlesyndication.com", "doubleclick.net"]) {
    await page.route(`**://*.${h}/**`, (r) => r.abort());
  }

  let failed = 0;
  for (const path of PAGES) {
    const url = BASE.replace(/\/$/, "") + path;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    } catch (e) {
      console.error(`✗ ${path} — 열지 못했습니다 (${String(e).split("\n")[0]})`);
      failed++;
      continue;
    }
    await page.waitForSelector("#main-content", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2_500);

    /* 화면을 한 번 훑는다 — 아래쪽 요소는 뷰포트에 들어와야 점을 찍을 수 있다 */
    const found = { small: [], tiny: [], offscreen: [], overflowX: 0, coarse: false };
    const dedup = new Set();
    const docH = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < docH; y += 700) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(260);
      const r = await page.evaluate(audit, {
        primaryMin: PRIMARY_MIN,
        inlineMin: INLINE_MIN,
        minFont: MIN_FONT,
        vw: 390,
      });
      found.overflowX = Math.max(found.overflowX, r.overflowX);
      found.coarse = r.coarse;
      for (const g of ["small", "tiny", "offscreen"]) {
        for (const item of r[g]) {
          const k = g + JSON.stringify(item);
          if (dedup.has(k)) continue;
          dedup.add(k);
          found[g].push(item);
        }
      }
    }

    if (!found.coarse) {
      console.error(`✗ ${path} — 터치 화면으로 열리지 않았습니다(pointer: coarse 아님)`);
      failed++;
      continue;
    }
    const bad = found.small.length + found.offscreen.length + found.tiny.length + (found.overflowX > 0 ? 1 : 0);
    if (bad === 0) {
      console.log(`✓ ${path}  (터치 ${PRIMARY_MIN}/${INLINE_MIN}px · 글자 ${MIN_FONT}px · 가로 넘침 없음)`);
      continue;
    }
    failed++;
    console.error(`✗ ${path}  지적 ${bad}건`);
    if (found.overflowX > 0) console.error(`    가로 넘침 ${found.overflowX}px`);
    for (const s of found.small.slice(0, 12)) {
      console.error(`    ${s.kind} 조작 ${s.w}×${s.h} — ${s.why} ${s.need}px 미만  ${s.el}  "${s.txt}"`);
    }
    for (const t of found.tiny.slice(0, 6)) console.error(`    글자 ${t.px}  ${t.el}  "${t.txt}"`);
    for (const o of found.offscreen.slice(0, 6)) {
      console.error(`    화면밖 ${o.left}~${o.right}  ${o.el}  "${o.txt}"`);
    }
  }

  await browser.close();
  if (failed) {
    console.error(
      `\n모바일 조작 검사 실패 — ${failed}개 경로.\n` +
        `주요 조작은 ${PRIMARY_MIN}px 을 채우고(크기를 키우거나 globals.css 의 (pointer: coarse) 블록에서 히트 영역을 넓힌다),\n` +
        `촘촘한 텍스트 링크는 ${INLINE_MIN}px + 줄 간격으로 푼다 — 44px 히트를 겹쳐 얹으면 옆줄의 탭을 가져간다.`,
    );
    process.exit(1);
  }
  console.log(`\n✓ 모바일 조작 검사 통과 — ${PAGES.length}개 경로`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
