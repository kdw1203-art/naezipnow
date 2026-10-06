/**
 * [1040] 뉴스 → 지역 허브 연결 — 순수 함수(서버·테스트 공용 · DB 없음).
 *
 * 무엇이 문제였나(관리 화면 "뉴스→지역 연결률 10%", 2026-10-06): 자동수집 뉴스의 region 열은 **시·도**("서울"·"경기"·
 * "수도권")이거나 비어 있다. 지역 카탈로그는 **시·군·구** 단위라 region 만으로는 풀릴 수가 없다 — 1,000건 중 900건이
 * "미매핑"으로 세어졌고, 뉴스 상세의 지역 허브 링크도 그만큼 비어 있었다.
 * 시·군·구는 다른 자리에 이미 있다: automation_meta.geo.sigungu · geo.places · 태그 · 제목.
 *
 * 읽는 순서(앞에서 풀리면 멈춘다): region 열 → geo.sigungu → geo.places → 태그 → 제목.
 * 규칙: **틀린 연결은 미연결보다 나쁘다.** 부분 일치는 쓰지 않는다. "중구"·"서구"·"강서구"처럼 여러 도시에 있는 이름은
 * 시·도가 함께 있을 때만 푼다. 제목에 지역이 셋 이상이면 지역 기사가 아니라 종합 기사로 보고 풀지 않는다.
 */
import { REGION_CATALOG, findCatalogRegionStrict, normalizeRegionKey } from "@/lib/region/catalog";
import type { SeoulDistrictInfo } from "@/lib/map/seoul-districts";

export type NewsRegionVia = "region" | "sigungu" | "place" | "tag" | "title";

export type NewsRegionLink = {
  /** 지역 허브 id(/region/[id]) — 못 풀면 null */
  id: string | null;
  via: NewsRegionVia | null;
  /** 시·도("서울"·"경기"…) — 모르면 null */
  sido: string | null;
};

export type NewsRegionInput = {
  region?: string | null;
  /** 수집 메타 — 실측(2026-10-06): sigungu 는 글자("강남구")일 때도, 배열(["송파구"] · [])일 때도 있다. 모르는 꼴은 버린다 */
  geo?: { sido?: unknown; sigungu?: unknown; places?: unknown } | null;
  tags?: readonly string[] | null;
  title?: string | null;
};

const SIDO_SHORT = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"] as const;
const SIDO_LONG: Record<string, string> = {
  충청북도: "충북",
  충청남도: "충남",
  전라북도: "전북",
  전라남도: "전남",
  경상북도: "경북",
  경상남도: "경남",
  전북특별자치도: "전북",
  강원특별자치도: "강원",
  제주특별자치도: "제주",
  전남광주통합특별시: "광주",
};

/** "서울특별시"·"경기도"·"서울" → "서울"·"경기". 시·도가 아니면 null("수도권"·"전국"도 null) */
export function newsSidoOf(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().split(/\s+/)[0] ?? "";
  if (!v) return null;
  if (SIDO_LONG[v]) return SIDO_LONG[v];
  const short = v.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "");
  return (SIDO_SHORT as readonly string[]).includes(short) ? short : null;
}

const cityOf = (info: SeoulDistrictInfo): string => info.city ?? "서울";
const ACTIVE = REGION_CATALOG.filter((r) => !r.retired);

/** 이름의 마지막 낱말("성남시 분당구" → "분당구") → 그 낱말을 쓰는 항목들 */
const BY_LAST_TOKEN = new Map<string, SeoulDistrictInfo[]>();
for (const info of ACTIVE) {
  const last = info.name.trim().split(/\s+/).pop() ?? "";
  if (!last) continue;
  BY_LAST_TOKEN.set(last, [...(BY_LAST_TOKEN.get(last) ?? []), info]);
}

/**
 * 지역 이름 한 덩어리 → 항목. sido 가 있으면 그 시·도 안에서만 인정한다.
 *  · 정확·별칭·통용 지명·시 접미("수원 영통구")는 카탈로그 규칙 그대로(findCatalogRegionStrict)
 *  · "부산"+"중구" → "부산 중구" · "분당구" → 마지막 낱말이 하나뿐일 때만
 */
export function strictNewsRegion(name: string, sido: string | null): SeoulDistrictInfo | null {
  const raw = name.trim();
  if (!raw) return null;
  const words = raw.split(/\s+/);
  /* 앞 낱말이 시·도면 떼어 힌트로 쓴다("서울 강남구" · "경기도 성남시 분당구") */
  const headSido = newsSidoOf(words[0]);
  const hint = headSido ?? sido;
  const body = headSido && words.length > 1 ? words.slice(1).join(" ") : raw;

  const accept = (info: SeoulDistrictInfo | undefined | null): SeoulDistrictInfo | null => {
    if (!info || info.retired) return null;
    return hint && cityOf(info) !== hint ? null : info;
  };

  if (hint && hint !== "서울") {
    const withSido = accept(findCatalogRegionStrict(`${hint} ${body}`));
    if (withSido) return withSido;
  }
  const bodyWords = body.split(/\s+/);
  const last = bodyWords[bodyWords.length - 1] ?? "";
  const sameLast = BY_LAST_TOKEN.get(last) ?? [];
  const direct = findCatalogRegionStrict(body);
  if (direct) {
    /* 같은 끝 낱말을 다른 도시도 쓰면("중구"·"서구"·"강서구") 시·도 없이는 풀지 않는다 */
    if (!hint && bodyWords.length === 1 && sameLast.length > 1) return null;
    const ok = accept(direct);
    if (ok) return ok;
  }
  /* 읍·면·동까지 붙은 표기("강남구 대치동" · "성남시 분당구 정자동") — 앞에서부터 줄여 본다 */
  for (let n = Math.min(2, bodyWords.length - 1); n >= 1; n--) {
    const head = bodyWords.slice(0, n).join(" ");
    const headLast = bodyWords[n - 1] ?? "";
    const hit = findCatalogRegionStrict(head);
    if (!hit) continue;
    if (!hint && n === 1 && (BY_LAST_TOKEN.get(headLast)?.length ?? 0) > 1) continue;
    const ok = accept(hit);
    if (ok) return ok;
  }
  /* 구 이름만("분당구") — 그 끝 낱말을 쓰는 항목이 (시·도 안에서) 하나뿐일 때 */
  if (bodyWords.length === 1 && /[구군]$/.test(last)) {
    const pool = hint ? sameLast.filter((i) => cityOf(i) === hint) : sameLast;
    if (pool.length === 1) return pool[0];
  }
  return null;
}

/* ── 제목 읽기 ───────────────────────────────────────────────────────────── */

/** 접미 없이 써도 그 구·시를 뜻하는 낱말(서울 자치구 · 경기 시 · 통용 지명).
 *  뜻이 넓거나 다른 말과 겹치는 것은 뺀다 — "강북"(한강 이북)·"강서"·"중"·"구리"(금속)·"수지"(수지 타산)·"광주"·"화성"·"일산"(구가 둘). */
const TITLE_STEMS: Record<string, string> = {
  강남: "gangnam",
  강동: "gangdong",
  관악: "gwanak",
  광진: "gwangjin",
  구로: "guro",
  금천: "geumcheon",
  노원: "nowon",
  도봉: "dobong",
  동대문: "dongdaemun",
  동작: "dongjak",
  마포: "mapo",
  서대문: "seodaemun",
  서초: "seocho",
  성동: "seongdong",
  성북: "seongbuk",
  송파: "songpa",
  양천: "yangcheon",
  영등포: "yeongdeungpo",
  용산: "yongsan",
  은평: "eunpyeong",
  종로: "jongno",
  중랑: "jungnang",
  분당: "seongnam-bundang",
  판교: "seongnam-bundang",
  목동: "yangcheon",
  마곡: "gangseo",
  동탄: "hwaseong-dongtan",
  기흥: "yongin-giheung",
  영통: "suwon-yeongtong",
  광교: "suwon-yeongtong",
  평촌: "anyang-dongan",
  부천: "bucheon",
  광명: "gwangmyeong",
  하남: "hanam",
  남양주: "namyangju",
  김포: "gimpo",
  의정부: "uijeongbu",
  과천: "gwacheon",
  의왕: "uiwang",
  군포: "gunpo",
  시흥: "siheung",
  평택: "pyeongtaek",
  송도: "incheon-yeonsu",
  청라: "incheon-seohae",
  검단: "incheon-geomdan",
  해운대: "busan-haeundae",
};
/**
 * 동네·역세권 이름 → 그 동네가 속한 구. 기사 제목은 구 이름보다 동네 이름을 쓴다("압구정 현대"·"목동13단지"·"성수3지구").
 * 한 구 안에만 있는 이름만 넣는다 — 둘 이상에 걸치거나(위례·정자동·고덕) 다른 뜻이 흔한 말(중동·미사·다산)은 뺀다.
 * 뜻이 겹칠 수 있는 두 글자 이름은 "동"·숫자 같은 꼬리가 붙은 꼴만 인정한다(대치 → "대치동", 한남 → "한남동"·"한남3구역").
 */
const NEIGHBORHOODS: Array<[RegExp, string]> = [
  [/압구정|청담|역삼|도곡|개포|대치동|삼성동|일원동|수서/, "gangnam"],
  [/반포|방배|잠원|서초동|양재|내곡/, "seocho"],
  [/잠실|문정동|가락동|거여|마천(?:동|[0-9])|방이동|풍납/, "songpa"],
  [/둔촌|천호(?:동|역|뉴타운|[0-9])|상일동|명일동|길동/, "gangdong"],
  [/여의도|신길(?:동|뉴타운|[0-9])|당산동|문래/, "yeongdeungpo"],
  [/한남(?:동|뉴타운|[0-9])|이촌동|동부이촌|보광동|서빙고/, "yongsan"],
  [/성수(?:동|전략|[0-9])|옥수동|금호동|왕십리|행당/, "seongdong"],
  [/노량진|흑석|사당동|상도동/, "dongjak"],
  [/신림(?:동|뉴타운|[0-9])|봉천(?:동|[0-9])/, "gwanak"],
  [/상계(?:동|주공|뉴타운|[0-9])|중계(?:동|주공|[0-9])|하계(?:동|[0-9])|월계(?:동|[0-9])/, "nowon"],
  [/창동|쌍문|방학(?:동|역)/, "dobong"],
  [/미아(?:동|뉴타운|[0-9])|번동|수유/, "gangbuk"],
  [/길음|장위|정릉|돈암/, "seongbuk"],
  [/청량리|이문(?:동|휘경|[0-9])|휘경|전농|답십리/, "dongdaemun"],
  [/자양(?:동|[0-9])|구의(?:동|역)|광장동/, "gwangjin"],
  [/불광|수색|증산(?:동|[0-9])|갈현|녹번/, "eunpyeong"],
  [/북아현|홍제|홍은|가재울/, "seodaemun"],
  [/아현(?:동|뉴타운|[0-9])|공덕|상암|성산(?:동|시영)|합정/, "mapo"],
  [/창신|숭인|세운(?:지구|[0-9])|옥인동|명륜/, "jongno"],
  [/신정(?:동|뉴타운|[0-9])|신월(?:동|시영)/, "yangcheon"],
  [/등촌|가양(?:동|[0-9])|염창|화곡|방화(?:동|뉴타운|[0-9])/, "gangseo"],
  [/가산(?:동|디지털)|독산|시흥동/, "geumcheon"],
  [/개봉(?:동|[0-9])|고척|신도림|오류동/, "guro"],
  [/망우|면목|상봉(?:동|역|[0-9])|신내/, "jungnang"],
  [/철산|하안(?:동|주공|[0-9])|소하(?:동|[0-9])/, "gwangmyeong"],
  [/산본/, "gunpo"],
  [/영종(?:도|하늘도시|국제도시)/, "incheon-yeongjong"],
];

const BY_ID = new Map(REGION_CATALOG.map((r) => [r.id, r]));
const STEM_ENTRIES = Object.entries(TITLE_STEMS).filter(([, id]) => BY_ID.has(id));

/** 조사 — 지역 이름 바로 뒤에 붙어도 그 이름이 끝난 것으로 본다 */
const PARTICLE = /^(은|는|이|가|을|를|의|에|도|와|과|로|서|만|發)/;

function isHangul(ch: string | undefined): boolean {
  return !!ch && /[가-힣]/.test(ch);
}

/** 앞 낱말("성남시"·"성남"·"부산") → 후보 가운데 그 도시의 항목 */
function pickByPrevWord(prev: string, pool: readonly SeoulDistrictInfo[]): SeoulDistrictInfo | null {
  if (!prev) return null;
  const sido = newsSidoOf(prev);
  for (const info of pool) {
    const words = info.name.trim().split(/\s+/);
    if (sido && cityOf(info) === sido && words.length <= 2 && (words.length === 1 || newsSidoOf(words[0]) === sido)) return info;
    if (words.length === 2) {
      const head = words[0];
      if (prev === head || `${prev}시` === head) return info;
    }
  }
  return null;
}

type Mention = { at: number; id: string };

/** 제목에서 지역 언급을 찾는다(앞에서부터, 중복 없이) */
export function newsTitleRegions(title: string, sido: string | null): string[] {
  const text = title.replace(/\s+/g, " ");
  const found: Mention[] = [];

  /* ① 구·군·시로 끝나는 카탈로그 이름("분당구"·"해운대구"·"광명시") — 앞 낱말·시·도로 어느 도시인지 가른다 */
  for (const [last, pool] of BY_LAST_TOKEN) {
    for (let at = text.indexOf(last); at >= 0; at = text.indexOf(last, at + last.length)) {
      const before = at > 0 ? text[at - 1] : " ";
      if (isHangul(before)) continue; // "강남구" 안의 "남구" · "일산동구" 안의 "동구"
      const after = text.slice(at + last.length, at + last.length + 2);
      /* 두 글자 이름("중구"·"서구")은 다른 낱말의 머리일 수 있다("중구난방"·"서구권") — 뒤가 조사·비한글일 때만 */
      if (last.length <= 2 && isHangul(after[0]) && !PARTICLE.test(after)) continue;
      const prev = text.slice(0, Math.max(0, at - 1)).match(/[가-힣]+$/)?.[0] ?? "";
      const byPrev = before === " " ? pickByPrevWord(prev, pool) : null;
      const inSido = sido ? pool.filter((i) => cityOf(i) === sido) : [];
      const info = byPrev ?? (inSido.length === 1 ? inSido[0] : pool.length === 1 ? pool[0] : null);
      /* 앞 낱말이 도시를 말하면 그것이 이긴다(byPrev) → 기사 시·도 안에 하나뿐인 이름 → 전국에 하나뿐인 이름 */
      if (info) found.push({ at, id: info.id });
    }
  }
  /* ② 접미 없는 낱말("강남 아파트" · "판교 오피스") — 뒤에 "권"·"3구"가 오면 그 구 하나를 뜻하지 않는다 */
  for (const [stem, id] of STEM_ENTRIES) {
    const info = BY_ID.get(id);
    if (!info || (sido && cityOf(info) !== sido)) continue;
    for (let at = text.indexOf(stem); at >= 0; at = text.indexOf(stem, at + stem.length)) {
      const before = at > 0 ? text[at - 1] : " ";
      if (isHangul(before)) continue; // 다른 낱말의 일부("신강남"·"남서초")
      const after = text.slice(at + stem.length, at + stem.length + 4);
      if (/^(권|북|\s?[0-9]구|[·ㆍ,]\S{1,4}\s?[0-9]구)/.test(after)) continue;
      if (isHangul(after[0]) && !/^(구|시|동|역|신도시|신시가지)/.test(after) && !PARTICLE.test(after)) continue;
      found.push({ at, id: info.id });
      break;
    }
  }
  /* ③ 동네 이름("압구정 현대" · "목동13단지" · "성수3지구") — 구 이름·통용 지명으로 못 읽었을 때의 보탬 */
  for (const [re, id] of NEIGHBORHOODS) {
    const info = BY_ID.get(id);
    if (!info || (sido && cityOf(info) !== sido)) continue;
    const m = re.exec(text);
    if (!m) continue;
    const before = m.index > 0 ? text[m.index - 1] : " ";
    if (isHangul(before)) continue;
    found.push({ at: m.index, id: info.id });
  }
  const ordered = found.sort((a, b) => a.at - b.at).map((f) => f.id);
  return [...new Set(ordered)];
}

/** 뉴스 한 건 → 지역 허브 */
/** 글자 하나 또는 글자 배열 → 빈 값을 뺀 글자 목록(그 밖의 꼴은 빈 목록) */
function textList(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return arr.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}

export function resolveNewsRegion(input: NewsRegionInput): NewsRegionLink {
  const region = typeof input.region === "string" ? input.region.trim() : "";
  const geoSido = typeof input.geo?.sido === "string" ? input.geo.sido : null;
  const sido = newsSidoOf(geoSido) ?? newsSidoOf(region);
  const hit = (info: SeoulDistrictInfo | null, via: NewsRegionVia): NewsRegionLink | null =>
    info ? { id: info.id, via, sido: sido ?? cityOf(info) } : null;

  /* region 열이 시·도 낱말 하나뿐이면 지역 이름이 아니다 */
  if (region && normalizeRegionKey(region) !== normalizeRegionKey(sido ?? "")) {
    const r = hit(strictNewsRegion(region, null), "region");
    if (r) return r;
  }
  /* 시·군·구가 셋 이상 적힌 기사(["강남구","서초구","송파구"])는 종합 기사 — 제목 규칙과 같이 풀지 않는다 */
  const sigungus = textList(input.geo?.sigungu);
  if (sigungus.length >= 3) return { id: null, via: null, sido };
  for (const sigungu of sigungus) {
    const r = hit(strictNewsRegion(sigungu, sido), "sigungu");
    if (r) return r;
  }
  for (const place of textList(input.geo?.places)) {
    const r = hit(strictNewsRegion(place, sido), "place");
    if (r) return r;
  }
  for (const tag of input.tags ?? []) {
    const t = String(tag ?? "").trim();
    /* 태그는 주제어가 섞인다 — 구·군·시로 끝나는 것만 지역 후보로 본다 */
    if (!/[시군구]$/.test(t)) continue;
    const r = hit(strictNewsRegion(t, sido), "tag");
    if (r) return r;
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title) {
    const ids = newsTitleRegions(title, sido);
    if (ids.length >= 1 && ids.length <= 2) {
      const info = BY_ID.get(ids[0]) ?? null;
      const r = hit(info, "title");
      if (r) return r;
    }
  }
  return { id: null, via: null, sido };
}

/* ── 집계(관리 화면) ─────────────────────────────────────────────────────── */

export type NewsRegionTally = {
  total: number;
  /** 시·군·구 허브로 연결 */
  linked: number;
  /** 시·도까지만 아는 기사(허브는 시·군·구 단위라 연결 대상이 없다) */
  sidoOnly: number;
  /** 지역 표기가 없는 기사(전국·정책·금리) */
  noRegion: number;
  via: Record<NewsRegionVia, number>;
};

export function tallyNewsRegions(rows: readonly NewsRegionInput[]): NewsRegionTally {
  const t: NewsRegionTally = {
    total: rows.length,
    linked: 0,
    sidoOnly: 0,
    noRegion: 0,
    via: { region: 0, sigungu: 0, place: 0, tag: 0, title: 0 },
  };
  for (const row of rows) {
    const r = resolveNewsRegion(row);
    if (r.id && r.via) {
      t.linked += 1;
      t.via[r.via] += 1;
    } else if (r.sido) t.sidoOnly += 1;
    else t.noRegion += 1;
  }
  return t;
}
