/**
 * 썸네일 미리보기 주소 — 만들기(후보 → 주소)와 읽기(주소 → 그릴 값). **순수 모듈**.
 *
 * `GET /api/og/note-cover/preview?variant=&headline=&fact=&sub=&photo=` 는 DB 를 읽지 않는다. 그래서 받는 값을
 * 여기서 엄격히 막는다: 변형은 목록 안, 글자는 저장 규칙과 같은 상한(넘치면 400), 사진은 우리 스토리지
 * 주소만(아무 주소나 받으면 서버가 남의 주소를 대신 받아 오는 통로가 된다). 글자는 JSX 텍스트로만 그린다.
 */
import {
  FACT_MAX,
  HEADLINE_MAX,
  SUB_MAX,
  charLength,
  isAllowedCoverPhoto,
  isCoverVariant,
  squish,
  type CoverDraft,
} from "./spec";
import type { CoverRenderInput } from "./tree";

export const COVER_PREVIEW_PATH = "/api/og/note-cover/preview";

/** 쿼리 값 하나의 원문 길이 상한(자르기 전) — 긴 값으로 파서를 괴롭히지 못하게 */
const RAW_MAX = 120;
const PHOTO_RAW_MAX = 2048;

export function coverPreviewPath(
  draft: Pick<CoverDraft, "variant" | "headline" | "fact" | "sub">,
  photoUrl?: string | null,
): string {
  const q = new URLSearchParams({ variant: draft.variant, headline: draft.headline, sub: draft.sub });
  if (draft.fact) q.set("fact", draft.fact);
  if (draft.variant === "photo" && photoUrl) q.set("photo", photoUrl);
  return `${COVER_PREVIEW_PATH}?${q.toString()}`;
}

export type PreviewParse =
  | { ok: true; input: CoverRenderInput & { photoUrl: string | null } }
  | { ok: false; error: string };

export function parseCoverPreviewQuery(sp: URLSearchParams, photoHost?: string | null): PreviewParse {
  const raw = (k: string) => sp.get(k) ?? "";
  for (const k of ["variant", "headline", "fact", "sub"]) {
    if (raw(k).length > RAW_MAX) return { ok: false, error: `${k} 가 너무 깁니다` };
  }
  const variant = raw("variant") || "navy";
  if (!isCoverVariant(variant)) return { ok: false, error: "variant 는 navy·hanji·light·photo 중 하나" };
  const headline = squish(raw("headline"));
  const factRaw = squish(raw("fact"));
  const fact = factRaw ? factRaw : null;
  const sub = squish(raw("sub"));
  if (!headline) return { ok: false, error: "headline 이 필요합니다" };
  if (charLength(headline) > HEADLINE_MAX) return { ok: false, error: `headline 은 ${HEADLINE_MAX}자 이하` };
  if (fact && charLength(fact) > FACT_MAX) return { ok: false, error: `fact 는 ${FACT_MAX}자 이하` };
  if (charLength(sub) > SUB_MAX) return { ok: false, error: `sub 는 ${SUB_MAX}자 이하` };

  const photoRaw = raw("photo");
  let photoUrl: string | null = null;
  if (photoRaw) {
    if (photoRaw.length > PHOTO_RAW_MAX) return { ok: false, error: "photo 가 너무 깁니다" };
    const allowed = photoHost === undefined ? isAllowedCoverPhoto(photoRaw) : isAllowedCoverPhoto(photoRaw, photoHost);
    if (!allowed) return { ok: false, error: "photo 는 이 서비스 스토리지의 사진만" };
    photoUrl = photoRaw;
  }
  return { ok: true, input: { variant, headline, fact, sub, photoUrl } };
}
