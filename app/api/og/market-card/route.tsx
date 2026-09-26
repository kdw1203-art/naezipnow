/**
 * GET /api/og/market-card
 * [#60] '오늘의 시장 카드' — 오픈채팅·카페 공유용 자체 갱신 이미지 URL.
 *
 * 다른 OG 라우트(note/complex)는 쿼리로 값을 받지만, 이 카드는 **고정 URL** 이
 * 목적이다(한 번 공유해 두면 이미지가 매일 스스로 갱신). 그래서 데이터는 쿼리가
 * 아니라 서버가 직접 읽는다:
 *   - 지역 스냅샷(REB/KB): 매매지수 전월 변동 상승·하락 1위
 *   - 청약 캘린더(청약홈): 오늘/이번 주 접수 마감 건수
 * 어느 소스가 실패하면 그 줄만 빠진다 — 카드가 통째로 죽지 않는다(fail-soft).
 * 수치는 전부 실측 + 기준시점 표기. 전망·권유 문구는 넣지 않는다.
 */
import { ImageResponse } from "next/og";
import { OG_SIZE } from "@/lib/og/theme";
import { OG_FONT_FAMILY, ogFonts } from "@/lib/og/font";
import { getAllRegionSnapshots } from "@/lib/market/store";
import { buildApplyCalendar } from "@/lib/applyhome/calendar";

export const runtime = "nodejs";
/* [1010] 1시간 → 6시간. 다른 OG 카드와 달리 이 카드는 **고정 URL** 이고 서버가 데이터를 직접
   읽는다 — 같은 URL 의 그림이 매일 바뀌는 것이 존재 이유다. 그래서 하루(86,400)로 올리지 않는다:
   카드에 "오늘/이번 주 접수 마감 N건"(청약홈)이 들어 있어 하루 눈금이면 날짜 경계를 넘긴 카드가
   어제 기준을 말한다. 6시간이면 호출은 1/6 로 줄면서 그 줄이 반나절 이상 낡지 않는다.
   `immutable` 금지 — 붙이면 한 번 공유된 카드가 영영 안 바뀐다(lib/og/cache.ts 주석). */
export const revalidate = 21_600;

type CardRow = { icon: string; label: string; value: string; tone: string };

async function buildRows(): Promise<{ rows: CardRow[]; asOf: string }> {
  const rows: CardRow[] = [];

  try {
    const snapshots = await getAllRegionSnapshots();
    const movers = [...snapshots.values()]
      .filter(
        (s) =>
          s.saleChangeMonthly !== undefined && Number.isFinite(s.saleChangeMonthly),
      )
      .sort((a, b) => (b.saleChangeMonthly ?? 0) - (a.saleChangeMonthly ?? 0));
    if (movers.length >= 2) {
      const up = movers[0];
      const down = movers[movers.length - 1];
      if ((up.saleChangeMonthly ?? 0) > 0) {
        rows.push({
          icon: "▲",
          label: `지수 상승 1위 · ${up.regionName}`,
          value: `+${(up.saleChangeMonthly ?? 0).toFixed(2)}%`,
          tone: "#e15b64",
        });
      }
      if ((down.saleChangeMonthly ?? 0) < 0) {
        rows.push({
          icon: "▼",
          label: `지수 하락 1위 · ${down.regionName}`,
          value: `${(down.saleChangeMonthly ?? 0).toFixed(2)}%`,
          tone: "#3182f6",
        });
      }
      if (rows.length === 0) {
        rows.push({
          icon: "―",
          label: `관측 ${movers.length}개 지역 매매지수`,
          value: "전월 대비 보합권",
          tone: "#3a4150",
        });
      }
    }
  } catch {
    /* 스냅샷 실패 — 줄 생략 */
  }

  try {
    const cal = await buildApplyCalendar();
    if (cal.state === "ok") {
      const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
      const week = new Date(Date.now() + 9 * 3600_000 + 6 * 86400_000)
        .toISOString()
        .slice(0, 10);
      const endsToday = cal.days.find((d) => d.date === today)?.ends.length ?? 0;
      const endsWeek = cal.days
        .filter((d) => d.date >= today && d.date <= week)
        .reduce((s, d) => s + d.ends.length, 0);
      if (endsToday > 0) {
        rows.push({
          icon: "⏰",
          label: "오늘 접수 마감 청약",
          value: `${endsToday}건`,
          tone: "#b4571e",
        });
      } else if (endsWeek > 0) {
        rows.push({
          icon: "🗓",
          label: "7일 내 접수 마감 청약",
          value: `${endsWeek}건`,
          tone: "#b4571e",
        });
      }
    }
  } catch {
    /* 청약 실패 — 줄 생략 */
  }

  const kst = new Date(Date.now() + 9 * 3600_000);
  const asOf = `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(
    kst.getUTCDate(),
  ).padStart(2, "0")}`;
  return { rows, asOf };
}

export async function GET() {
  const { rows, asOf } = await buildRows();

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #101726 0%, #1b2a4a 100%)",
          padding: "56px 64px",
          fontFamily: OG_FONT_FAMILY,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: "26px", color: "#8fa3c8", fontWeight: 700 }}>
              오늘의 부동산 시장
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "52px",
                color: "#ffffff",
                fontWeight: 800,
                marginTop: "6px",
              }}
            >
              {asOf} 시장 카드
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "#3182f6",
              color: "#fff",
              fontSize: "28px",
              fontWeight: 800,
              padding: "12px 26px",
              borderRadius: "999px",
            }}
          >
            내집나우
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            marginTop: "48px",
            flexGrow: 1,
          }}
        >
          {rows.length > 0 ? (
            rows.slice(0, 3).map((r) => (
              <div
                key={r.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: "20px",
                  padding: "26px 34px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
                  <div style={{ display: "flex", fontSize: "34px", color: r.tone }}>{r.icon}</div>
                  <div style={{ display: "flex", fontSize: "32px", color: "#dbe4f5", fontWeight: 700 }}>
                    {r.label}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: "40px",
                    color: r.tone,
                    fontWeight: 800,
                  }}
                >
                  {r.value}
                </div>
              </div>
            ))
          ) : (
            <div
              style={{
                display: "flex",
                fontSize: "34px",
                color: "#dbe4f5",
                fontWeight: 700,
                background: "rgba(255,255,255,0.06)",
                borderRadius: "20px",
                padding: "30px 34px",
              }}
            >
              오늘 지표를 불러오지 못했어요 — naezipnow.com 에서 확인하세요
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: "22px", color: "#71829f" }}>
            한국부동산원·KB 공표 통계 · 청약홈 — {asOf} 기준 · 투자 권유 아님
          </div>
          <div style={{ display: "flex", fontSize: "26px", color: "#9db4dd", fontWeight: 700 }}>
            naezipnow.com
          </div>
        </div>
      </div>
    ),
    {
      width: OG_SIZE.width,
      height: OG_SIZE.height,
      ...ogFonts(),
      /* [1007] 고정 URL 카드 — 위 revalidate 의 의도를 CDN 헤더로 확실히 한다.
         [1010] 1시간 → 6시간 + 하루 SWR. 캐시 키는 경로뿐(쿼리를 읽지 않는다)이라 CDN 사본은
         전 세계에 한 벌이고, 이 눈금이 곧 오리진 호출 수다(하루 최대 4회). */
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400",
      },
    },
  );
}
