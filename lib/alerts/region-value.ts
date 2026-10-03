/**
 * [1027] 지역 알림 구독 값 — 한 가지 표기로 모으고, 그 값이 어느 시/도·어느 지역인지 푼다. 순수 함수
 * (tests/unit/alerts-1027.test.ts). DB·fetch 없음 · server-only 사슬 밖.
 *
 * ── 왜 ──────────────────────────────────────────────────────────────────
 * 지역 구독 값(user_watchlist 의 alert:region:<값>)을 읽는 곳이 셋이고 서로 다른 표기를 기대했다.
 *   · 청약 알림(app/api/cron/applyhome-alerts) — 값 안에 시/도 이름("서울"·"경기") 글자가 **들어 있어야** 했다.
 *   · 새 매물 알림(lib/notifications/region-alerts) — 값이 매물의 region_name 과 글자까지 같아야 했다.
 *   · 주간 요약·홈 요약(lib/digest/personal · lib/market/watchlist-brief) — 카탈로그에서 "비슷한 이름"으로 찾았다.
 * 가입·온보딩의 지역 선택기는 "서울 마포구"·"성남 분당구"·"과천시"(실거래 region_name 표기)를 넣는다.
 * 그래서 "성남 분당구"·"과천시" 구독자에게는 청약 알림이 한 건도 가지 않았고(시/도 글자가 없다),
 * 경기 "광주시"는 글자 "광주"가 들어 있어 광주광역시 공고가 갔고, 매물 등록 화면이 적는 "강남구"는
 * "서울 강남구" 구독과 글자가 달라 새 매물 알림이 한 번도 맞지 않았고, "대구 달서구"는 비슷한 이름 찾기에서
 * "서구"가 걸려 인천 서구 숫자가 나왔다.
 *
 * ── 규칙 ────────────────────────────────────────────────────────────────
 *  저장하는 값은 **실거래 region_name 표기** 하나다(지역 선택기가 쓰던 그 표기 — 저장 형식을 바꾸지 않는다).
 *  화면마다 다른 표기("경기 안양시 만안구"·"안양시 만안구"·"강남구")는 저장 전에 그 표기로 바꾼다.
 *  시/도·지역은 값에서 글자를 찾지 않고 시군구 코드 표(lib/national-data/region-codes)와 지역 카탈로그의
 *  **정확 일치**로만 푼다. 못 찾는 값은 그대로 두고(지어내지 않는다) 그 값으로는 청약·요약을 보내지 않는다.
 */
import { APPLYHOME_REGIONS, type ApplyhomeRegion } from "@/lib/applyhome/regions";
import { molitRegionLabel } from "@/lib/market/molit-core";
import { marketRegionNameCandidates } from "@/lib/market/region-name-candidates";
import { sidoOfRegionName } from "@/lib/market/sido-group";
import { getAllSido, getSigunguBySido, type SigunguInfo } from "@/lib/national-data/region-codes";
import { REGION_CATALOG, normalizeRegionKey } from "@/lib/region/catalog";

export type AlertSido = Exclude<ApplyhomeRegion, "전체">;

const SHORT_SIDO: ReadonlySet<string> = new Set(APPLYHOME_REGIONS.filter((r) => r !== "전체"));

function isShortSido(v: string): v is AlertSido {
  return SHORT_SIDO.has(v);
}

/** 긴 시/도 이름 → 짧은 이름(청약홈 공급지역 표기). Map — 객체 열쇠 조회는 "constructor" 같은 값에 속는다 */
const LONG_SIDO: ReadonlyMap<string, AlertSido> = new Map<string, AlertSido>([
  ["서울특별시", "서울"],
  ["서울시", "서울"],
  ["부산광역시", "부산"],
  ["대구광역시", "대구"],
  ["인천광역시", "인천"],
  ["광주광역시", "광주"],
  ["대전광역시", "대전"],
  ["울산광역시", "울산"],
  ["세종특별자치시", "세종"],
  ["경기도", "경기"],
  ["강원도", "강원"],
  ["강원특별자치도", "강원"],
  ["충청북도", "충북"],
  ["충청남도", "충남"],
  ["전라북도", "전북"],
  ["전북특별자치도", "전북"],
  ["전라남도", "전남"],
  ["경상북도", "경북"],
  ["경상남도", "경남"],
  ["제주도", "제주"],
  ["제주특별자치도", "제주"],
]);

/** 시군구 코드 앞 두 자리 → 시/도. 12(전남광주통합특별시)는 구 = 광주 · 시·군 = 전남(sidoShortLabel 과 같은 규칙). */
const SIDO_BY_CODE_PREFIX: ReadonlyMap<string, AlertSido> = new Map<string, AlertSido>([
  ["11", "서울"],
  ["26", "부산"],
  ["27", "대구"],
  ["28", "인천"],
  ["30", "대전"],
  ["31", "울산"],
  ["36", "세종"],
  ["41", "경기"],
  ["43", "충북"],
  ["44", "충남"],
  ["47", "경북"],
  ["48", "경남"],
  ["50", "제주"],
  ["51", "강원"],
  ["52", "전북"],
]);

/** 이보다 긴 값은 지역 이름이 아니다 — 표를 뒤지지 않고 그대로 돌려준다(저장부가 30자에서 거절한다) */
export const ALERT_REGION_MAX_CHARS = 60;

function sidoOfInfo(info: Pick<SigunguInfo, "sigunguCd" | "sigungu">): AlertSido | null {
  const prefix = info.sigunguCd.slice(0, 2);
  if (prefix === "12") return info.sigungu.endsWith("구") ? "광주" : "전남";
  return SIDO_BY_CODE_PREFIX.get(prefix) ?? null;
}

const squash = (s: string) => s.replace(/\s+/g, "");
const tidy = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ");

type Tables = {
  /** 실거래 표기 → 시/도(들). "고성군"만 둘(강원·경남)이다. */
  sidosByLabel: Map<string, Set<AlertSido>>;
  /** "<시/도>|<시군구 정식 이름(공백 없음)>" → 실거래 표기. "경기|안양시만안구" → "안양 만안구" */
  labelBySidoFull: Map<string, string>;
  /** 시군구 정식 이름(공백 없음) → 실거래 표기(들). "강남구" → {"서울 강남구"} · "중구" → 여섯 */
  labelsByFull: Map<string, Set<string>>;
  /** 실거래 표기·카탈로그 이름·별칭(정규화 키) → 카탈로그 id. 두 지역에 걸리는 키는 넣지 않는다 */
  catalogIdByKey: Map<string, string>;
};

let tables: Tables | null = null;

function getTables(): Tables {
  if (tables) return tables;
  const sidosByLabel = new Map<string, Set<AlertSido>>();
  const labelBySidoFull = new Map<string, string>();
  const labelsByFull = new Map<string, Set<string>>();
  /* 자치구·시·군(실제 수집 단위)과, 구를 가진 시의 이름("수원시"·"화성시")까지 싣는다 — 시 이름만 적힌 값
     (구가 생기기 전의 실거래 표기 · 지역 선택기의 "경기 수원시")도 시/도는 분명하다. 시/도 행 자체는 뺀다. */
  for (const sidoName of getAllSido()) {
    for (const info of getSigunguBySido(sidoName)) {
      if (info.sigungu === info.sido || info.sigunguCd.endsWith("000")) continue;
      const sido = sidoOfInfo(info);
      if (!sido) continue;
      const label = molitRegionLabel(info);
      const full = squash(info.sigungu);
      if (!sidosByLabel.has(label)) sidosByLabel.set(label, new Set());
      sidosByLabel.get(label)!.add(sido);
      labelBySidoFull.set(`${sido}|${full}`, label);
      if (!labelsByFull.has(full)) labelsByFull.set(full, new Set());
      labelsByFull.get(full)!.add(label);
    }
  }

  /* 카탈로그 — 이름·별칭·실거래 후보 표기의 **정확 일치**만. 같은 키가 두 지역에 걸리면 버린다 */
  const seen = new Map<string, string | null>();
  for (const info of REGION_CATALOG) {
    const names = [info.name, ...(info.aliases ?? []), ...marketRegionNameCandidates(info.id, info.name)];
    for (const n of names) {
      const key = normalizeRegionKey(n);
      if (!key) continue;
      const prev = seen.get(key);
      if (prev === undefined) seen.set(key, info.id);
      else if (prev !== info.id) seen.set(key, null);
    }
  }
  const catalogIdByKey = new Map<string, string>();
  for (const [k, id] of seen) if (id) catalogIdByKey.set(k, id);

  tables = { sidosByLabel, labelBySidoFull, labelsByFull, catalogIdByKey };
  return tables;
}

function sidoOfToken(token: string): AlertSido | null {
  if (isShortSido(token)) return token;
  return LONG_SIDO.get(token) ?? null;
}

/**
 * 구독할 지역 값을 실거래 region_name 표기로 바꾼다. 이미 그 표기이거나 표에서 못 찾으면 그대로.
 *  "경기 안양시 만안구"·"안양시 만안구" → "안양 만안구" · "강남구" → "서울 강남구" · "경기 광명시" → "광명시"
 *  "서울특별시" → "서울" · "서울" → "서울"(시/도 단위 구독) · "판교" → "판교"(모르는 값은 손대지 않는다)
 *  두 시/도에 같은 표기가 있는 "고성군"은 시/도를 붙인 채로 둔다("강원 고성군" — 떼면 어느 고성인지 잃는다).
 */
export function canonicalAlertRegion(raw: string): string {
  const v = tidy(raw);
  if (!v || v.length > ALERT_REGION_MAX_CHARS) return v;
  const t = getTables();
  if (t.sidosByLabel.has(v)) return v;

  let tokens = v.split(" ");
  const head = sidoOfToken(tokens[0] ?? "");
  if (head) {
    /* 같은 시/도가 거듭 적힌 표기("인천 인천 중구" — 온도 표의 옛 라벨)는 한 번으로 */
    while (tokens.length > 1 && sidoOfToken(tokens[1] ?? "") === head) tokens = tokens.slice(1);
    const rest = tokens.slice(1).join(" ");
    if (!rest) return head;
    const label =
      t.labelBySidoFull.get(`${head}|${squash(rest)}`) ??
      (t.sidosByLabel.get(rest)?.has(head) ? rest : undefined) ??
      (t.sidosByLabel.has(`${head} ${rest}`) ? `${head} ${rest}` : undefined);
    if (!label) return `${head} ${rest}`;
    return (t.sidosByLabel.get(label)?.size ?? 0) > 1 ? `${head} ${label}` : label;
  }

  /* 시/도 없이 적힌 이름 — 전국에 하나뿐이면 그 표기로("강남구"·"안양시 만안구") */
  const byFull = t.labelsByFull.get(squash(v));
  if (byFull && byFull.size === 1) return [...byFull][0]!;
  /* 여러 시/도에 있는 이름("중구")은 카탈로그가 가리키는 시/도로(화면의 묶음 규칙과 같다 — sidoOfRegionName) */
  const sido = sidoOfRegionName(v);
  if (sido && isShortSido(sido)) {
    const hit = t.labelBySidoFull.get(`${sido}|${squash(v)}`);
    if (hit) return hit;
  }
  return v;
}

/**
 * 구독 값이 속한 시/도(들). 청약 알림이 이 값으로 공고의 공급지역과 맞춘다.
 *  보통 하나, 시/도 없는 "고성군"만 둘(강원·경남 — 실거래 표기가 같다), 못 풀면 빈 배열.
 *  "광주시 오포읍"처럼 뒤에 동·읍이 붙은 값은 앞 낱말부터 줄여 가며 표에서 찾는다(글자 "광주"를 찾지 않는다).
 */
export function alertRegionSidos(value: string): AlertSido[] {
  const v = canonicalAlertRegion(value);
  if (!v || v.length > ALERT_REGION_MAX_CHARS) return [];
  const t = getTables();
  const byLabel = t.sidosByLabel.get(v);
  if (byLabel) return [...byLabel];
  const tokens = v.split(" ");
  const head = sidoOfToken(tokens[0] ?? "");
  if (head) return [head];
  const cat = sidoOfRegionName(v);
  if (cat && isShortSido(cat)) return [cat];
  for (let n = tokens.length - 1; n >= 1; n -= 1) {
    const hit = t.sidosByLabel.get(canonicalAlertRegion(tokens.slice(0, n).join(" ")));
    if (hit) return [...hit];
  }
  return [];
}

/**
 * 공고 주소와 맞춰 볼 시군구 낱말 — 값의 마지막 낱말("서울 강남구" → "강남구" · "안양 만안구" → "만안구" ·
 * "광명시" → "광명시"). 시/도만 구독했으면("서울") 빈 문자열.
 */
export function alertRegionDistrictToken(value: string): string {
  const v = canonicalAlertRegion(value);
  const tokens = v.split(" ").filter(Boolean);
  const last = tokens[tokens.length - 1] ?? "";
  return sidoOfToken(last) ? "" : last;
}

/** 구독 값 하나를 청약 공고와 맞출 때 쓰는 모양 */
export type AlertRegionTarget = { value: string; sidos: AlertSido[]; district: string };

/** 시/도를 못 푼 값은 null — 청약 알림 대상이 아니다(새 매물 알림은 listingRegionKeys 로 맞춘다) */
export function alertRegionTarget(value: string): AlertRegionTarget | null {
  const sidos = alertRegionSidos(value);
  if (sidos.length === 0) return null;
  return { value: canonicalAlertRegion(value), sidos, district: alertRegionDistrictToken(value) };
}

/**
 * 공고(공급지역 = 시/도, 주소)가 이 구독에 걸리는가.
 *  hit    — 같은 시/도면 알린다(놓치는 것보다 한 건 더 알리는 쪽 — applyhome-alerts 의 기존 규칙).
 *  strong — 주소에 시군구 이름까지 있으면 먼저 보인다.
 *  시/도가 둘로 풀린 값("고성군")은 주소에 그 이름이 있을 때만 hit — 다른 도의 공고를 통째로 보내지 않는다.
 */
export function matchAnnouncementRegion(
  target: AlertRegionTarget,
  a: { region?: string | null; address?: string | null },
): { hit: boolean; strong: boolean } {
  const region = a.region ?? "";
  const inSido = target.sidos.some((s) => region === s || region.includes(s));
  const strong = inSido && target.district.length > 0 && Boolean(a.address?.includes(target.district));
  return { hit: target.sidos.length > 1 ? strong : inSido, strong };
}

/**
 * 새 매물의 지역(region_name)에 걸리는 구독 값들 — 새 매물 알림이 이 값들로 구독 행을 찾는다.
 *
 * 매물 등록 화면은 "강남구"처럼 구 이름만 적고, 구독은 "서울 강남구"(실거래 표기)로 저장된다 — 예전에는
 * 글자 그대로만 견줘서 둘이 한 번도 맞지 않았다. 매물 쪽 이름을 같은 표기로 바꿔 같이 찾는다.
 *  · 적힌 그대로 + 그 안의 구/시/군 낱말(예전 규칙 — 옛 표기로 저장된 구독도 계속 맞는다)
 *  · 실거래 표기("강남구" → "서울 강남구")
 *  · 같은 표기가 두 시/도에 있으면("고성군") 시/도를 붙인 값("강원 고성군"·"경남 고성군")
 *  · 그 시/도 전체를 구독한 값("서울") — 알림함의 구독 칸은 시/도만 고르게 돼 있다. 시/도가 하나로 풀릴 때만.
 */
export function listingRegionKeys(regionName: string): string[] {
  const full = tidy(regionName);
  if (!full || full.length > ALERT_REGION_MAX_CHARS) return [];
  const t = getTables();
  const out = new Set<string>([full]);
  for (const tok of full.match(/[가-힣]+(?:구|시|군)/g) ?? []) out.add(tok);
  const canon = canonicalAlertRegion(full);
  out.add(canon);
  const shared = t.sidosByLabel.get(canon);
  if (shared && shared.size > 1) for (const s of shared) out.add(`${s} ${canon}`);
  const sidos = alertRegionSidos(full);
  if (sidos.length === 1) out.add(sidos[0]!);
  return [...out];
}

/**
 * 구독 값 → 지역 카탈로그 id. **정확 일치만** 본다(이름 · 별칭 · 실거래 표기).
 * lib/region/catalog 의 regionIdForName 은 못 찾으면 "글자가 들어 있는" 첫 항목을 돌려줘서
 * "양주시" → 남양주, "대구 달서구" → 인천 서구 가 됐다. 요약에 다른 동네 숫자를 싣느니 싣지 않는다 → null.
 */
export function alertRegionCatalogId(value: string): string | null {
  const raw = tidy(value);
  if (!raw || raw.length > ALERT_REGION_MAX_CHARS) return null;
  const t = getTables();
  for (const name of [canonicalAlertRegion(raw), raw]) {
    const hit = t.catalogIdByKey.get(normalizeRegionKey(name));
    if (hit) return hit;
  }
  return null;
}
