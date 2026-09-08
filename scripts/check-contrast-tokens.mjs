#!/usr/bin/env node
/**
 * 색 토큰 대비 게이트.
 *
 * app/globals.css 의 15b 주석은 규칙을 이렇게 적어 두었다 —
 * "각 상태 bg/border/text 3토큰 고정 (bg 위 text 대비 4.5:1)".
 * 그런데 2026-07-27 에 확인해 보니 정작 위험(danger)만 그 규칙을 어기고 있었다:
 *   구 --danger #d64545 → 흰 배경 4.38 · --bg 4.15 · --danger-soft 3.77 (전부 미달)
 *   구 --success #1a7f4e → --success-soft 위 4.46 (아슬하게 미달)
 * 발견한 계기는 axe 가 /town 한 화면에서 3.77 을 잡은 것인데, text-danger 는
 * 소스 91곳에 쓰인다. 화면마다 고치면 나머지 90곳은 그대로 남고, 다음에 누가
 * text-danger 를 새로 쓰면 위반이 다시 태어난다. 규칙이 토큰에 있으니 검사도
 * 토큰에서 한다.
 *
 * 접근성 e2e(test:a11y)와 겹치지 않는다: 그쪽은 "지금 렌더된 화면"을 보고,
 * 이쪽은 "쓰이든 안 쓰이든 조합 자체가 성립하는가"를 본다. 화면에 아직 안 쓰인
 * 조합은 axe 가 볼 수 없다.
 *
 * 검사 대상은 디자인 시스템이 스스로 약속한 조합만 둔다. 실제로 쓰이는지
 * 정적으로 알 수 없는 조합(예: text-3 를 danger-soft 위에)까지 넣으면 오탐이
 * 섞이고, 오탐이 섞이는 순간 게이트는 무시당한다.
 *
 * 사용: npm run check:contrast-tokens
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CSS = path.join(ROOT, "app/globals.css");
const AA = 4.5; // WCAG 2.1 AA 본문 최소

/* ---------- 색 파싱·계산 ---------- */

function parseHex(v) {
  const h = v.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function parseRgba(v) {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(
    v.trim(),
  );
  if (!m) return null;
  return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
}

/** 반투명 토큰은 그 위에 깔리는 배경과 합성해야 실제로 보이는 색이 된다. */
function resolve(value, over) {
  const hex = parseHex(value);
  if (hex) return hex;
  const rgba = parseRgba(value);
  if (!rgba) return null;
  if (rgba.a >= 1) return rgba.rgb;
  if (!over) return null;
  return rgba.rgb.map((c, i) => Math.round(c * rgba.a + over[i] * (1 - rgba.a)));
}

function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* ---------- 토큰 블록 읽기 ---------- */

/**
 * `:root {` / `.dark {` 블록 안의 `--token: value;` 를 모은다.
 * 중괄호 깊이를 세서 블록 끝을 찾는다(안에 @media 등이 중첩돼도 안전하게).
 */
/* 선택자를 **규칙 머리로만** 찾는다.
   [975] 예전에는 indexOf(selector) 로 찾았는데, globals.css 주석에 있던
   "라이트(:root)·다크(.dark) 양쪽에" 라는 문장이 먼저 걸려서 `.dark` 블록 대신
   엉뚱한 블록을 읽었다. 그 바람에 "dark — 50조합 통과" 는 사실 **라이트 값을 두 번**
   검사한 결과였다. 다크 토큰은 여태 게이트 밖에 있었다. */
function findRuleStart(src, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[}\\n])\\s*${esc}\\s*\\{`, "m");
  const m = re.exec(src);
  return m ? m.index + m[0].lastIndexOf("{") : -1;
}

function readBlock(src, selector) {
  const open = findRuleStart(src, selector);
  if (open < 0) throw new Error(`[check-contrast-tokens] ${selector} 블록을 찾지 못했습니다.`);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`[check-contrast-tokens] ${selector} 블록이 닫히지 않았습니다.`);
  const body = src.slice(open + 1, end);
  const out = {};
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].split("/*")[0].trim();
  }
  return out;
}

/* ---------- 검사 조합 ---------- */

const TONES = ["danger", "success", "warning", "primary"];
const RAMP = ["ink", "text-1", "text-2", "text-3"];
/** 본문이 얹힐 수 있는 배경 — 상태 카드 안에 캡션을 쓰는 건 자연스러운 일이라
    상태 soft 3종도 약속 대상에 넣는다. 2026-07-27 에 넣고 재 보니 --text-3 만
    danger-soft 위 4.39(라이트) / 3.87~4.27(다크) 로 걸렸다. */
const TEXT_BACKGROUNDS = [
  "surface",
  "bg",
  "disabled-bg",
  "danger-soft",
  "success-soft",
  "warning-soft",
  "primary-soft",
];

/**
 * 어두운 면(브랜드 네이비) 위 글자 — [975] 에 추가.
 *
 * 왜 따로 두는가: 위 조합들은 전부 **밝은 표면** 위를 본다. 그런데 이 서비스에서
 * 실제로 대비가 무너진 자리는 네이비 히어로였다. 2026-09-08 실측(렌더 화면
 * 픽셀 기준):
 *   · --brand-red-on-dark 위 네이비 4.08  ("플랜 보기 ›" · 눈썹 글자)
 *   · --on-dark 를 --on-dark-faint 패널 위에 3.53  (도구 머리 "넣는 것/계산/나오는 것")
 * 둘 다 토큰 조합 자체의 문제라 화면에서 고치면 다음 화면에서 되살아난다.
 * 네이비는 테마와 무관한 브랜드 상수라 라이트/다크 양쪽에서 같은 값으로 본다.
 *
 * --on-dark-faint(45%)는 **선·구분자용**이다. 패널 바탕으로 쓰면 네이비 위에서
 * 중간 회색이 되므로 여기서 걸린다 — 패널은 --on-dark-panel 을 쓴다.
 *
 * 약속의 범위는 실제 쓰임에 맞춘다. 주홍(--brand-red-on-dark)은 네이비 면 위
 * **강조 글자**로만 쓴다 — 패널 안에서는 쓰지 않으므로 약속에도 넣지 않는다
 * (안 쓰는 조합까지 넣으면 오탐이 되고, 오탐이 섞이면 게이트는 무시당한다).
 */
const ON_NAVY_PAIRS = [
  ["on-dark", "brand-navy"],
  ["on-dark-muted", "brand-navy"],
  ["brand-red-on-dark", "brand-navy"],
  ["on-dark", "on-dark-panel"],
  ["on-dark-muted", "on-dark-panel"],
];

/** [전경 토큰, 배경 토큰] — 디자인 시스템이 스스로 약속한 조합만. */
function pairs() {
  const list = [];
  for (const t of TONES) {
    list.push([t, "surface"], [t, "bg"], [t, `${t}-soft`]);
  }
  for (const r of RAMP) for (const b of TEXT_BACKGROUNDS) list.push([r, b]);
  return list;
}

/**
 * 채움 토큰 — 전경이 항상 흰 글씨인 자리(솔리드 배지·버튼).
 * 본문용 --danger/--success 는 다크에서 밝은 색으로 뒤집히므로 채움에 쓰면
 * 흰 글씨가 2.4:1 까지 무너진다. 그래서 채움값은 테마 고정이고, 여기서는
 * (1) 흰 글씨가 AA 를 넘는가 (2) 배지 자체가 표면과 3:1 로 구분되는가 를 본다.
 */
const FILLS = ["danger-fill", "success-fill", "primary-fill"];
const NON_TEXT_MIN = 3; // WCAG 1.4.11 비텍스트 최소

function check(themeName, tokens) {
  const surface = resolve(tokens.surface, null);
  if (!surface) {
    throw new Error(`[check-contrast-tokens] ${themeName}: --surface 를 읽지 못했습니다.`);
  }
  const rows = [];
  for (const [fgKey, bgKey] of pairs()) {
    const fgRaw = tokens[fgKey];
    const bgRaw = tokens[bgKey];
    if (fgRaw === undefined || bgRaw === undefined) {
      /* 다크는 오버라이드만 적는다 — 없으면 라이트 값을 그대로 쓴다는 뜻이라
         라이트 쪽 검사에서 이미 봤다. 여기서 실패로 셀 일이 아니다. */
      continue;
    }
    /* 배경이 반투명이면 --surface 위에 깔린다고 보고 합성한다(카드 위가 기본). */
    const bg = resolve(bgRaw, surface);
    const fg = resolve(fgRaw, bg ?? surface);
    if (!fg || !bg) {
      rows.push({ fgKey, bgKey, ratio: null, ok: false, note: "색을 해석하지 못함" });
      continue;
    }
    const ratio = contrast(fg, bg);
    rows.push({ fgKey, bgKey, ratio, ok: ratio >= AA, fg, bg });
  }
  /* 네이비 위 조합 — 반투명 값은 네이비에 합성해서 실제로 보이는 색으로 잰다.
     패널(--on-dark-panel)도 네이비 위에 얹힌 뒤의 색이 글자의 배경이 된다. */
  const navy = resolve(tokens["brand-navy"], null);
  if (navy) {
    for (const [fgKey, bgKey] of ON_NAVY_PAIRS) {
      const bgRaw = tokens[bgKey];
      const fgRaw = tokens[fgKey];
      if (bgRaw === undefined || fgRaw === undefined) continue;
      const bg = resolve(bgRaw, navy);
      if (!bg) continue;
      const fg = resolve(fgRaw, bg);
      if (!fg) continue;
      const ratio = contrast(fg, bg);
      rows.push({ fgKey, bgKey: `${bgKey}(네이비 위)`, ratio, ok: ratio >= AA, fg, bg });
    }
  }
  for (const fillKey of FILLS) {
    const fill = resolve(tokens[fillKey], surface);
    if (!fill) {
      rows.push({ fgKey: "#fff", bgKey: fillKey, ratio: null, ok: false, note: "색을 해석하지 못함" });
      continue;
    }
    const white = contrast([255, 255, 255], fill);
    rows.push({ fgKey: "#fff", bgKey: fillKey, ratio: white, ok: white >= AA });
    const vsSurface = contrast(fill, surface);
    rows.push({
      fgKey: fillKey,
      bgKey: "surface(비텍스트)",
      ratio: vsSurface,
      ok: vsSurface >= NON_TEXT_MIN,
      min: NON_TEXT_MIN,
    });
  }
  return rows;
}

/**
 * 폐기된 팔레트 값이 하드코딩으로 되살아나는 걸 막는다.
 * 2026-07-27 토큰 정정 뒤에도 #d64545 / #1a7f4e 가 소스 40여 파일에 hex 로
 * 남아 있었다. 토큰이 아니니 정정이 상속되지 않아, 공개 화면에서 3.77~4.46 이
 * 그대로 살아 있었다. 값 하나를 고치는 것보다 "다시 못 들어오게" 하는 게 싸다.
 */
const DEAD_HEX = ["#d64545", "#1a7f4e"];

/* 다크 패널용 상태색 — 2026-08-11 에 토큰(--ai-accent/--ai-success/--ai-danger)으로
   정본화했다. 이 값들은 conic-gradient 스톱·차트 팔레트·SVG fill 처럼 토큰을 못 쓰는
   자리에는 아직 정당하게 남아 있으므로, "어디서든 금지"인 DEAD_HEX 와 달리
   **Tailwind 클래스 arbitrary(text-[…]/bg-[…]/border-[…]) 안에서만** 금지한다.
   클래스라면 text-ai-accent/bg-ai-success/text-ai-danger 로 바꾸면 된다. */
const DEAD_ONDARK_HEX = ["#7ea2ff", "#4ade80", "#ff8a8a", "#f87171"];
/* 솔리드 상태색 유틸(text/bg/border/ring)만 본다. from/via/to(그라데이션 스톱)·
   fill/stroke(벡터)는 브랜드 그라데이션·아이콘에서 raw hex 가 정당하므로 제외한다 —
   실제로 tool-identity.ts 의 `to-[#f87171]`(위험 카드 그라데이션 끝색)이 그 경우다. */
const CLASS_ARBITRARY_RE = (hex) =>
  new RegExp(`(?:text|bg|border|ring)-\\[${hex}\\]`, "i");

function scanDeadHex() {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        walk(p);
      } else if (/\.tsx?$/.test(e.name)) {
        const text = fs.readFileSync(p, "utf8");
        text.split("\n").forEach((line, i) => {
          const lower = line.toLowerCase();
          for (const hex of DEAD_HEX) {
            if (lower.includes(hex)) {
              hits.push(`  ${path.relative(ROOT, p)}:${i + 1}  ${hex}`);
            }
          }
          for (const hex of DEAD_ONDARK_HEX) {
            if (CLASS_ARBITRARY_RE(hex).test(line)) {
              hits.push(`  ${path.relative(ROOT, p)}:${i + 1}  ${hex} (클래스 → ai 토큰)`);
            }
          }
        });
      }
    }
  };
  for (const d of ["app", "lib"]) {
    const abs = path.join(ROOT, d);
    if (fs.existsSync(abs)) walk(abs);
  }
  return hits;
}

/**
 * 화면별 테마(--primary 계열만 갈아 끼우는 subtree) — [975] 에 추가.
 *
 * /supply(초록) · /dev-deals(앰버) · /auctions(보라) · /qna(청록) 은 그 화면 안에서만
 * --primary/--primary-soft 를 바꾼다. 그런데 text-primary·bg-primary-soft·chip-active
 * 같은 **공용 클래스**가 그 값을 그대로 쓰므로, 테마 색이 어두운 정도를 지키지 않으면
 * 그 화면 전체가 한꺼번에 미달이 된다. 실제로 2026-09-08 에 /supply 한 화면에서만
 * 미달 텍스트 243건이 나왔다(입주/분양 배지가 목록 전체에 붙는다).
 *
 * 여기 넣으려면 테마가 **CSS 클래스**여야 한다. 인라인 style 로 심으면 이 검사가
 * 볼 수 없고 다크 값도 못 얹는다 — 그래서 [975] 에서 두 화면을 클래스로 옮겼다.
 */
const PAGE_THEMES = [
  [".theme-auction", "/auctions"],
  [".qna-theme", "/qna"],
  [".theme-supply", "/supply"],
  [".theme-dev-deals", "/dev-deals"],
];
/** 테마가 바꾸는 건 --primary 계열뿐이므로, 그 값이 얹히는 텍스트 조합만 본다. */
const THEME_PAIRS = [
  ["primary", "primary-soft"],
  ["primary", "surface"],
  ["primary", "bg"],
];

function checkPageTheme(themeName, base, overrides) {
  const tokens = { ...base, ...overrides };
  const surface = resolve(tokens.surface, null);
  const rows = [];
  for (const [fgKey, bgKey] of THEME_PAIRS) {
    const bg = resolve(tokens[bgKey], surface);
    const fg = resolve(tokens[fgKey], bg ?? surface);
    if (!fg || !bg) continue;
    const ratio = contrast(fg, bg);
    rows.push({ fgKey, bgKey, ratio, ok: ratio >= AA, theme: themeName });
  }
  /* [976] 채움(--primary-fill) — 흰 글자를 얹는 면이다. 두 가지를 본다:
       (1) 흰 글자가 AA 를 넘는가  (2) 면이 표면과 3:1 로 구분되는가
     테마가 --primary-fill 을 따로 두지 않으면 루트 값이 쓰이므로 그대로 검사한다.
     라이트에서만 맞춰 두면 다크 표면(#171b22)에서 배지가 묻힌다 — 그게 /qna 에서
     실제로 걸렸다(2.94). */
  const fill = resolve(tokens["primary-fill"], surface);
  if (fill && surface) {
    const white = contrast([255, 255, 255], fill);
    rows.push({
      fgKey: "#fff", bgKey: "primary-fill", ratio: white,
      ok: white >= AA, theme: themeName,
    });
    const vsSurface = contrast(fill, surface);
    rows.push({
      fgKey: "primary-fill", bgKey: "surface(비텍스트)", ratio: vsSurface,
      ok: vsSurface >= NON_TEXT_MIN, min: NON_TEXT_MIN, theme: themeName,
    });
  }
  return rows;
}

/* ---------- 실행 ---------- */

const src = fs.readFileSync(CSS, "utf8");
const rootTokens = readBlock(src, ":root");
const darkTokens = { ...rootTokens, ...readBlock(src, ".dark") };
const themes = [
  ["light", rootTokens],
  ["dark", darkTokens],
];

const failed = [];
for (const [selector, route] of PAGE_THEMES) {
  for (const [mode, base] of [
    ["light", rootTokens],
    ["dark", darkTokens],
  ]) {
    const sel = mode === "dark" ? `.dark ${selector}` : selector;
    let overrides;
    try {
      overrides = readBlock(src, sel);
    } catch {
      /* 다크 오버라이드가 없으면 라이트 값이 그대로 쓰인다 — 그 자체가 문제라
         (다크 표면 위 연한 판) 여기서 라이트 값으로 다크를 검사한다. */
      overrides = readBlock(src, selector);
    }
    const rows = checkPageTheme(`${route} ${mode}`, base, overrides);
    for (const r of rows) {
      if (r.ok) continue;
      const label = (k) => (k.startsWith("#") || k.includes("(") ? k : `--${k}`);
      failed.push(
        `  ${r.theme}  ${label(r.fgKey)} on ${label(r.bgKey)}  ` +
          `${r.ratio.toFixed(2)}:1 (최소 ${r.min ?? AA}:1)`,
      );
    }
  }
}
console.log(`[check-contrast-tokens] 화면 테마 ${PAGE_THEMES.length}종 — 라이트·다크 검사`);

for (const [name, tokens] of themes) {
  const rows = check(name, tokens);
  if (rows.length === 0) {
    throw new Error(`[check-contrast-tokens] ${name}: 검사할 조합이 하나도 없습니다.`);
  }
  console.log(`[check-contrast-tokens] ${name} — ${rows.length}조합`);
  for (const r of rows) {
    if (r.ok) continue;
    const label = (k) => (k.startsWith("#") || k.includes("(") ? k : `--${k}`);
    failed.push(
      `  ${name}  ${label(r.fgKey)} on ${label(r.bgKey)}  ` +
        (r.ratio === null ? r.note : `${r.ratio.toFixed(2)}:1 (최소 ${r.min ?? AA}:1)`),
    );
  }
}

if (failed.length) {
  console.error("[check-contrast-tokens] 대비 미달 조합:");
  for (const f of failed) console.error(f);
  console.error(
    "\napp/globals.css 의 토큰 값을 조정하세요. 화면 한 곳만 우회하면 같은 토큰을 " +
      "쓰는 나머지 자리가 그대로 남습니다.",
  );
  process.exit(1);
}

const dead = scanDeadHex();
if (dead.length) {
  console.error(`[check-contrast-tokens] 폐기된 팔레트 값이 하드코딩돼 있습니다 (${dead.length}곳):`);
  for (const d of dead) console.error(d);
  console.error(
    `\n${DEAD_HEX.join(" / ")} 는 2026-07-27 대비 정정으로 팔레트에서 내려간 값입니다.\n` +
      "클래스라면 text-danger / bg-success-soft 같은 토큰으로, 차트·마커처럼 토큰을 " +
      "쓸 수 없는 자리라면 현재 값(#c62828 / #177a4a)으로 바꾸세요.",
  );
  process.exit(1);
}

console.log(`[check-contrast-tokens] OK — 라이트·다크 전 조합 통과 · 폐기 팔레트 hex 0곳.`);
