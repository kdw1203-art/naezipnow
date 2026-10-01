/* [1026d · 검색] 단지 이름 강조에서 지역·조건 낱말 빼기 — 드롭다운(동적 청크) · /search · 지도가 쓴다. */
import type { IntentJson } from "@/app/search/unified-suggest";

/**
 * 단지 이름에서 칠할 말 — 지역·조건으로 쓴 낱말은 뺀다("마포 신축" 에서 "마포" 는 지역이지 이름이 아니다 —
 * 마포프레스티지자이의 "마포" 를 칠하면 이름이 맞은 것처럼 보인다). 이름 검색이면 그대로.
 */
export function nameHighlightQuery(q: string, intent: IntentJson | null | undefined): string {
  if (!intent || intent.mode === "name") return q;
  let rest = ` ${q} `;
  for (const c of [...intent.chips, ...intent.unsupported]) rest = rest.split(c.token.trim()).join(" ");
  const scope = `${intent.scope?.label ?? ""} ${intent.scope?.q ?? ""}`.replace(/\s+/g, "");
  return rest
    .split(/\s+/)
    .filter((t) => t && !(scope && scope.includes(t)))
    .join(" ");
}
