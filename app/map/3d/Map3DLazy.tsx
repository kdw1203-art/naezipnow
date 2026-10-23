"use client";

import nextDynamic from "next/dynamic";

/* [1086] 3D 지도 본체는 따로 받는 청크 — maplibre-gl(약 250KB 압축)이 이 화면 밖으로 새지 않게 */
const Map3DClient = nextDynamic(() => import("./Map3DClient").then((m) => m.Map3DClient), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-bg" role="status">
      <span className="t-sub text-text-3">3D 지도 불러오는 중</span>
    </div>
  ),
});

export function Map3DLazy() {
  return <Map3DClient />;
}
