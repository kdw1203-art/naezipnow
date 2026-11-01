"use client";

/* [1096 · 고도화 · 비용] 동별 실거래 허브(/dong)의 지역 줄(192곳) — 시/도별 details 로 묶고, 서버는 압축 행만 넘긴다.
   왜 둘 다인가:
   · 구성 — 192줄이 거래 많은 순 한 줄 목록이라 "서울 강남구"를 찾으려면 끝까지 훑어야 했다(로컬 실측 · 폰 24화면). /tx 허브(1092)와 같은
     시/도 묶음(첫 묶음만 펼침). 시/도는 실거래 표기 전수 해석(lib/market/sido-group sidoOfMarketRegionName) — 192곳 전부 묶인다.
   · 비용 — 서버 컴포넌트로 그린 줄은 HTML 과 RSC 양쪽에 원소 트리로 실려 허브 한 장이 420KB(마크업 168KB · RSC 212KB)였다.
     클라이언트 조각은 RSC 에 props(지역당 60B 안팎)만 싣는다(TxRegionGroups · DongComplexTable 과 같은 방식). 첫 화면 HTML(SSR) ·
     링크 · 색인은 그대로. */
import Link from "@/app/components/IntentLink";
import { dongPath } from "@/lib/dong/format";

/** [지역 슬러그, 지역 이름, 동 수, 최근 6개월 매매 신고, 거래 많은 동, 그 동의 건수] */
export type DongHubRegionWire = [string, string, number, number, string, number];
/** [시/도, 지역들] */
export type DongHubSidoWire = [string, DongHubRegionWire[]];

const n = (v: number) => v.toLocaleString("ko-KR");

export function DongHubGroups({ groups }: { groups: DongHubSidoWire[] }) {
  return (
    <div className="flex flex-col gap-2">
      {groups.map(([sido, rows], gi) => {
        const dongs = rows.reduce((s, r) => s + r[2], 0);
        const total = rows.reduce((s, r) => s + r[3], 0);
        return (
          <details key={sido} open={gi === 0} className="group rounded-lg border border-border bg-surface">
            <summary className="flex min-h-10 cursor-pointer list-none items-baseline justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
              <span className="t-body font-bold text-ink">
                {sido} <span className="t-sub font-medium text-text-3">{rows.length}개 지역 · 동 {n(dongs)}곳</span>
              </span>
              <span className="shrink-0 t-sub tabular-nums text-text-3">
                {n(total)}건{" "}
                {/* dead-control-ok: 네이티브 details 의 펼침 표식(회전) — TxRegionGroups 와 같다(summary 가 컨트롤) */}
                <span aria-hidden className="ml-1 inline-block transition-transform group-open:rotate-180">▾</span>
              </span>
            </summary>
            {/* 행 사이 선은 li 의 border-t — `divide-y` 를 붙이면 리퀴드 유리판(globals.css v4.1)이 또 한 겹 생겨 details 테두리와 겹친다.
                데스크톱은 세 칸(경기 46줄이 한 칸 목록이면 오른쪽 2/3 가 비었다 · 1366px 실측) */}
            <ul className="m-0 grid list-none grid-cols-1 gap-x-6 px-3 pb-1 pt-0 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map(([slug, region, dongCount, recent, topDong, topRecent]) => (
                <li key={slug} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border py-2">
                  <Link href={`/tx/${encodeURIComponent(slug)}`} className="tap-line t-sub font-bold text-ink no-underline hover:text-primary">
                    {region}
                  </Link>
                  <span className="t-caption tabular-nums text-text-3">
                    동 {n(dongCount)}곳 · {n(recent)}건
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    <Link prefetch={false} href={dongPath(region, topDong)} className="tap-line t-sub font-bold text-primary no-underline">
                      {topDong} <span className="font-medium text-text-3">{n(topRecent)}</span>
                    </Link>
                    {dongCount > 1 && (
                      <Link href={`/tx/${encodeURIComponent(slug)}`} className="tap-line t-sub text-text-2 no-underline hover:text-primary">
                        {n(dongCount - 1)}곳 더 ›
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
