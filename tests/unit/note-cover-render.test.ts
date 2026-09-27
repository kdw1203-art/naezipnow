import test from "node:test";
import assert from "node:assert/strict";
import { isValidElement, type ReactElement } from "react";
import {
  COVER_PALETTES,
  buildCoverTree,
  factLines,
  fitFontSize,
  headlineLines,
  treeGradientCount,
  treeTexts,
} from "../../lib/notes/cover/tree.ts";
import { COVER_PREVIEW_PATH, coverPreviewPath, parseCoverPreviewQuery } from "../../lib/notes/cover/preview.ts";
import { COVER_COLORS } from "../../lib/notes/cover/spec.ts";

/* 썸네일 그림 트리 — 서버 없이 satori 에 넘길 요소를 검사한다(실제 PNG 캡처는 통합자 몫).
   잠그는 것: 글자가 전부 텍스트 노드로 들어간다 · 그라데이션은 사진 변형에만 · satori 의 flex 규칙 ·
   줄 나누기·글자 크기 · 미리보기 쿼리의 길이·변형·사진 주소 제한. */

const HOST = "proj.supabase.co";
const PHOTO = `https://${HOST}/storage/v1/object/public/inspection/a/1.jpg`;

type AnyEl = ReactElement<{ style?: Record<string, unknown>; children?: unknown; src?: string }>;

function walk(node: unknown, visit: (el: AnyEl) => void): void {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (!isValidElement(node)) return;
  const el = node as AnyEl;
  visit(el);
  walk(el.props.children, visit);
}

const sample = { headline: "상계주공9단지", fact: "거래1위·평단가 46위", sub: "서울 노원구" };

test("세 변형 모두 제목·사실·보조·브랜드 글자를 그린다", () => {
  for (const variant of ["navy", "hanji", "light"] as const) {
    const texts = treeTexts(buildCoverTree({ variant, ...sample }));
    assert.ok(texts.includes("상계주공9단지"), variant);
    assert.ok(texts.includes("거래1위·평단가 46위"), variant);
    assert.ok(texts.includes("서울 노원구"), variant);
    assert.ok(texts.includes("내집나우 임장노트"), variant);
  }
});

test("같은 테마 — 면 색은 브랜드 네이비·한지·연파랑, 온점은 주홍", () => {
  assert.equal(COVER_PALETTES.navy.bg, COVER_COLORS.navy);
  assert.equal(COVER_PALETTES.hanji.bg, COVER_COLORS.hanji);
  assert.equal(COVER_PALETTES.light.bg, COVER_COLORS.blueSoft);
  assert.equal(COVER_PALETTES.light.fact, COVER_COLORS.blue);
  for (const v of ["navy", "hanji", "light", "photo"] as const) {
    assert.ok([COVER_COLORS.red, COVER_COLORS.redDark].includes(COVER_PALETTES[v].dot as "#C8442B"), v);
  }
  const root = buildCoverTree({ variant: "hanji", ...sample }) as AnyEl;
  assert.equal(root.props.style?.backgroundColor, COVER_COLORS.hanji);
  assert.equal(root.props.style?.width, 720);
  assert.equal(root.props.style?.height, 720);
});

test("그라데이션은 사진 위 가독 오버레이에만 — 글자 템플릿 3종은 0", () => {
  for (const variant of ["navy", "hanji", "light"] as const) {
    assert.equal(treeGradientCount(buildCoverTree({ variant, ...sample })), 0, variant);
  }
  const photo = buildCoverTree({ variant: "photo", ...sample, photoSrc: "data:image/jpeg;base64,AAAA" });
  assert.ok(treeGradientCount(photo) >= 1);
  let img: AnyEl | null = null;
  walk(photo, (el) => {
    if (el.type === "img") img = el;
  });
  assert.ok(img, "사진이 깔린다");
  assert.equal((img as unknown as AnyEl).props.src, "data:image/jpeg;base64,AAAA");
});

test("사진 변형인데 사진을 못 받으면 navy 로 그린다(깨진 그림을 내지 않는다)", () => {
  const tree = buildCoverTree({ variant: "photo", ...sample, photoSrc: null }) as AnyEl;
  assert.equal(tree.props.style?.backgroundColor, COVER_COLORS.navy);
  assert.equal(treeGradientCount(tree), 0);
  let hasImg = false;
  walk(tree, (el) => {
    if (el.type === "img") hasImg = true;
  });
  assert.equal(hasImg, false);
});

test("satori 규칙 — 자식이 둘 이상인 div 는 display:flex 를 명시한다", () => {
  for (const variant of ["navy", "hanji", "light", "photo"] as const) {
    const tree = buildCoverTree({ variant, headline: "길음뉴타운2단지푸르지오", fact: "가장 많이 오른 건 24평", sub: "서울 성북구", photoSrc: "data:image/png;base64,AA" });
    walk(tree, (el) => {
      if (el.type !== "div") return;
      const kids = ([] as unknown[]).concat(el.props.children ?? []).filter((c) => c != null && c !== false);
      if (kids.length > 1) assert.equal(el.props.style?.display, "flex", `${variant}: ${JSON.stringify(el.props.style)}`);
    });
  }
});

test("사용자 글자는 텍스트 노드로만 — 마크업처럼 생긴 글자도 요소가 되지 않는다", () => {
  const tree = buildCoverTree({ variant: "navy", headline: "<b>x</b>", fact: "<img src=x>", sub: "&amp;" });
  const texts = treeTexts(tree);
  assert.ok(texts.includes("<b>x</b>"));
  assert.ok(texts.includes("<img src=x>"));
  walk(tree, (el) => {
    assert.notEqual(el.type, "b");
    assert.ok(!("dangerouslySetInnerHTML" in (el.props as Record<string, unknown>)));
  });
});

test("제목 줄 나누기 — 한 줄에 들어가면 한 줄, 아니면 단지명·브랜드·숫자 묶음 자리에서 두 줄", () => {
  assert.deepEqual(headlineLines("상계주공9단지"), ["상계주공9단지"]);
  assert.deepEqual(headlineLines("한양수자인 그라시엘"), ["한양수자인", "그라시엘"]);
  assert.deepEqual(headlineLines("목동신시가지13단지"), ["목동신시가지", "13단지"]);
  assert.deepEqual(headlineLines("사가정센트럴아이파크"), ["사가정센트럴", "아이파크"]);
  assert.deepEqual(headlineLines("래미안길음센터피스"), ["래미안길음", "센터피스"]);
  for (const t of ["길음뉴타운2단지푸르지오", "DMC래미안e편한세상", "호반베르디움 더센트럴"]) {
    const lines = headlineLines(t);
    assert.equal(lines.length, 2, t);
    assert.equal(lines.join("").replace(/\s/g, ""), t.replace(/\s/g, ""), "글자를 잃지 않는다");
    assert.ok(!(/\d$/.test(lines[0]) && /^[가-힣\d]/.test(lines[1])), `${t}: 숫자와 단위("2|단지")를 가르지 않는다`);
  }
});

test("글자 크기 — 가장 긴 줄이 폭에 들어가고 상한·하한 안", () => {
  const size = fitFontSize(["상계주공9단지"], 608, 100, 48);
  assert.ok(size <= 100 && size >= 48);
  assert.ok(size * 6.6 <= 608, "7자 한 줄이 608px 안");
  assert.equal(fitFontSize(["가".repeat(40)], 608, 100, 48), 48, "하한");
  assert.deepEqual(factLines("거래1위·평단가 46위"), ["거래1위·평단가 46위"]);
  assert.equal(factLines("가장 많이 오른 건 24평이었다").length, 2);
});

test("미리보기 주소 — 만들고 읽으면 같은 값(사진은 사진 변형에만 붙는다)", () => {
  const draft = { variant: "light" as const, headline: "대치삼성", fact: "전세 9억→11억의 정체", sub: "서울 강남구" };
  const path = coverPreviewPath(draft, PHOTO);
  assert.ok(path.startsWith(`${COVER_PREVIEW_PATH}?`));
  assert.ok(!path.includes("photo="), "light 에는 사진을 붙이지 않는다");
  const parsed = parseCoverPreviewQuery(new URL(`https://x${path}`).searchParams, HOST);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.input, { ...draft, photoUrl: null });

  const photoPath = coverPreviewPath({ ...draft, variant: "photo" }, PHOTO);
  const p2 = parseCoverPreviewQuery(new URL(`https://x${photoPath}`).searchParams, HOST);
  assert.equal(p2.ok && p2.input.photoUrl, PHOTO);
});

test("미리보기 쿼리 제한 — 길이·변형·사진 주소", () => {
  const q = (o: Record<string, string>) => parseCoverPreviewQuery(new URLSearchParams(o), HOST);
  assert.equal(q({ variant: "navy", headline: "가".repeat(15) }).ok, false, "제목 14자 초과");
  assert.equal(q({ variant: "navy", headline: "가", fact: "나".repeat(17) }).ok, false, "사실 16자 초과");
  assert.equal(q({ variant: "navy", headline: "가", sub: "다".repeat(25) }).ok, false, "보조 24자 초과");
  assert.equal(q({ variant: "navy", headline: "가".repeat(500) }).ok, false, "원문 길이 상한");
  assert.equal(q({ variant: "gold", headline: "가" }).ok, false);
  assert.equal(q({ variant: "navy" }).ok, false, "제목 없음");
  assert.equal(q({ variant: "photo", headline: "가", photo: "https://example.com/a.jpg" }).ok, false, "남의 주소");
  assert.equal(q({ variant: "photo", headline: "가", photo: "http://169.254.169.254/latest/meta-data" }).ok, false);
  assert.equal(q({ headline: "가" }).ok, true, "변형 생략 = navy");
});
