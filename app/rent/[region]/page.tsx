/* [1024 · 원룸·오피스텔] 동네 실거래 전월세 — /rent/[region]. 국토부 오피스텔·연립다세대·단독다가구 전월세 신고(법정동 단위).
   데이터는 담당 Q 의 lib/market/rent-nonapt.ts(지금 운영 DB 0행 — 빈 상태는 사실 문장으로, 화면은 깨지지 않는다).
   시안: scratchpad mock1024/rent-{d,m}.html. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import { Icon } from "@/app/components/Icon";
import { ShareLinkButton } from "@/app/components/ShareLinkButton";
import { findCatalogRegionById } from "@/lib/region/catalog";
import { seoAlternates } from "@/lib/seo/alternates";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { formatKrwShort } from "@/lib/market/format";
import type { NonAptRentDeal } from "@/lib/market/rent-nonapt-core";
import {
  NONAPT_PROPERTY_TYPES,
  NONAPT_TYPE_LABEL,
  areaBandShort,
  contractDateLabel,
  parseRentParams,
  rentFacts,
  rentNoindex,
  rentTitle,
  rentTotalRows,
  type RentParams,
} from "@/lib/rent/params";
import { getRentCountsCached, getRentSnapshotCached } from "@/lib/rent/region-counts";
import { RentDongChips, RentTypeAreaFilters } from "./RentFilters";
import { RentScatter } from "./RentScatter";
import { DEFAULT_OG_IMAGES } from "@/lib/seo/page-metadata";

/* ============================================================
   왜 searchParams 를 읽는가(형제 /region·/tx 는 안 읽는다): 유형·동·면적대는 **서버 조회 조건**이라
   (유형별로 다른 행, 동·면적대는 표본 3,000행 안의 필터) 클라이언트 토글로 옮기면 세 유형 × 3,000행을
   한 HTML 에 실어야 한다. 대신 DB 읽기를 6시간 데이터 캐시(lib/rent/region-counts.ts unstable_cache)로
   묶어 같은 조합은 한 번만 읽고, 필터 전환은 replaceState + router.refresh()(RentFilters) 로 서버 렌더만
   다시 받는다. 0행 지역은 noindex(generateMetadata) + 사이트맵 제외라 크롤 재렌더가 붙지 않는다.
   ============================================================ */
export const revalidate = 21_600;

type Params = { region: string };
type Search = Record<string, string | string[] | undefined>;

const TABLE_ROWS = 30;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const [{ region: id }, sp] = await Promise.all([params, searchParams]);
  const region = findCatalogRegionById(id);
  if (!region) return { title: "원룸·오피스텔 실거래 월세 | 내집나우", robots: { index: false, follow: false } };
  const p = parseRentParams(sp);
  const counts = await getRentCountsCached(id, region.name);
  const title = `${rentTitle(region.name, p.dong)} | 내집나우`;
  const description = `${region.name} 오피스텔·연립다세대·단독다가구 전월세 실거래 — 국토교통부 신고 기준 중앙 보증금·월세와 최근 계약. 매물 호가가 아닙니다.`;
  return {
    title,
    description,
    /* 필터 조합이 아니라 지역 주소 하나만 색인한다(check-param-canonical) · 0행이면 색인하지 않는다 */
    alternates: seoAlternates(`/rent/${id}`),
    ...(rentNoindex(counts) ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, type: "website", images: DEFAULT_OG_IMAGES },
  };
}

function Stat({ k, v, s }: { k: string; v: string; s: string }) {
  return (
    <div className="card flex min-w-0 flex-col gap-0.5 p-[var(--pad-card)]">
      <span className="t-caption text-text-3">{k}</span>
      <span className="truncate t-section t-num text-ink">{v}</span>
      <span className="t-caption text-text-3">{s}</span>
    </div>
  );
}

function DealTable({ deals, withMonthly, emptyLabel }: { deals: readonly NonAptRentDeal[]; withMonthly: boolean; emptyLabel: string }) {
  const rows = deals.slice(0, TABLE_ROWS);
  const cols = withMonthly ? 7 : 6;
  return (
    <div data-tone="plain" className="lq-panel mt-2 overflow-x-auto">
      <table className={`w-full text-left t-body ${withMonthly ? "min-w-[520px]" : "min-w-[440px]"}`}>
        <thead>
          <tr className="border-b border-border t-caption text-text-3">
            <th className="py-1.5 pr-2 font-semibold">계약일</th>
            <th className="py-1.5 pr-2 font-semibold">유형</th>
            <th className="py-1.5 pr-2 font-semibold">면적</th>
            <th className="py-1.5 pr-2 font-semibold">층</th>
            <th className="py-1.5 pr-2 text-right font-semibold">보증금</th>
            {withMonthly && <th className="py-1.5 pr-2 text-right font-semibold">월세</th>}
            <th className="py-1.5 font-semibold">건물명</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={cols} className="py-3 t-sub text-text-3">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((d, i) => (
              <tr key={`${d.ym}-${d.day ?? 0}-${i}`} className="border-b border-border last:border-b-0">
                <td className="whitespace-nowrap py-2 pr-2 tabular-nums text-text-1">{contractDateLabel(d.ym, d.day)}</td>
                <td className="whitespace-nowrap py-2 pr-2 text-text-2">{NONAPT_TYPE_LABEL[d.type]}</td>
                <td className="whitespace-nowrap py-2 pr-2 tabular-nums text-text-1">{d.areaM2 != null ? `${d.areaM2}㎡` : "—"}</td>
                <td className="whitespace-nowrap py-2 pr-2 tabular-nums text-text-2">{d.floor != null ? `${d.floor}층` : "—"}</td>
                <td className="whitespace-nowrap py-2 pr-2 text-right t-num text-ink">{formatKrwShort(d.depositKrw)}</td>
                {withMonthly && <td className="whitespace-nowrap py-2 pr-2 text-right t-num text-ink">{formatKrwShort(d.monthlyKrw)}</td>}
                <td className="max-w-[160px] truncate py-2 text-text-2">{d.buildingName ?? "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function minMaxLabel(deals: readonly NonAptRentDeal[]): string {
  if (deals.length === 0) return "—";
  let lo = Infinity;
  let hi = -Infinity;
  for (const d of deals) {
    if (d.depositKrw < lo) lo = d.depositKrw;
    if (d.depositKrw > hi) hi = d.depositKrw;
  }
  return lo === hi ? formatKrwShort(lo) : `${formatKrwShort(lo)} ~ ${formatKrwShort(hi)}`;
}

export default async function RentRegionPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [{ region: id }, sp] = await Promise.all([params, searchParams]);
  const region = findCatalogRegionById(id);
  if (!region) notFound();
  const p: RentParams = parseRentParams(sp);
  const city = (region.city ?? "").trim() || "서울";

  /* 스냅샷 조회 실패는 던진다(error.tsx) — 빈 결과로 뭉개면 "신고 없음"이 거짓이 된다. 건수는 실패해도 null 로 접는다. */
  const [snapshot, counts] = await Promise.all([
    getRentSnapshotCached(id, region.name, p),
    getRentCountsCached(id, region.name),
  ]);
  const totalRows = rentTotalRows(counts);
  const collected = totalRows > 0;
  const typeLabel = NONAPT_TYPE_LABEL[p.type];
  const facts = rentFacts(region.name, totalRows, snapshot?.sampleCount ?? 0, typeLabel);
  const period = snapshot?.periodLabel ?? "";
  const scope = [p.dong, typeLabel, areaBandShort(p.areaBand), period].filter(Boolean).join(" · ");
  const wolse = snapshot?.wolse ?? { count: 0, medianDepositKrw: null, medianMonthlyKrw: null, deals: [] as NonAptRentDeal[] };
  const jeonse = snapshot?.jeonse ?? { count: 0, medianDepositKrw: null, medianMonthlyKrw: null, deals: [] as NonAptRentDeal[] };
  const dongs = snapshot?.dongs ?? [];
  /* 비어 있는 이유를 한 단어로 — 수집 전(행 0) / 이 조건 0건(필터) */
  const emptyLabel = collected ? "이 조건 0건" : "수집 전";
  const recentCaption = "최근 3개월";
  const jeonseRangeCaption = jeonse.count > jeonse.deals.length ? `최근 ${jeonse.deals.length}건` : recentCaption;
  const countLabel = (n: number | undefined) => (collected && typeof n === "number" ? `${n.toLocaleString("ko-KR")}건` : "—");

  const title = rentTitle(region.name, p.dong);

  return (
    <PageShell wide>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            breadcrumbJsonLd([
              { name: "홈", url: "/" },
              { name: "원룸·오피스텔 실거래 월세", url: "/rent" },
              { name: title, url: `/rent/${id}` },
            ]),
          ]),
        }}
      />

      {/* 시·도 › 시군구 › 동 — 칩 줄(선택 칩은 한지). 동 칩은 ?dong= 가 있을 때만 */}
      <nav className="flex flex-wrap items-center gap-1.5" aria-label="경로">
        <Link href="/rent" className="chip press inline-flex min-h-10 items-center border border-line bg-surface px-3 py-1.5 t-sub text-text-2 no-underline">
          {city}
        </Link>
        <Link
          href={`/rent/${id}`}
          className={`chip press inline-flex min-h-10 items-center border px-3 py-1.5 t-sub no-underline ${p.dong ? "border-line bg-surface text-text-2" : "chip-active"}`}
          aria-current={p.dong ? undefined : "page"}
        >
          {region.name}
        </Link>
        {p.dong && (
          <span className="chip chip-active inline-flex min-h-10 items-center border px-3 py-1.5 t-sub" aria-current="page">
            {p.dong}
          </span>
        )}
      </nav>

      <PageHead
        icon="building"
        title={title}
        sub="국토교통부 오피스텔·연립다세대·단독다가구 전월세 신고 · 법정동 단위"
        className="mt-3"
        facts={
          <>
            {facts.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </>
        }
        actions={
          <>
            <ShareLinkButton title={title} className="btn-secondary btn-md press gap-1.5" />
            <Link href={`/map?region=${encodeURIComponent(region.name)}`} className="btn-secondary btn-md press gap-1.5 no-underline">
              <Icon name="map" size={14} />
              지도
            </Link>
          </>
        }
      />

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5">
        <div className="min-w-0">
          <RentTypeAreaFilters regionId={id} params={p} counts={collected ? counts : null} />

          {/* 월세 */}
          <section className="mt-3" aria-labelledby="rent-wolse-title">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h2 id="rent-wolse-title" className="t-section text-ink">
                월세
              </h2>
              <span className="truncate t-caption text-text-3">{scope}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 md:gap-3">
              <Stat k="중앙 보증금" v={formatKrwShort(wolse.medianDepositKrw)} s={recentCaption} />
              <Stat k="중앙 월세" v={formatKrwShort(wolse.medianMonthlyKrw)} s={recentCaption} />
              <Stat k="계약" v={collected ? `${wolse.count.toLocaleString("ko-KR")}건` : "—"} s={recentCaption} />
            </div>
            <div className="card mt-3 p-[var(--pad-card)]">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="t-section text-ink">보증금 × 월세 분포</h3>
                <span className="t-caption text-text-3">계약 1건 = 점 1개</span>
              </div>
              <div className="mt-2">
                <RentScatter deals={wolse.deals} emptyLabel={`— · ${emptyLabel}`} />
              </div>
            </div>
            <div className="card mt-3 p-[var(--pad-card)]">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="t-section text-ink">최근 계약</h3>
                <span className="t-caption text-text-3">계약일 순 · 최대 {TABLE_ROWS}건</span>
              </div>
              <DealTable deals={wolse.deals} withMonthly emptyLabel={emptyLabel} />
              <p className="mt-2 t-caption text-text-3">건물명은 오피스텔·연립다세대만 · 단독다가구는 법정동까지</p>
            </div>
          </section>

          {/* 전세 */}
          <section className="mt-5 max-md:mt-4" aria-labelledby="rent-jeonse-title">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h2 id="rent-jeonse-title" className="t-section text-ink">
                전세
              </h2>
              <span className="truncate t-caption text-text-3">{scope}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 md:gap-3">
              <Stat k="중앙 보증금" v={formatKrwShort(jeonse.medianDepositKrw)} s={recentCaption} />
              <Stat k="최저 ~ 최고" v={minMaxLabel(jeonse.deals)} s={jeonseRangeCaption} />
              <Stat k="계약" v={collected ? `${jeonse.count.toLocaleString("ko-KR")}건` : "—"} s={recentCaption} />
            </div>
            <div className="card mt-3 p-[var(--pad-card)]">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="t-section text-ink">최근 계약</h3>
                <span className="t-caption text-text-3">계약일 순 · 최대 {TABLE_ROWS}건</span>
              </div>
              <DealTable deals={jeonse.deals} withMonthly={false} emptyLabel={emptyLabel} />
            </div>
          </section>

          {/* 동 선택 — 표본에서 본 법정동만(0행이면 섹션 없음) */}
          {dongs.length > 0 && (
            <section className="mt-5 max-md:mt-4" aria-labelledby="rent-dongs-title">
              <div className="flex items-baseline justify-between gap-2 px-1">
                <h2 id="rent-dongs-title" className="t-section text-ink">
                  {region.name} · 동
                </h2>
                <span className="t-caption text-text-3">
                  법정동 · {typeLabel} · {snapshot?.periodLabel}
                </span>
              </div>
              <div className="mt-2">
                <RentDongChips regionId={id} params={p} dongs={dongs} />
              </div>
            </section>
          )}

          <p className="mt-4 t-caption text-text-3">
            매물이 아니라 국토교통부에 신고된 실거래 · 계약 후 30일 안 신고 · 최근 1~2개월은 늘 수 있음
            {snapshot?.sampleTruncated ? " · 표본 3,000건 상한" : ""}
          </p>
        </div>

        {/* 데스크톱 레일 — 유형별 건수 · 동네이야기 */}
        <aside className="hidden flex-col gap-3 lg:sticky lg:top-[76px] lg:flex">
          <section className="card p-[var(--pad-card)]" aria-label="유형별 건수">
            <div className="grid grid-cols-2 gap-3">
              {NONAPT_PROPERTY_TYPES.map((t) => (
                <div key={t} className="flex min-w-0 flex-col gap-0.5">
                  <span className="t-caption text-text-3">{NONAPT_TYPE_LABEL[t]}</span>
                  <span className="t-section t-num text-ink">{countLabel(counts?.[t])}</span>
                  <span className="t-caption text-text-3">전월세 · 최근 12개월</span>
                </div>
              ))}
              <Link href={`/region/${id}`} className="flex min-w-0 flex-col gap-0.5 no-underline">
                <span className="t-caption text-text-3">아파트 전월세</span>
                <span className="t-section font-bold text-primary">지역 화면 ›</span>
                <span className="t-caption text-text-3">{region.name}</span>
              </Link>
            </div>
          </section>
          <section className="card p-[var(--pad-card)]">
            <h2 className="t-section text-ink">동네이야기 · {region.name}</h2>
            <ul data-tone="plain" className="lq-panel mt-1 flex flex-col">
              {[
                { href: `/town/${id}`, label: "동네 홈" },
                { href: `/town/news?region=${encodeURIComponent(region.name)}`, label: "뉴스룸" },
                { href: `/region/${id}`, label: "시장 데이터" },
              ].map((l) => (
                <li key={l.href} className="border-b last:border-0">
                  <Link href={l.href} className="flex min-h-10 items-center justify-between gap-3 py-2 t-body text-text-1 no-underline">
                    {l.label}
                    <span className="shrink-0 t-body font-bold text-text-3" aria-hidden="true">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </PageShell>
  );
}
