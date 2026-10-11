import { encodingKeyForUrl } from "@/lib/public-data/data-go-kr-keys";
import { kstParts } from "@/lib/format/kst";

/** 서울 강남구 근처 격자 (임장 기본) */
const DEFAULT_GRID = { nx: 61, ny: 126 };

/* [1055] 기상청 발표 시각(02·05·…·23시)은 한국 시간이다 — 예전엔 서버(UTC) 시각으로 골라 늘 9시간 묵은 발표를 받고,
   02~09시(KST)엔 전날 날짜라 전날 예보가 "오늘"로 붙었다. 발표 뒤 10분은 지나야 자료가 나오므로 그 전엔 직전 발표를 쓴다. */
function latestBaseTime(): { baseDate: string; baseTime: string } {
  const p = kstParts(Date.now());
  const year = p?.year ?? new Date().getUTCFullYear();
  const month = p?.month ?? new Date().getUTCMonth() + 1;
  const day = p?.day ?? new Date().getUTCDate();
  const hour = p?.hour ?? new Date().getUTCHours();
  const minute = p?.minute ?? 0;
  const hours = [2, 5, 8, 11, 14, 17, 20, 23];
  let h: number | null = null;
  for (const bh of hours) {
    if (hour > bh || (hour === bh && minute >= 10)) h = bh;
  }
  let d = new Date(Date.UTC(year, month - 1, day));
  if (h === null) {
    h = 23;
    d = new Date(d.getTime() - 86_400_000);
  }
  return {
    baseDate: `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`,
    baseTime: `${String(h).padStart(2, "0")}00`,
  };
}

const SKY: Record<string, string> = { "1": "맑음", "3": "구름많음", "4": "흐림" };

export type WeatherDay = {
  date: string;
  sky: string;
  tempMin?: number;
  tempMax?: number;
  pop?: number;
};

export async function fetchKmaShortForecast(): Promise<{
  items: WeatherDay[];
  mode: "live" | "mock";
}> {
  const key = encodingKeyForUrl();
  if (!key) return { items: [], mode: "mock" };

  const { baseDate, baseTime } = latestBaseTime();
  const url = new URL(
    "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst",
  );
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "300");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(DEFAULT_GRID.nx));
  url.searchParams.set("ny", String(DEFAULT_GRID.ny));

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 1800 } });
    const json = (await res.json()) as {
      response?: { body?: { items?: { item?: Array<Record<string, string>> } } };
    };
    const raw = json.response?.body?.items?.item ?? [];
    if (!Array.isArray(raw) || raw.length === 0) return { items: [], mode: "mock" };

    const byDate = new Map<string, WeatherDay>();
    for (const row of raw) {
      const fcstDate = row.fcstDate ?? "";
      const cat = row.category ?? "";
      const val = row.fcstValue ?? "";
      if (!fcstDate) continue;
      const cur = byDate.get(fcstDate) ?? { date: fcstDate, sky: "—" };
      if (cat === "SKY") cur.sky = SKY[val] ?? val;
      if (cat === "TMN") cur.tempMin = Number(val);
      if (cat === "TMX") cur.tempMax = Number(val);
      if (cat === "POP") cur.pop = Number(val);
      byDate.set(fcstDate, cur);
    }

    const items = [...byDate.values()]
      .slice(0, 3)
      .map((d) => ({
        ...d,
        date:
          d.date === baseDate
            ? "오늘"
            : d.date.slice(4, 6) + "/" + d.date.slice(6, 8),
      }));

    if (items.length > 0) return { items, mode: "live" };
  } catch {
    // fall through
  }
  return { items: [], mode: "mock" };
}
