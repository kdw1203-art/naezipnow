"use client";

/* [1096 · 비용] 비교 허브(/complex/compare)의 조합 타일(1,119개) — 서버는 압축 행만 넘기고 타일은 여기서 그린다.
   왜: 서버 컴포넌트로 그린 타일은 HTML 과 RSC 양쪽에 원소 트리로 실려 허브 한 장이 1,842KB(마크업 696KB · RSC 1,010KB)였다 —
   타일마다 주소(퍼센트 인코딩 162B)가 key · href · HTML 세 번, 이름이 네 번 실렸다(로컬 실측 2026-10-31). 이 허브는 적재 크론이
   끝날 때마다 비워져(revalidatePath) 하루 한 번 다시 저장된다 — 사이트에서 가장 큰 ISR 쓰기였다.
   클라이언트 조각은 RSC 에 props(조합당 80B 안팎)만 싣고 주소는 이름·지역에서 만든다(buildComplexPairSlug · 비교 화면과 같은 규칙).
   첫 화면 HTML(SSR) · 링크 · 색인은 그대로(TxRegionGroups · DongComplexTable 과 같은 방식). 지역 칩 · details · 지역 화면 링크는
   서버(page.tsx)에 그대로 — 63개뿐이라 작다. */
import Link from "@/app/components/IntentLink";
import { buildComplexPairSlug } from "@/lib/market/complex-pair-slug";

/** [단지 A, 단지 B, 동, A 12개월 건수, B 12개월 건수] */
export type ComparePairWire = [string, string, string, number, number];

const n = (v: number) => v.toLocaleString("ko-KR");

/* [1119 · 맞대결 줄] 소유자 "다른 페이지도 검토" — 조합 타일(두 단지 이름 + 건수 글자) → 맞대결 줄(아실 단지 비교 · 스포츠 매치업 꼴):
   왼쪽 단지 | vs | 오른쪽 단지, 아래 한 줄 막대 = 두 단지 12개월 거래 건수 몫(왼쪽 파랑 · 오른쪽 회색) + 양끝 건수 · 가운데 동.
   한 지역 조합이 많으면(평택 48개) 앞 10개만 펼치고 나머지는 닫힌 접힘 — 링크는 HTML 에 그대로(색인 동일). */
function Row({ regionId, p }: { regionId: string; p: ComparePairWire }) {
  const [a, b, dong, txA, txB] = p;
  const slug = buildComplexPairSlug(a, b, regionId);
  const share = txA + txB > 0 ? Math.round((txA / (txA + txB)) * 100) : 50;
  return (
    <Link href={`/complex/compare/${slug}`} className="tile block rounded-lg border border-border px-3 py-2.5 no-underline">
      {/* [1005] keep-all — 띄어쓰기 없는 긴 단지명은 넘칠 때만 꺾는다(overflow-wrap) */}
      <span className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <span className="break-words text-right t-body font-bold text-ink">{a}</span>
        <span className="rounded-full bg-bg px-1.5 py-0.5 t-caption font-bold text-text-3">vs</span>
        <span className="break-words t-body font-bold text-ink">{b}</span>
      </span>
      <span className="mt-1.5 flex items-center gap-2 t-caption t-num text-text-3">
        <span className="w-10 shrink-0 text-right">{n(txA)}건</span>
        <span className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-divider" aria-hidden="true">
          <span className="block h-full bg-primary" style={{ width: `${share}%` }} />
        </span>
        <span className="w-10 shrink-0">{n(txB)}건</span>
      </span>
      <span className="mt-0.5 block text-center t-caption text-text-3">{dong} · 12개월 매매</span>
    </Link>
  );
}

const SHOWN = 10;

export function ComparePairTiles({ regionId, pairs }: { regionId: string; pairs: ComparePairWire[] }) {
  const head = pairs.slice(0, SHOWN);
  const rest = pairs.slice(SHOWN);
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {head.map((p) => (
          <Row key={`${p[0]}|${p[1]}`} regionId={regionId} p={p} />
        ))}
      </div>
      {rest.length > 0 && (
        <details className="group/more">
          <summary className="tap-line flex min-h-10 cursor-pointer list-none items-center justify-center rounded-lg border border-line t-sub font-bold text-text-2 hover:bg-bg">
            <span className="group-open/more:hidden">조합 {rest.length}개 더 보기</span>
            <span className="hidden group-open/more:inline">접기</span>
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {rest.map((p) => (
              <Row key={`${p[0]}|${p[1]}`} regionId={regionId} p={p} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
