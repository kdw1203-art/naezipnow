"use client";

import { useState } from "react";

/* [#71] 직접 방문 인증(선택) — 현재 위치와 단지 좌표의 거리로 확인.
   프라이버시 설계: 사용자의 원 좌표는 **어디에도 저장·전송하지 않는다**. 브라우저 안에서
   거리만 계산해 50m 단위 버킷과 시각만 metadata 에 남긴다. 동의는 이 버튼을 직접 누르는
   행위 그 자체(눌러야만 위치 권한 요청).
   [1006] NoteForm 에서 분리해 next/dynamic 으로 — 단지 좌표가 잡힌 뒤에만 그려지는 카드라
   첫 로드에 있을 이유가 없다(~2.4KB). 인증 결과(visitVerified)는 저장 페이로드 재료라
   NoteForm 상태로 올려 보낸다; 진행 상태(묻는 중·멀다·거부)는 여기서만 쓴다. */

export type VisitVerified = { method: "geo"; distanceM: number; at: string };

export function VisitVerifyCard({
  lat,
  lng,
  verified,
  onVerified,
}: {
  lat: number;
  lng: number;
  verified: VisitVerified | null;
  onVerified: (v: VisitVerified | null) => void;
}) {
  const [state, setState] = useState<"idle" | "asking" | "far" | "denied" | "unsupported">("idle");
  const [farKm, setFarKm] = useState<number | null>(null);

  const run = () => {
    if (!("geolocation" in navigator)) {
      setState("unsupported");
      return;
    }
    setState("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const toRad = (d: number) => (d * Math.PI) / 180;
        const R = 6371000;
        const dLat = toRad(pos.coords.latitude - lat);
        const dLng = toRad(pos.coords.longitude - lng);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(lat)) * Math.cos(toRad(pos.coords.latitude)) * Math.sin(dLng / 2) ** 2;
        const dist = 2 * R * Math.asin(Math.sqrt(a));
        if (dist <= 2000) {
          onVerified({
            method: "geo",
            distanceM: Math.max(50, Math.round(dist / 50) * 50), // 50m 버킷 — 정밀 위치 비저장
            at: new Date().toISOString(),
          });
          setState("idle");
        } else {
          onVerified(null);
          setFarKm(Math.round(dist / 100) / 10);
          setState("far");
        }
      },
      () => setState("denied"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  return (
    <div className="rise-in-2 flex flex-col gap-1.5 rounded-[14px] border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="t-body font-extrabold text-ink">
          직접 방문 인증 <span className="font-medium text-text-3">(선택)</span>
        </div>
        {verified ? (
          <span className="rounded-md bg-success-soft px-2 py-1 t-sub font-extrabold text-success">
            ✓ 현장 인증됨 · 단지 반경{" "}
            {verified.distanceM >= 1000
              ? `${(verified.distanceM / 1000).toFixed(1)}km`
              : `${verified.distanceM}m`}
          </span>
        ) : (
          <button
            type="button"
            onClick={run}
            disabled={state === "asking"}
            className="rounded-[10px] border border-line-strong bg-bg px-3 py-1.5 t-sub font-bold text-text-1 disabled:opacity-60"
          >
            {state === "asking" ? "위치 확인 중…" : "현재 위치로 인증하기"}
          </button>
        )}
      </div>
      <p className="t-sub text-text-3">
        지금 단지 근처(2km 이내)에 있다면 노트에 &lsquo;현장 인증&rsquo; 배지가 붙어요. 버튼을 누를
        때 한 번만 위치를 확인하며, 내 위치 좌표는 저장하지도 전송하지도 않습니다 — 거리
        구간(50m 단위)만 남아요.
      </p>
      {state === "far" && (
        <p className="t-sub font-bold text-warning">
          단지에서 약 {farKm}km 떨어져 있어 인증되지 않았어요. 현장에서 다시 시도해 주세요.
        </p>
      )}
      {state === "denied" && (
        <p className="t-sub font-bold text-text-3">
          위치 권한이 거부돼 인증을 건너뛰어요 — 인증 없이도 노트는 그대로 저장돼요.
        </p>
      )}
      {state === "unsupported" && (
        <p className="t-sub font-bold text-text-3">이 브라우저는 위치 확인을 지원하지 않아요.</p>
      )}
    </div>
  );
}
