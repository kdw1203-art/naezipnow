/**
 * GET /api/og/complex?name=&price=&delta=&region=&bands=
 * 단지 허브 공유용 동적 OG 카드 (1200×630, next/og ImageResponse).
 * - 리퀴드 글래스 무드: #f7f9fc 배경 + 좌상단 파란 radial 블롭
 * - 좌: 내집나우 로고 텍스트 + 단지명 + 지역 / 우: 가격 + 전월비 delta
 * - 폰트: 시스템 기본만 사용 (커스텀 폰트 로드 금지 — 컨테이너·엣지 이슈 회피)
 * - 쿼리 값은 60자 절단 후 JSX 텍스트로만 렌더 (XSS 안전)
 */
import { ImageResponse } from "next/og";
import { OG_STATIC_CACHE_CONTROL } from "@/lib/og/cache";
import { NextRequest } from "next/server";
import { OG_SIZE } from "@/lib/og/theme";
import { OG_FONT_FAMILY, ogFonts } from "@/lib/og/font";

/** 쿼리 값 정규화 — 60자 절단 + 공백 정리 */
function q(req: NextRequest, key: string, fallback: string): string {
  const raw = req.nextUrl.searchParams.get(key);
  const v = (raw ?? "").trim();
  return (v.length > 0 ? v : fallback).slice(0, 60);
}

/** 시세 관례: 하락=blue, 상승=red (globals.css delta-down/delta-up 동일) */
function deltaColor(delta: string): string {
  if (/[▼↓-]|하락/.test(delta)) return "#1d4fd8"; // down → blue
  if (/[▲↑+]|상승/.test(delta)) return "#c62828"; // up → red
  return "#7b8494"; // flat
}

export async function GET(req: NextRequest) {
  const name = q(req, "name", "공작아파트");
  const price = q(req, "price", "4.9억");
  const delta = q(req, "delta", "");
  const region = q(req, "region", "안양 동안구 관양동");
  /* [997] 평형별 최근가 칩 — `bands=60~85㎡ 33.5억|~59㎡ 16.1억`(최대 3개, 각 24자). 없으면 그리지 않는다. */
  const bands = (req.nextUrl.searchParams.get("bands") ?? "")
    .split("|")
    .map((b) => b.trim().slice(0, 24))
    .filter(Boolean)
    .slice(0, 3);

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          background: "#f7f9fc",
          fontFamily: OG_FONT_FAMILY,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* 좌상단 파란 radial 블롭 (리퀴드 글래스 무드) */}
        <div
          style={{
            position: "absolute",
            top: "-220px",
            left: "-180px",
            width: "620px",
            height: "620px",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle at center, rgba(29,79,216,0.22) 0%, rgba(29,79,216,0.08) 45%, rgba(29,79,216,0) 70%)",
            display: "flex",
          }}
        />
        {/* 우하단 보조 블롭 — 은은한 균형 */}
        <div
          style={{
            position: "absolute",
            bottom: "-260px",
            right: "-200px",
            width: "560px",
            height: "560px",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle at center, rgba(29,79,216,0.10) 0%, rgba(29,79,216,0) 65%)",
            display: "flex",
          }}
        />

        {/* 본문 */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 84px",
            gap: "48px",
          }}
        >
          {/* 좌측: 로고 + 단지명 + 지역 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "18px",
              maxWidth: "640px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "13px",
                  background: "#1d4fd8",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                  fontWeight: 800,
                }}
              >
                집
              </div>
              <div
                style={{
                  fontSize: "30px",
                  fontWeight: 800,
                  color: "#1d4fd8",
                  display: "flex",
                }}
              >
                내집나우
              </div>
            </div>
            <div
              style={{
                fontSize: "48px",
                fontWeight: 800,
                color: "#111827",
                lineHeight: 1.25,
                display: "flex",
                wordBreak: "break-all",
              }}
            >
              {name}
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 600,
                color: "#5b6472",
                display: "flex",
              }}
            >
              {region}
            </div>
            {bands.length > 0 && (
              <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                {bands.map((b) => (
                  <div
                    key={b}
                    style={{
                      display: "flex",
                      padding: "8px 14px",
                      borderRadius: "999px",
                      background: "rgba(29,79,216,0.08)",
                      border: "1px solid rgba(29,79,216,0.16)",
                      color: "#1d4fd8",
                      fontSize: "22px",
                      fontWeight: 700,
                    }}
                  >
                    {b}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 우측: 가격 카드 (글래스 카드) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "10px",
              padding: "40px 48px",
              borderRadius: "28px",
              background: "rgba(255,255,255,0.72)",
              border: "1px solid rgba(29,79,216,0.12)",
              boxShadow: "0 24px 60px rgba(29,79,216,0.10)",
            }}
          >
            <div
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "#7b8494",
                display: "flex",
              }}
            >
              최근 실거래
            </div>
            <div
              style={{
                fontSize: "72px",
                fontWeight: 800,
                color: "#111827",
                lineHeight: 1.1,
                display: "flex",
              }}
            >
              {price}
            </div>
            {delta && (
              <div
                style={{
                  fontSize: "28px",
                  fontWeight: 800,
                  color: deltaColor(delta),
                  display: "flex",
                }}
              >
                {delta}
              </div>
            )}
          </div>
        </div>

        {/* 하단 캡션 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 84px 44px",
            fontSize: "22px",
            fontWeight: 600,
            color: "#7b8494",
          }}
        >
          시세는 누구나 봅니다, 현장은 가 본 사람만 압니다 · naezipnow.com
        </div>
      </div>
    ),
    {
      width: OG_SIZE.width,
      height: OG_SIZE.height,
      ...ogFonts(),
      /* [1007] CDN 캐시 — 하루 1,008회 함수 호출(24h 실측)인데 응답에 Cache-Control 이 없어
         미들웨어가 no-store 를 붙였고 같은 카드가 봇마다 다시 그려졌다. URL 에 단지명·가격·
         지역·평형 칩이 전부 들어 있어 값이 바뀌면 URL 도 바뀐다 → 하루 캐시 + 7일 SWR 은
         app/api/og/route.tsx 와 같은 값. next/og 는 ImageResponse 두 번째 인자 headers 로 싣는다. */
      headers: {
              /* [1010] 캐시 키는 **경로 + 쿼리스트링 전체**다(Vercel CDN 기본). 이 라우트의 그림은
         쿼리 값만으로 결정되므로 URL 이 곧 내용이고, 값이 바뀌면 메타데이터가 만드는 URL 도
         같이 바뀐다 → 같은 URL 이 다른 그림을 낼 일이 없다. 그래서 하루(86,400) 대신 7일 +
         `immutable`(브라우저가 신선한 동안 재검증조차 하지 않는다)로 올린다.
         `export const revalidate` 는 쓰지 않는다 — searchParams 를 읽는 동적 라우트 핸들러에서는
         효력이 없고(Next 15: GET 핸들러 기본 비캐시), CDN 이 실제로 보는 것은 이 헤더뿐이다
         (app/api/og/complex-trend/route.tsx [1007] 주석의 같은 실측). */
      "Cache-Control": OG_STATIC_CACHE_CONTROL,
      },
    },
  );
}
