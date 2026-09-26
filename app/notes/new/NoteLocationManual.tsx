"use client";

import { useState } from "react";
import { MANUAL_LOCATION_MAX, validateManualLocation } from "@/lib/notes/note-form-utils";
import type { NoteLocation } from "./NoteLocationSearch";

/* [1005 · A1] 위치 직접 입력 칸 — NoteLocationSearch 가 next/dynamic 으로 부른다.
   검색 결과 0건·검색 실패·"직접 입력" 링크 뒤에만 보이는 화면이라 /notes/new 첫 로드
   (예산 470KB, 실측 469KB)에 넣지 않는다. 입력값(지역·단지명)은 부모가 든다 —
   드롭다운을 닫았다 열어도 적던 것이 남게. 검증·오류만 여기서 한다. */

export function NoteLocationManual({
  region,
  apt,
  onRegion,
  onApt,
  onCommit,
}: {
  region: string;
  apt: string;
  onRegion: (v: string) => void;
  onApt: (v: string) => void;
  onCommit: (loc: NoteLocation) => void;
}) {
  const [error, setError] = useState<{ field: "region" | "aptName"; error: string } | null>(null);

  const commit = () => {
    const r = validateManualLocation(region, apt);
    if (!r.ok) {
      setError({ field: r.field, error: r.error });
      return;
    }
    setError(null);
    onCommit({ aptName: r.aptName, region: r.region, complexId: null, lat: null, lng: null });
  };

  const inputCls = (bad: boolean) =>
    `min-h-10 w-full rounded-lg border bg-bg px-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary ${
      bad ? "border-danger" : "border-line"
    }`;

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="t-sub font-bold text-ink">직접 입력</span>
        <span className="t-caption text-text-3">지도·브리핑은 검색으로 고른 단지에만 붙어요</span>
      </div>
      <input
        type="text"
        value={region}
        maxLength={MANUAL_LOCATION_MAX}
        onChange={(e) => {
          onRegion(e.target.value);
          if (error?.field === "region") setError(null);
        }}
        aria-label="지역 (시·군·구)"
        aria-invalid={error?.field === "region" || undefined}
        placeholder="지역 — 예: 서울 강남구"
        enterKeyHint="next"
        className={inputCls(error?.field === "region")}
      />
      <input
        type="text"
        value={apt}
        maxLength={MANUAL_LOCATION_MAX}
        onChange={(e) => {
          onApt(e.target.value);
          if (error?.field === "aptName") setError(null);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        aria-label="단지명"
        aria-invalid={error?.field === "aptName" || undefined}
        placeholder="단지명 — 예: 은마아파트"
        enterKeyHint="done"
        className={inputCls(error?.field === "aptName")}
      />
      {error ? (
        <p role="alert" className="t-caption font-semibold text-danger">
          {error.error}
        </p>
      ) : null}
      <button type="button" onClick={commit} className="btn-primary btn-md w-full">
        이 위치로
      </button>
    </div>
  );
}
