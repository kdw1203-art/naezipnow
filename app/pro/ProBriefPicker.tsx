"use client";

/* [1025 · 브리핑] /pro 첫 칸 — 단지 검색(ComplexPicker 재사용) → 고르면 그 단지의 브리핑 리포트(/complex/[id]/brief)로 간다.
   URL 딥링크(?complexId=)는 읽지 않는다(initialComplexId·initialApt null) — /pro 는 검색 화면이 아니다. */
import { useRouter } from "next/navigation";
import { ComplexPicker } from "@/app/analysis/ComplexPicker";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { briefPathFromComplexPath } from "@/lib/brief/model";

export function ProBriefPicker() {
  const router = useRouter();
  return (
    <ComplexPicker
      label="단지 검색"
      placeholder="단지명"
      showChip={false}
      initialComplexId={null}
      initialApt={null}
      onMapClick={null}
      onSelect={(c) => {
        router.push(briefPathFromComplexPath(complexHrefFromId(c.id)));
      }}
    />
  );
}

export default ProBriefPicker;
