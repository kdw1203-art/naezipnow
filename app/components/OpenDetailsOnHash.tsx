"use client";

/* [1096 · 고도화] 주소의 #id 가 접힌 <details> 를 가리키면 펼친다 — 비교 허브의 지역 칩(63개 · href="#region-…")은 첫 지역만 펼친
   목록으로 옮겨 가는데, 닿은 지역이 접혀 있어 한 번 더 눌러야 했다(1030 구성 · 로컬 실측). 처음 열 때와 해시가 바뀔 때 한 번씩 ·
   details 가 아니면 아무것도 하지 않는다. 마크업 없음(null). */
import { useEffect } from "react";

function openHashDetails() {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id) return;
  const el = document.getElementById(id);
  if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
}

export function OpenDetailsOnHash() {
  useEffect(() => {
    openHashDetails();
    window.addEventListener("hashchange", openHashDetails);
    return () => window.removeEventListener("hashchange", openHashDetails);
  }, []);
  return null;
}

export default OpenDetailsOnHash;
