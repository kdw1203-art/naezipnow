/**
 * GET /api/og/invite?by=
 * 친구 초대 공유용 동적 OG 카드 (1200×630, next/og ImageResponse).
 * - by: 추천인 마스킹 라벨(예: "ab***@gmail.com"). 없으면 "친구의 초대".
 * - 카카오/링크 공유 미리보기 CTR 향상 (A4). 쿼리는 절단 후 텍스트로만 렌더(XSS 안전).
 * - 폰트/사이즈는 공용 og 테마 재사용. 커스텀 이미지·외부 폰트 로드 없음.
 */
import { ImageResponse } from "next/og";
import { OG_STATIC_CACHE_CONTROL } from "@/lib/og/cache";
import { NextRequest } from "next/server";
import { OG_SIZE } from "@/lib/og/theme";
import { OG_FONT_FAMILY, ogFonts } from "@/lib/og/font";

export const runtime = "nodejs";

function q(req: NextRequest, key: string, fallback: string): string {
  const raw = req.nextUrl.searchParams.get(key);
  const v = (raw ?? "").trim();
  return (v.length > 0 ? v : fallback).slice(0, 48);
}

export async function GET(req: NextRequest) {
  const by = q(req, "by", "친구의 초대");

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f9fc",
          fontFamily: OG_FONT_FAMILY,
          position: "relative",
          overflow: "hidden",
          padding: "56px 72px",
        }}
      >
        {/* 좌상단 파란 radial 블롭 */}
        <div
          style={{
            position: "absolute",
            top: "-220px",
            left: "-180px",
            width: "600px",
            height: "600px",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle at center, rgba(29,79,216,0.18) 0%, rgba(29,79,216,0.06) 45%, rgba(29,79,216,0) 70%)",
            display: "flex",
          }}
        />
        {/* 우하단 블롭 */}
        <div
          style={{
            position: "absolute",
            bottom: "-240px",
            right: "-160px",
            width: "560px",
            height: "560px",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle at center, rgba(29,79,216,0.14) 0%, rgba(29,79,216,0) 70%)",
            display: "flex",
          }}
        />

        <div
          style={{
            width: "100%",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            background: "#ffffff",
            borderRadius: "32px",
            border: "1px solid rgba(17,24,39,0.08)",
            boxShadow: "0 24px 60px rgba(17,24,39,0.10)",
            padding: "60px 64px",
          }}
        >
          {/* 추천인 칩 */}
          <div style={{ display: "flex" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "#eaf0ff",
                color: "#1d4fd8",
                fontSize: "28px",
                fontWeight: 800,
                padding: "10px 22px",
                borderRadius: "9999px",
              }}
            >
              {by} 님이 초대했어요
            </div>
          </div>

          {/* 헤드라인 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: "28px",
              fontSize: "76px",
              lineHeight: 1.15,
              fontWeight: 800,
              color: "#191f28",
            }}
          >
            <span style={{ display: "flex" }}>가입하면</span>
            <span style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ display: "flex" }}>둘 다&nbsp;</span>
              <span style={{ display: "flex", color: "#1d4fd8" }}>300P</span>
            </span>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "24px",
              fontSize: "30px",
              color: "#4a5262",
              fontWeight: 500,
            }}
          >
            실거래가·시세 열람 · AI 임장 분석 · 부동산 커뮤니티
          </div>

          {/* 하단 브랜드 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: "44px",
              gap: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "56px",
                height: "56px",
                borderRadius: "16px",
                background: "linear-gradient(135deg, #3182f6 0%, #1d4ed8 100%)",
                color: "#ffffff",
                fontSize: "30px",
                fontWeight: 800,
              }}
            >
              누
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "30px",
                fontWeight: 800,
                color: "#191f28",
              }}
            >
              내집나우
            </div>
            <div style={{ display: "flex", fontSize: "24px", color: "#8a93a3" }}>
              시세는 누구나 봅니다, 현장은 가 본 사람만 압니다 · naezipnow.com
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: OG_SIZE.width,
      height: OG_SIZE.height,
      ...ogFonts(),
      /* [1007] app/api/og/complex 와 같은 이유 */
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
