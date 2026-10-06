/**
 * 지오코딩 질의 후보 만들기 — 순수 함수.
 *
 * [971] 왜 따로 있나: complex-geocode.ts 는 `server-only` 라 node:test 에서 못
 * 읽는다. 후보를 **어떤 순서로** 세우는지가 이 파이프라인에서 제일 자주 틀리는
 * 부분(엉뚱한 도시로 찍히는 사고가 여기서 난다)이라, 그 판단만 떼어 검증한다.
 */

/**
 * 시/도가 빠진 지번 주소에 region_name 의 앞 토막을 붙인 후보.
 *
 * 실거래 주소는 "남구 신정동 산107-50" 처럼 시/도 없이 시작한다. "남구"·"중구"·
 * "북구" 는 전국에 여럿이라, 이 문자열만 주면 지오코더가 다른 도시의 같은 이름
 * 구로 찍을 수 있다. region_name 은 "울산 남구" 처럼 앞에 시/도를 달고 있으니
 * 그 토막을 빌려 쓴다.
 *
 * 보탤 게 없으면 빈 문자열을 돌려준다 — 이미 붙어 있거나("고양시 일산동구 …"),
 * region_name 이 한 토막이거나("김포시"), 주소가 없을 때.
 */
export function withSidoPrefix(region: string, address: string | null | undefined): string {
  const addr = (address ?? "").trim();
  if (!addr) return "";
  const scope = (region ?? "").trim();
  const head = scope.split(/\s+/)[0] ?? "";
  if (!head || head === scope || addr.startsWith(head)) return "";
  return `${head} ${addr}`;
}

/* ── [1043 · 지오코딩] 후보·검증 규칙 ────────────────────────────────────────────────────────────
 * 운영 실측(2026-10-06 · 아파트 단지 39,354곳): 좌표 있음 39,042 · 못 찾음 202 · 미시도 110.
 * 못 찾은 단지의 대부분은 **거래가 많은 신축**이다 — 지제역더샵센트럴시티(매매 297건) · 루원시티SK리더스뷰(253) ·
 * 캐슬앤파밀리에시티(236) … 실거래의 지번이 "가-" · "BL-" 같은 블록 자리라 주소가 아니고, 집계 뷰가 그 값을 주소로 골랐다.
 * 같은 단지의 **전월세 신고에는 도로명 주소가 있다**(raw.roadnm = "지제동삭1로 41") — 312곳 중 134곳, 진짜 지번이 있는 다른
 * 거래 행까지 치면 292곳. 그걸 후보로 쓴다(buildHintQueries).
 * 반대쪽 사고도 있었다: 단지명만으로 물은 후보가 **다른 도시**에 찍혀 "성공"으로 굳었다(인천 계양구 "동서" → 312km 밖 등 6건).
 * 그래서 ① 단지명만으로는 묻지 않고 ② 돌아온 주소의 시·도가 기대와 다르면 버린다(hitInSido).
 * 분양 단지의 주소("… 7번지 일원" · "… 971번지 외 157필지")는 꼬리를 떼고 묻는다(cleanLotAddress). */

/**
 * 이 규칙(거래 원본 단서 · 시·도 검증 · 주소 꼬리 떼기)이 들어간 시각. 이보다 **먼저** 못 찾음으로 적힌 행은 7일을 기다리지 않고
 * 한 번 다시 묻는다(complexes_needing_geocode_v2 의 p_retry_before · 분양 단지 백필). 그 뒤로는 예전처럼 7일 주기다.
 */
export const GEOCODE_RULES_SINCE = "2026-10-07T00:00:00Z";

/** 지번 자리가 블록 표기("가-" · "BL-2" · "블록-3")이거나 숫자가 아예 없는 주소 — 지오코더가 못 읽는다 */
export function isPlaceholderLot(address: string | null | undefined): boolean {
  const addr = (address ?? "").trim();
  if (!addr) return true;
  const tail = addr.split(/\s+/).pop() ?? "";
  if (/^(가|나|다|라|BL|B|블록|블럭)-[\d-]*$/i.test(tail)) return true;
  return !/\d/.test(tail);
}

/** 시·도 이름(어떤 표기든) → 짧은 열쇠. 주소의 **첫 토막**에 쓴다. 모르면 null */
export function sidoKeyOf(text: string | null | undefined): string | null {
  const t = (text ?? "").trim().split(/\s+/)[0] ?? "";
  if (!t) return null;
  if (t.startsWith("전남광주")) return "전남";
  const table: [string, string][] = [
    ["서울", "서울"], ["부산", "부산"], ["대구", "대구"], ["인천", "인천"], ["광주", "광주"], ["대전", "대전"],
    ["울산", "울산"], ["세종", "세종"], ["경기", "경기"], ["강원", "강원"],
    ["충청북", "충북"], ["충북", "충북"], ["충청남", "충남"], ["충남", "충남"],
    ["전라북", "전북"], ["전북", "전북"], ["전라남", "전남"], ["전남", "전남"],
    ["경상북", "경북"], ["경북", "경북"], ["경상남", "경남"], ["경남", "경남"], ["제주", "제주"],
  ];
  for (const [prefix, key] of table) if (t.startsWith(prefix)) return key;
  return null;
}

/**
 * 기대하는 시·도 열쇠들. 2026-07 통합(광주광역시 + 전라남도 → 전남광주통합특별시)은 지오코더 색인이 옛 이름일 수 있어
 * 둘 다 받는다. 모르는 이름이면 빈 배열(= 검증하지 않는다).
 */
export function expectedSidoKeys(sido: string | null | undefined): string[] {
  const s = (sido ?? "").trim();
  if (!s) return [];
  if (s.startsWith("전남광주")) return ["전남", "광주"];
  const k = sidoKeyOf(s);
  if (!k) return [];
  return k === "전남" || k === "광주" ? ["전남", "광주"] : [k];
}

/**
 * 지오코더가 돌려준 주소가 기대한 시·도 안인가.
 * 기대가 비어 있으면(모름) 통과 — 검증할 근거가 없을 때 멀쩡한 결과를 버리지 않는다.
 * 돌아온 주소에서 시·도를 못 읽어도 통과(표기가 바뀐 경우) — 이 검증은 "다른 도시에 찍힘"만 막는다.
 */
export function hitInSido(hitAddress: string | null | undefined, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return true;
  const k = sidoKeyOf(hitAddress);
  if (!k) return true;
  return allowed.includes(k);
}

/**
 * 분양·입주 공고의 주소 → 지오코더가 읽는 지번 주소. 읽을 지번이 없으면 "".
 *   "경기도 과천시 별양동 7번지 일원"                         → "경기도 과천시 별양동 7"
 *   "부산광역시 수영구 광안동 971번지 외 157필지"             → "부산광역시 수영구 광안동 971"
 *   "서울특별시 강동구 상일동 43번지 일원(…공공주택지구 12블럭)" → "서울특별시 강동구 상일동 43"
 *   "대전광역시 유성구 용계동 70대 일원"                      → "대전광역시 유성구 용계동 70"
 *   "서울특별시 성동구 홍익동 119-1,2"                        → "서울특별시 성동구 홍익동 119-1"
 *   "부산광역시 강서구 대저2동  0-0" · "… 공동주택용지 31BL"   → ""(지번이 아니다)
 */
export function cleanLotAddress(raw: string | null | undefined): string {
  let s = (raw ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  /* 지번(산 포함 · 부번 포함)이 처음 나오는 자리까지만 — 그 뒤는 "번지 일원" · "외 n필지" · ",2" 같은 꼬리다 */
  const m = /^(.*?[가-힣]\s)(산\s?)?(\d+(?:-\d+)?)(?=번지|대|\s|,|외|일원|$)/.exec(s);
  if (!m) return "";
  const lot = m[3];
  if (/^0+(-0+)?$/.test(lot)) return "";
  const head = m[1].trim();
  /* 지번 앞 토막이 동·리·가·로·길로 끝나야 주소다("… 공공택지지구 B-1블록"의 숫자를 지번으로 읽지 않는다) */
  const last = head.split(" ").pop() ?? "";
  if (!/(동|리|가|읍|면|로|길)$/.test(last)) return "";
  s = `${head} ${m[2] ? "산" : ""}${lot}`;
  return s.replace(/\s+/g, " ").trim();
}

/** 도로명 뒤에 건물번호가 붙어 있는가 — "지제동삭1로 41" · "고기로45번길 40-18" 은 참, "지제동삭1로" 는 거짓(길 이름 속 숫자) */
export function hasBuildingNo(road: string | null | undefined): boolean {
  const parts = (road ?? "").trim().split(/\s+/);
  return parts.length >= 2 && /^\d+(-\d+)?$/.test(parts[parts.length - 1]);
}

export type GeocodeQueryKind = "road" | "lot";
export type GeocodeQuery = { query: string; kind: GeocodeQueryKind };

/** 시·도를 앞에 붙인 주소 — 이미 그 시·도로 시작하면 그대로 */
export function withFullSido(sido: string | null | undefined, address: string | null | undefined): string {
  const addr = (address ?? "").trim();
  const s = (sido ?? "").trim();
  if (!addr) return "";
  if (!s) return addr;
  const addrKey = sidoKeyOf(addr);
  /* "광주시 …"(경기)처럼 시·도 열쇠로 읽히는 시 이름이 있다 — 주소가 "○○시/군/구"로 시작하면 시·도가 아니다 */
  const first = addr.split(" ")[0] ?? "";
  if (addrKey && !/(시|군|구)$/.test(first)) return addr;
  return `${s} ${addr}`;
}

/**
 * 첫 후보들이 전부 "없음"일 때 쓰는 두 번째 후보 — 거래 원본에서 찾은 도로명과 진짜 지번.
 *   roadName   전월세 신고의 도로명+건물번호("지제동삭1로 41")
 *   lotAddress 다른 거래 행의 숫자 지번 주소("평택시 지제동 1048")
 *   sido·sigungu 시군구 코드에서 읽은 공식 이름("경기도" · "평택시" / "용인시 수지구")
 */
export function buildHintQueries(input: {
  sido?: string | null;
  sigungu?: string | null;
  roadName?: string | null;
  lotAddress?: string | null;
}): GeocodeQuery[] {
  const out: GeocodeQuery[] = [];
  const push = (query: string, kind: GeocodeQueryKind) => {
    const t = query.replace(/\s+/g, " ").trim();
    if (t && !out.some((o) => o.query === t)) out.push({ query: t, kind });
  };
  const road = (input.roadName ?? "").trim();
  const sido = (input.sido ?? "").trim();
  const sigungu = (input.sigungu ?? "").trim();
  /* 도로명은 건물번호가 있어야 한 점이다 — "지제동삭1로"만으로는 길 전체가 답이 된다 */
  if (hasBuildingNo(road) && sigungu) {
    push(`${sido && sido !== sigungu ? `${sido} ` : ""}${sigungu} ${road}`, "road");
    /* 특별시·광역시는 구 이름을 뺀 후보를 하나 더 — 2026-07 구 신설·개명(인천 서해구·검단구·제물포구 …)을 지오코더 색인이
       아직 모를 수 있다. 한 광역시 안에서 도로명+건물번호는 한 점이라 구 없이도 같은 답이다(도 단위에서는 쓰지 않는다 —
       같은 도로명이 시마다 있다). 답은 시·도 검증을 거친다. */
    if (/(특별시|광역시)$/.test(sido)) push(`${sido} ${road}`, "road");
  }
  const lot = (input.lotAddress ?? "").trim();
  if (lot && !isPlaceholderLot(lot)) push(withFullSido(sido, lot), "lot");
  return out;
}

/**
 * 한 단지에 대한 질의 후보를 좋은 것부터 세운다.
 *
 * 네이버 지오코더는 POI(단지명)가 아니라 **주소** 전용이다("서울 송파구 리센츠"
 * 같은 질의의 실측 성공률 ~1%). 그래서 주소형을 앞에 두고, 그 안에서도
 *   도로명(대장) → 시/도 보정 지번 → 원본 지번
 * 순으로 내려간다. 구체적일수록 다른 도시로 잘못 찍힐 여지가 줄어든다.
 * [1043] 단지명 후보(지역+단지명 · 단지명)는 없앴다 — 주소가 없으면 후보가 없다(아래 buildGeocodePlan 주석).
 *
 * 빈 값과 중복은 여기서 지운다 — 부르는 쪽이 후보 수로 예산을 잡기 때문이다.
 */
export function buildGeocodePlan(input: {
  region: string;
  name: string;
  address?: string | null;
  roadAddress?: string | null;
  /** [1043] 시군구 코드에서 읽은 시·도 공식 이름("경기도") — 있으면 지번 앞에 붙인 후보를 하나 더 세운다 */
  sido?: string | null;
}): GeocodeQuery[] {
  const { region, name, address, roadAddress, sido } = input;
  const out: GeocodeQuery[] = [];
  const push = (q: string | null | undefined, kind: GeocodeQueryKind) => {
    const t = (q ?? "").trim();
    if (t && !out.some((o) => o.query === t)) out.push({ query: t, kind });
  };
  push(roadAddress, "road");
  /* [1043] 블록 자리("가-" · "BL-2")·숫자 없는 지번은 묻지 않는다 — 답이 없거나, 있어도 동 한가운데다 */
  if (!isPlaceholderLot(address)) {
    push(withSidoPrefix(region, address), "lot");
    if (sido) push(withFullSido(sido, address), "lot");
    push(address, "lot");
  }
  /* [1043] 단지명으로는 묻지 않는다("지역 + 단지명" · "단지명"). 이 지오코더는 주소 전용이라 이름이 "맞을" 때는 이름이
     어느 지명·도로명 조각으로 읽혔을 때뿐이다 — "동서" · "인왕" · "삼도" · "삼천리"가 그렇게 250~310km 밖에 찍혀 성공으로 굳었다.
     주소가 없으면 없다고 답한다. 거래 원본의 도로명·지번은 buildHintQueries 가 두 번째로 묻는다. */
  void name;
  return out;
}

/** 후보 문자열만(순서 그대로) — 예전 호출부·테스트용 */
export function buildGeocodeQueries(input: {
  region: string;
  name: string;
  address?: string | null;
  roadAddress?: string | null;
  sido?: string | null;
}): string[] {
  return buildGeocodePlan(input).map((q) => q.query);
}
