/* [1185 · 같은 사실 한 번] 공매 물건 이름 끝의 용도 — 용도 칸이 바로 옆에서 같은 말을 한다.
   운영 실측(2026-11-15): "… B102호 외 7개호 [근린생활시설]" + 용도 "근린생활시설", "… 308-1호 근린생활시설" + 용도 "근린생활시설".
   용도 칸과 같은 말일 때만 뗀다(다른 말은 그대로) · 떼고 남는 이름이 너무 짧으면 그대로 둔다. */
export function auctionDisplayName(name: string | null | undefined, usage: string | null | undefined): string {
  const raw = String(name ?? "").trim();
  const u = String(usage ?? "").trim();
  if (!raw || !u) return raw;
  let n = raw;
  const br = /\s*\[([^\]]*)\]\s*$/.exec(n);
  if (br && br[1].trim().replace(/\s*등$/, "") === u) n = n.slice(0, br.index).trim();
  if (n.endsWith(` ${u}`)) n = n.slice(0, -u.length).trim();
  return n.length >= 4 ? n : raw;
}
