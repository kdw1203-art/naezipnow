// [1030 · 운영 루프] 주간 실측 보고 — probe-prod·design-probe 의 JSON 을 읽어 통과선과 대조하고 report.md 를 쓴다.
// 쓰임: node scripts/review/report.mjs reports/review/2026-41   (종료 코드 1 = 통과선 위반 있음)
// 통과선(숫자)은 docs/ops/review-loop.md "품질 기준" 과 같은 값 — 둘 중 하나를 바꾸면 다른 쪽도 바꾼다.
import fs from "node:fs";
import path from "node:path";

const DIR = process.argv[2];
if (!DIR) {
  console.error("usage: node scripts/review/report.mjs <reports dir>");
  process.exit(2);
}
const read = (name) => {
  const p = path.join(DIR, name);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
};
const LIMITS = {
  pageErrors: 0, // React 하이드레이션·런타임 오류
  consoleErrors: 0, // CSP 거부 등 (아래 허용 패턴 제외)
  status5xx: 0,
  overflowPx: 1, // 가로 넘침
  axeSerious: 0, // color-contrast · scrollable-region-focusable 등 serious/critical
  blueFills: 1, // 화면당 채움 파랑 버튼
  weight600: 0, // 굵기 600 글자 요소
  longLineChars: 80, // 본문 줄 길이(자/행)
  titleLen: 60,
  descLen: [50, 160],
};
/* 운영에서 늘 나오지만 우리 코드가 아닌 것 — 여기 적힌 것만 무시한다(이유와 함께). */
const CONSOLE_ALLOW = [
  /ERR_BLOCKED_BY_CLIENT|ERR_ABORTED/, // 차단한 분석 비콘·프리페치 중단
  /googlesyndication|doubleclick|adsbygoogle/, // 광고 스크립트 자체의 콘솔 소음(네트워크)
];
const ROUTE_ALLOW_SOFT404 = /\/(nope|does-not-exist|00000000-0000)/; // 없는 주소 확인용 경로는 404·noindex 가 정답

const lines = [];
const violations = [];
const add = (route, rule, detail) => violations.push({ route, rule, detail });

for (const mode of ["d", "m", "d_dark", "m_dark"]) {
  const R = read(`probe3_${mode}.json`);
  if (!R) continue;
  for (const r of R) {
    const isNotFoundProbe = ROUTE_ALLOW_SOFT404.test(r.path);
    if (r.status != null && r.status >= 500) add(r.path, "5xx", String(r.status));
    if (!isNotFoundProbe && r.status === 404) add(r.path, "404", "실측 경로가 404");
    const pe = (r.pageErrors || []).filter((e) => !/axe is not defined/.test(e));
    if (pe.length > LIMITS.pageErrors) add(r.path, `pageError(${mode})`, pe[0]);
    const ce = (r.consoleErrors || []).filter((e) => !CONSOLE_ALLOW.some((re) => re.test(e)));
    if (ce.length > LIMITS.consoleErrors) add(r.path, `consoleError(${mode})`, `${ce.length}건 · ${ce[0].slice(0, 120)}`);
    for (const [w, o] of Object.entries(r.overflow || {})) if (o.over > LIMITS.overflowPx && !/sitemap/.test(r.path)) add(r.path, `overflow(${w})`, `${o.over}px ${(o.cul || []).slice(0, 2).join(" ")}`);
    for (const v of r.axe || []) {
      if (["serious", "critical"].includes(v.impact) && !/robots|sitemap/.test(r.path)) add(r.path, `axe:${v.id}(${mode})`, `${v.n}곳 · ${v.nodes?.[0]?.t ?? ""}`);
    }
    if (mode === "d" && r.meta && !isNotFoundProbe && !/robots|sitemap/.test(r.path)) {
      if (r.meta.titleLen > LIMITS.titleLen) add(r.path, "title>60", String(r.meta.titleLen));
      if (r.meta.description && (r.meta.descLen < LIMITS.descLen[0] || r.meta.descLen > LIMITS.descLen[1])) add(r.path, "description 길이", String(r.meta.descLen));
      if (!r.meta.robots?.includes("noindex") && r.meta.h1?.length !== 1) add(r.path, "h1 개수", String(r.meta.h1?.length ?? 0));
    }
    if (isNotFoundProbe && r.status === 200 && !(r.meta?.robots || "").includes("noindex")) add(r.path, "soft404 without noindex", "");
  }
}
for (const mode of ["d", "m"]) {
  const R = read(`probe4_${mode}.json`);
  if (!R) continue;
  for (const r of R) {
    const m = r.m;
    if (!m) continue;
    if (mode === "d" && (m.blueFills || []).length > LIMITS.blueFills) add(r.path, "채움 파랑 >1", m.blueFills.join(" / "));
    const w600 = Object.entries(m.fw || {}).filter(([k]) => Number(k) === 600).reduce((a, [, v]) => a + v, 0);
    if (w600 > LIMITS.weight600) add(r.path, `굵기 600(${mode})`, `${w600}개`);
    const w800 = Object.entries(m.fw || {}).filter(([k]) => Number(k) >= 800).reduce((a, [, v]) => a + v, 0);
    if (w800 > 0) add(r.path, `굵기 800+(${mode})`, `${w800}개`);
    for (const l of m.longLines || []) if (l.chars > LIMITS.longLineChars && mode === "d") add(r.path, "줄 길이 >80자", `${l.chars}자 · ${l.t}`);
    if ((m.grads || []).some((g) => !/cover-scrim|note-paper|skeleton|mask/.test(g))) add(r.path, "그라데이션", m.grads.join(","));
  }
}

const byRule = {};
for (const v of violations) (byRule[v.rule] ||= []).push(v);
lines.push(`# 운영 실측 보고 — ${path.basename(DIR)}`, "");
lines.push(`실측 ${new Date().toISOString().slice(0, 10)} · 위반 ${violations.length}건 (${Object.keys(byRule).length}종) · 통과선은 docs/ops/review-loop.md`, "");
lines.push("| 규칙 | 건수 | 예 |", "|---|---|---|");
for (const [rule, vs] of Object.entries(byRule).sort((a, b) => b[1].length - a[1].length)) {
  lines.push(`| ${rule} | ${vs.length} | ${vs[0].route} — ${String(vs[0].detail).replace(/\|/g, "/").slice(0, 90)} |`);
}
lines.push("", "## 전수", "", "| 경로 | 규칙 | 상세 |", "|---|---|---|");
for (const v of violations) lines.push(`| ${v.route} | ${v.rule} | ${String(v.detail).replace(/\|/g, "/").slice(0, 140)} |`);
fs.writeFileSync(path.join(DIR, "report.md"), lines.join("\n") + "\n");
console.log(lines.slice(0, 4 + Object.keys(byRule).length).join("\n"));
process.exit(violations.length ? 1 : 0);
