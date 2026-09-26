/**
 * [1010] "동네·노트·프로필 축에서 무엇이 바뀌면 어느 경로가 바뀌는가" 의 순수 규칙.
 *
 * ── 왜 이 파일이 따로 있나 ──────────────────────────────────────────────
 * 지역 축의 lib/region/changed-region-paths.ts 와 같은 이유다. TTL 을 크롤러 재방문
 * 간격(≈2.2일)보다 길게 잡는 대신 **바뀐 페이지만** 즉시 비우려면, 쓰기 지점이
 * "이 글/노트가 어느 화면에 실리는가" 를 알아야 한다. 그 판정은 DB 조회와 섞이면
 * 테스트가 안 되므로 여기 순수 함수로 모은다(DB 조회·revalidatePath 는
 * lib/town/invalidate-town.ts).
 *
 * ── 실측 근거(2026-09-20~22 Vercel 청구) ───────────────────────────────
 * ISR Writes $1.45 · Fast Origin Transfer $1.10 · Fluid Active CPU $0.49 — 재렌더 1회가
 * 이 셋을 같이 태운다. 동네 축에서 재렌더가 가장 많이 도는 자리는 뉴스 상세(985회/일)와
 * 동네 홈 62곳(198회/일)이고, 사람 트래픽은 7일 합계 120뷰다. TTL 을 늘리는 대신
 * 여기 규칙으로 바뀐 페이지만 비운다.
 *
 * 규칙은 전부 "추측하지 않는다" 를 따른다 — 화면이 쓰는 것과 **같은 판정**만 쓴다.
 */
import { normalizeRegionLabel } from "@/lib/imjang/region-label";
import { TOWN_PROMPTS } from "@/lib/town/prompts";

/**
 * 공개 임장노트 한 편이 바뀌면 같이 바뀌는 **목록** 화면들.
 *
 * 각 화면이 실제로 공개 노트를 서버에서 그린다는 근거:
 *  · /notes          app/notes/page.tsx — listPublicNotesPage 첫 페이지
 *  · /notes/best     app/notes/best/page.tsx — listBestNoteMonths(공개 노트 전량 집계)
 *  · /notes/market   app/notes/market/page.tsx — listPublicNotes(50) 중 기준 충족분
 *  · /town/library   app/town/library/page.tsx — listPublicNotes(24)
 *
 * `/town`·`/town/[region]`·`/region/[id]`·`/complex/{id}` 는 각각 전용 헬퍼가 이미 맡는다
 * (invalidateTownFeed · invalidateRegionCodes · invalidateComplexById) — 여기서 겹쳐
 * 부르지 않는다.
 */
export const PUBLIC_NOTE_LIST_PATHS: readonly string[] = [
  "/notes",
  "/notes/best",
  "/notes/market",
  "/town/library",
];

/** 슬러그 — 공백만 하이픈으로. lib/market/tx-bands.ts regionToSlug 와 같은 규칙. */
function toRegionSlug(regionName: string): string {
  return regionName.trim().replace(/\s+/g, "-");
}

/**
 * 공개 임장노트의 지역 텍스트 → 그 노트가 실리는 `/imjang/{slug}` 경로 후보.
 *
 * app/imjang/[slug]/page.tsx 는 filterNotesByRegion(= noteRegionMatches)로 노트를 고른다:
 * 정규화한 노트 지역이 **지역명과 정확히 같거나 "지역명 + 공백"으로 시작**할 때만 실린다.
 * 그 판정을 거꾸로 돌리면 "정규화 라벨의 모든 접두(토큰 경계)"가 후보가 된다 —
 * "서울 송파구 가락동" → "서울" · "서울 송파구" · "서울 송파구 가락동".
 *
 * 실재하는 지역인지는 여기서 묻지 않는다. 확인하려면 실거래 지역 목록(server-only DB
 * 조회)이 필요한데, 쓰기 응답 경로에 조회를 하나 더 다는 것보다 **존재하지 않는 경로를
 * 두어 개 더 비우는 편**이 싸고 안전하다(revalidatePath 는 없는 경로에 무해하다).
 * 토큰이 3개를 넘는 표기는 상한에서 잘린다 — 실거래 지역명은 최대 2토큰이다.
 */
export function imjangPathsForNoteRegion(noteRegion: string | null | undefined): string[] {
  const norm = normalizeRegionLabel(String(noteRegion ?? ""));
  if (!norm) return [];
  const tokens = norm.split(/\s+/).filter(Boolean).slice(0, 3);
  const out: string[] = [];
  for (let i = 1; i <= tokens.length; i += 1) {
    const slug = toRegionSlug(tokens.slice(0, i).join(" "));
    if (slug) out.push(`/imjang/${slug}`);
  }
  return out;
}

/**
 * 공개 프로필 주소 후보 — `/u/{handle}` · `/u/{닉네임}`.
 *
 * app/u/[handle]/page.tsx 는 주소의 한 조각을 ① profiles.handle ② profiles.full_name
 * 순서로 찾는다. 즉 **한 사람에게 주소가 둘**일 수 있어 둘 다 비운다.
 *
 * 퍼센트 인코딩 형태도 같이 낸다. 닉네임은 한글일 수 있고, 브라우저가 실제로 요청하는
 * 주소는 인코딩된 형태(`/u/%ED%99%8D...`)다 — 어느 형태로 캐시돼 있는지에 걸어
 * "비웠다고 믿었는데 안 비워진" 자리를 만들지 않는다. 사람당 최대 4경로다.
 */
export function profilePaths(names: Iterable<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const raw of names) {
    const name = String(raw ?? "").trim();
    if (!name || name.includes("/")) continue;
    out.push(`/u/${name}`);
    let encoded = name;
    try {
      encoded = encodeURIComponent(name);
    } catch {
      /* 짝이 안 맞는 서러게이트 — 원형만 쓴다 */
    }
    if (encoded !== name) out.push(`/u/${encoded}`);
  }
  return out;
}

/**
 * 이웃 글의 태그 목록 → 그 글이 쌓이는 글감 스레드 경로(`/town/prompt/{idx}`).
 *
 * 태그 형식은 lib/town/prompts.ts promptTag(i) = `글감#{i}` 하나뿐이다. 범위 밖 인덱스는
 * 라우트가 404 라(dynamicParams=false) 경로를 만들지 않는다.
 */
export function promptPathsForTags(tags: Iterable<string> | null | undefined): string[] {
  if (!tags) return [];
  const out: string[] = [];
  for (const raw of tags) {
    const m = /^글감#(\d+)$/.exec(String(raw ?? "").trim());
    if (!m) continue;
    const idx = Number(m[1]);
    if (!Number.isInteger(idx) || idx < 0 || idx >= TOWN_PROMPTS.length) continue;
    out.push(`/town/prompt/${idx}`);
  }
  return out;
}

/**
 * 실거래 지역명 → 지역 임장 가이드 경로(`/imjang/{slug}` + 인덱스 `/imjang`).
 *
 * 두 화면 모두 실거래(tx_band_*)만으로 지역 목록·단지 순위를 그린다
 * (lib/imjang/guide.ts listImjangRegions·getImjangGuide). 슬러그 규칙은
 * lib/market/tx-bands.ts regionToSlug 와 같은 한 줄이다 — 공백만 하이픈으로.
 *
 * 인덱스(`/imjang`)는 "거래 많은 순 상위 48곳"이라 어느 지역이 바뀌어도 순서가 바뀔 수
 * 있으므로, 바뀐 지역이 하나라도 있으면 같이 비운다.
 */
export function imjangPathsForTxRegionNames(names: Iterable<string>): string[] {
  const slugs = new Set<string>();
  for (const raw of names) {
    const slug = toRegionSlug(String(raw ?? ""));
    if (slug) slugs.add(slug);
  }
  if (slugs.size === 0) return [];
  return ["/imjang", ...[...slugs].map((s) => `/imjang/${s}`)];
}

/** 전문가 목록·상세 — 등록 승인·수정·삭제·후기·상담 답변이 둘 다 바꾼다. */
export function expertPaths(id: string | null | undefined): string[] {
  const clean = String(id ?? "").trim();
  return clean ? ["/town/experts", `/town/experts/${clean}`] : ["/town/experts"];
}
