"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { FIT_SELECTOR, fitAttempts, isTwoLineOverflow } from "@/lib/client/one-line-fit";

/* [1143 · 한 줄 맞춤] 모든 화면의 설명 줄에서 "딱 두 줄로 넘친 짧은 글"을 찾아 자간 → 글자 크기 순으로 줄여 한 줄에 맞춘다.
   규칙은 lib/client/one-line-fit. 화면이 그려진 뒤(쉬는 틈) · 화면을 옮긴 뒤 · 폭이 바뀐 뒤에 한 번씩 돈다.
   안에 다른 덩이(문단 · 목록 · 단추)가 든 글, 입력 칸 이름표, 이미 줄임표로 자르는 글은 건드리지 않는다. 안 맞으면 원래대로. */

const MARK = "data-fit-done";

function fitOne(el: HTMLElement): void {
  if (el.hasAttribute(MARK)) return;
  if (el.closest("label, button, a.btn-primary, table, pre, code, [data-fit-skip]") && !el.hasAttribute("data-fit")) return;
  if (el.querySelector("p, div, ul, ol, li, br, button, input, select, textarea, table")) return;
  const text = (el.textContent ?? "").trim();
  const cs = window.getComputedStyle(el);
  if (cs.display === "inline" || cs.whiteSpace === "nowrap" || cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none") return;
  const basePx = parseFloat(cs.fontSize);
  const lh = parseFloat(cs.lineHeight) || basePx * 1.5;
  if (!isTwoLineOverflow(el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), lh, text.length)) return;

  const prev = { ls: el.style.letterSpacing, fs: el.style.fontSize, ws: el.style.whiteSpace };
  const width = el.clientWidth;
  el.style.whiteSpace = "nowrap";
  let ok = false;
  for (const a of fitAttempts(basePx)) {
    el.style.letterSpacing = `${a.spacingEm}em`;
    el.style.fontSize = a.scale === 1 ? prev.fs : `${Math.round(basePx * a.scale * 10) / 10}px`;
    if (el.scrollWidth <= width) {
      ok = true;
      break;
    }
  }
  if (!ok) {
    el.style.letterSpacing = prev.ls;
    el.style.fontSize = prev.fs;
    el.style.whiteSpace = prev.ws;
  }
  el.setAttribute(MARK, ok ? "1" : "0");
}

function run(reset: boolean): void {
  const els = document.querySelectorAll<HTMLElement>(FIT_SELECTOR);
  if (reset) {
    els.forEach((el) => {
      if (!el.hasAttribute(MARK)) return;
      if (el.getAttribute(MARK) === "1") {
        el.style.letterSpacing = "";
        el.style.fontSize = "";
        el.style.whiteSpace = "";
      }
      el.removeAttribute(MARK);
    });
  }
  els.forEach(fitOne);
}

export function OneLineFit() {
  const pathname = usePathname();

  useEffect(() => {
    const idle = (fn: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 1200 });
      else window.setTimeout(fn, 300);
    };
    idle(() => run(false));
    /* 늦게 그려지는 조각(스트리밍 · 지연 섬)을 한 번 더 */
    const late = window.setTimeout(() => idle(() => run(false)), 2500);
    let lastW = window.innerWidth;
    let t = 0;
    const onResize = () => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      window.clearTimeout(t);
      t = window.setTimeout(() => run(true), 250);
    };
    window.addEventListener("resize", onResize);
    /* 누른 뒤 새로 보이는 글(접힌 칸 · 다음 걸음 · 탭) — 아직 안 본 글만 다시 잰다 */
    let c = 0;
    const onClick = () => {
      window.clearTimeout(c);
      c = window.setTimeout(() => idle(() => run(false)), 200);
    };
    document.addEventListener("click", onClick, { passive: true });
    return () => {
      window.clearTimeout(c);
      document.removeEventListener("click", onClick);
      window.clearTimeout(late);
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, [pathname]);

  return null;
}
