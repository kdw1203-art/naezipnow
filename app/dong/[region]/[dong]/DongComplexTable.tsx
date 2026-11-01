"use client";

/* [1092 · 비용] 동 화면 단지 표 — 서버는 압축 행(DongComplexWire)만 넘기고 표는 여기서 그린다.
   왜: 서버 컴포넌트로 그린 표는 HTML 과 RSC(인라인 + .rsc) 양쪽에 **원소 트리 그대로** 실린다 — 운영 실측 상계동 113줄:
   HTML 124KB · RSC 163KB(줄마다 1.4KB · 200B 짜리 단지 주소가 HTML · RSC 두 벌). 클라이언트 컴포넌트는 RSC 에 props 만
   실리므로 줄당 100B 안팎이다. 첫 화면 HTML(SSR)은 그대로 — 크롤러 · JS 없는 환경이 보는 표는 같다.
   표기(toLocaleString · formatKrwShort)는 서버와 같은 함수라 수화(hydration) 불일치가 없다. 주소는 lib/seo/complex-slug
   (complex-store 의 encodeComplexId 와 같은 base64url · 클라이언트 안전)로 만든다. */
import Link from "@/app/components/IntentLink";
import { HScroll } from "@/app/components/HScroll";
import { complexHrefFromNames } from "@/lib/seo/complex-slug";
import { formatKrwShort } from "@/lib/market/format";

/** [이름, 준공|null, 세대|null, 6개월 건수, 전 기간 건수, 거래 평균(만원)|null, 평균 전용㎡|null, 지역(화면 지역과 다를 때만)] */
export type DongComplexWire = [string, number | null, number | null, number, number, number | null, number | null, string?];

const n = (v: number) => v.toLocaleString("ko-KR");

function Row({ region, w }: { region: string; w: DongComplexWire }) {
  const [name, buildYear, households, recent, total, avgManwon, avgArea, rowRegion] = w;
  return (
    <tr className="border-b border-border last:border-b-0">
      {/* [1092] 고정 열은 폰 화면의 46% 까지 — 긴 이름은 두 줄(break-keep) · 구간 화면 표와 같은 규칙(폭 제한은 링크에 — 표 셀의 max-width 는 무시된다) */}
      <td className="py-2.5 pr-3 font-bold text-ink">
        <Link href={complexHrefFromNames(rowRegion ?? region, name)} className="tap-line inline-block max-w-[46vw] whitespace-normal break-keep text-primary no-underline md:max-w-none">
          {name}
        </Link>
      </td>
      <td className="py-2.5 pl-3 text-right tabular-nums text-text-2">{buildYear ?? "—"}</td>
      <td className="py-2.5 pl-3 text-right tabular-nums text-text-2">{households ? n(households) : "—"}</td>
      <td className="py-2.5 pl-3 text-right t-num font-bold text-ink">{n(recent)}건</td>
      <td className="py-2.5 pl-3 text-right tabular-nums text-text-2">{n(total)}건</td>
      <td className="py-2.5 pl-3 text-right tabular-nums text-text-2">{avgManwon ? formatKrwShort(avgManwon * 10_000) : "—"}</td>
      <td className="py-2.5 pl-3 text-right tabular-nums text-text-2">{avgArea ? `${Math.round(avgArea)}㎡` : "—"}</td>
    </tr>
  );
}

export function DongComplexTable({ region, rows, rest }: { region: string; rows: DongComplexWire[]; rest: DongComplexWire[] }) {
  return (
    <>
      <div data-tone="blue">
        {/* [1091] 단지 이름 열 고정 — 폰에서 7열 표를 옆으로 밀면 어느 단지의 숫자인지 보이지 않았다(운영 실측 개포동) */}
        <HScroll className="lq-panel mt-3 max-md:mt-2" stickyFirst>
          <table className="w-full whitespace-nowrap text-left t-body">
            <thead>
              <tr className="border-b border-border t-sub text-text-3">
                <th className="py-2 font-medium">단지</th>
                <th className="py-2 pl-3 text-right font-medium">준공</th>
                <th className="py-2 pl-3 text-right font-medium">세대</th>
                <th className="py-2 pl-3 text-right font-medium">6개월</th>
                <th className="py-2 pl-3 text-right font-medium">전 기간</th>
                <th className="py-2 pl-3 text-right font-medium">거래 평균</th>
                <th className="py-2 pl-3 text-right font-medium">평균 면적</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <Row key={w[0]} region={region} w={w} />
              ))}
            </tbody>
          </table>
        </HScroll>
      </div>
      {rest.length > 0 && (
        /* 나머지 — 네이티브 details(JS 0) · 같은 표 모양 */
        <details className="mt-2">
          <summary className="cursor-pointer t-sub font-bold text-primary">나머지 {n(rest.length)}곳 보기</summary>
          <div data-tone="blue">
            <HScroll className="lq-panel mt-2" stickyFirst>
              <table className="w-full whitespace-nowrap text-left t-body">
                <tbody>
                  {rest.map((w) => (
                    <Row key={w[0]} region={region} w={w} />
                  ))}
                </tbody>
              </table>
            </HScroll>
          </div>
        </details>
      )}
    </>
  );
}
