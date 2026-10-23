import type { Metadata } from "next";
/* 지도 엔진 CSS 는 이 화면의 정적 CSS 로 — 지연 청크(Map3DClient)에서 import 하면 webpack 런타임에 CSS 지연 로더(약 1.3KB)가 붙어
   모든 화면 첫 로드가 늘었다(1086 빌드 실측: 번들 예산 초과 원인) */
import "maplibre-gl/dist/maplibre-gl.css";
import { Map3DLazy } from "./Map3DLazy";

/* [1086 · 서울 3D] 동네 단위 3D 지도 — /map/3d?region=서울 강남구&dong=개포동(&focus=단지 화면 주소).
   화면은 정적 껍데기(주소의 지역·동은 브라우저가 읽는다) · 지도 엔진(MapLibre)·건물 타일은 이 화면에서만 받는다(다른 화면 첫 로드 무관).
   색인하지 않는다(같은 내용의 동 페이지 /dong/<지역>/<동> 이 색인 대상) · 광고 없음(/map 제외 경로). */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "3D 동네 지도 — 서울 아파트 단지 · 역 · 학교 | 내집나우",
  description:
    "서울 동네를 3D 로 — 건물 높이(OpenStreetMap)와 아파트 단지(국토교통부 실거래 집계 · 평당 평균 단계), 역·학교 이름표를 한 화면에. 동 단위로 열고 단지를 누르면 단지 화면으로 이어진다.",
  robots: { index: false, follow: true },
};

export default function Map3DPage() {
  return (
    <>
      <h1 className="sr-only">3D 동네 지도</h1>
      <Map3DLazy />
    </>
  );
}
