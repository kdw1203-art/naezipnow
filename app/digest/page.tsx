import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { ErrorState } from "@/app/components/ui";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
import { getWeeklyDigest, type WeeklyDigest } from "@/lib/newui/digest";
import { Delta } from "@/app/components/num/Delta";
import { Explain } from "@/app/components/explain/Explain";
import { logger } from "@/lib/log";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { newsHref, storyHref } from "@/lib/town/post-href";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

export const metadata = buildPageMetadata({
  title: "주간 다이제스트",
  description:
    "최근 7일 부동산 뉴스, 지역 시세 변동, 이웃 글을 한 장으로 요약합니다. 실제 수집된 데이터만 싣습니다.",
  path: "/digest",
});

/* ============================================================
   주간 다이제스트 (#86) — 최근 7일 실데이터 요약
   뉴스 하이라이트(board_posts) · 시장 요약(market_region_price) ·
   커뮤니티(이웃 글). 빈 데이터는 빈 상태 문구로 폴백 (가짜 숫자 없음).
   ============================================================ */

/* [1010] 크롤러 재방문(≈2.2일)보다 짧은 TTL 은 크롤 1회 = 재렌더 1회다. 이 화면을 바꾸는
   적재(SOURCE_MAP)가 이제 경로를 직접 비우므로 시간 TTL 은 안전망으로만 둔다. */
export const revalidate = 86_400;

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

function asOfLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function DigestPage() {
  /* 전체 조회 실패는 던져서 온다(lib/newui/digest.ts). 여기서 "데이터 없음"으로
     바꿔 말하지 않고, 실패는 실패로 화면에 적는다. */
  let digest: WeeklyDigest | null = null;
  let cause: string | null = null;
  try {
    digest = await getWeeklyDigest();
  } catch (e) {
    logger.error("[DigestPage]", e);
    cause = e instanceof Error ? e.message : String(e);
  }

  if (!digest) {
    return (
      <PageShell>
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
          <h1 className="t-title text-ink">주간 다이제스트</h1>
          <ErrorState
            title="주간 요약을 불러오지 못했어요"
            desc="데이터 조회가 실패했습니다. 이번 주에 소식이 없다는 뜻은 아니에요. 잠시 후 다시 열어봐 주세요."
            cause={cause ?? undefined}
            action={{ label: "동네이야기 보기", href: "/town" }}
          />
        </div>
      </PageShell>
    );
  }

  const { news, market, community, failed } = digest;
  const anyFailed = failed.news || failed.market || failed.community;

  const previewParts: string[] = [];
  if (news.length > 0) previewParts.push(`뉴스 ${news.length}건`);
  if (market.length > 0) previewParts.push(`주요 지역 시세 ${market.length}곳`);
  if (community.count > 0) previewParts.push(`이웃 글 ${community.count}건`);
  /* 일부가 조회 실패면 "0건"이라고 말하지 않는다 — 그건 사실이 아니다.
     [v4 · 규칙 1] 머리 사실 한 줄 — 주차 · 건수(있는 항목만). 전부 0 이면 주차만 */
  const factLine = [digest.weekLabel, ...previewParts].join(" · ") + (anyFailed ? " · 일부 조회 실패" : "");

  return (
    /* [v4] "한 화면 한 가지" — 가운데 한 줄(760px): 제목 한 줄 + 사실 한 줄 → 뉴스 하이라이트(1px 선 행) → 시장 요약(행) →
       이웃 글(행) → 알림 한 행 → 아카이브 링크 · 기준 시각 캡션.
       지운 것: 푸시 미리보기 카드(집 아이콘 타일 + 같은 건수 문장 — 사실 줄과 중복) · 알림 타일의 설명 문장 · 섹션 카드 셋 ·
       브레드크럼 문자열(제목과 같은 말). */
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <header>
          <h1 className="t-title text-ink">주간 다이제스트</h1>
          <p className="mt-0.5 t-sub text-text-3">{factLine}</p>
        </header>

        {/* 뉴스 하이라이트 (board_posts 자동 수집, 7일) */}
        <section aria-labelledby="digest-news-title" className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="digest-news-title" className="t-section text-ink">
              뉴스 하이라이트
            </h2>
            {/* [1007 · P2] 목적지 이름 그대로 + 24px 히트(인라인 링크 규칙) */}
            <Link href="/town/news" className="tap-line shrink-0 t-sub font-bold text-primary no-underline">
              뉴스룸 전체 ›
            </Link>
          </div>
          {news.length === 0 &&
            (failed.news ? (
              <p className="py-3 t-sub text-text-2">뉴스를 불러오지 못했어요 (조회 실패) — 수집된 뉴스가 없다는 뜻은 아니에요</p>
            ) : (
              /* [1012] 규칙 6 — 언제·어디서. [v4] 한 줄 */
              <p className="py-3 t-sub text-text-3">최근 7일 뉴스룸 수집 기사 없음 · 매일 아침 8시 수집</p>
            ))}
          {news.length > 0 && (
            <ul className="divide-y divide-line">
              {news.map((n) => (
                <li key={n.id}>
                  <Link href={newsHref(n.id)} className="flex min-w-0 flex-col gap-0.5 py-3 no-underline">
                    <span className="truncate t-body font-bold text-ink">{n.title}</span>
                    <span className="truncate t-sub text-text-3">
                      {[n.sourceName, shortDate(n.publishedAt), n.region].filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 시장 요약 (market_region_price, 전월 대비) — [v4] 카드 → 1px 선 행: 지역(굵게) + 시·도 / 가격 + 등락 */}
        <section aria-labelledby="digest-market-title" className="flex flex-col gap-1">
          {/* [1009 · H] 등락이 무엇의 변화인지 적는다 — 스냅샷 sale_change 는 부동산원 **매매가격지수** 전월비다
              (평균가 변화가 아니다). 예전 머리 "평균 매매가 · 전월 대비"는 평균가가 그만큼 움직인 것처럼 읽혔다. */}
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-0.5">
              <h2 id="digest-market-title" className="t-section text-ink">
                시장 요약
              </h2>
              <Explain
                title="시장 요약"
                body="주요 지역의 한국부동산원 월간 통계예요."
                how={[
                  "가격 = 한국부동산원이 공표한 지역 아파트 평균 매매가격(없으면 중위가격)이에요.",
                  "등락 = 같은 통계의 매매가격지수 전월 대비 변동률이에요. 평균가 자체의 변화가 아니에요.",
                  "월간 변동률이 없는 지역은 주간 변동률(전주 대비)로 대신하고, 그 줄에 “전주 대비”라고 적어요.",
                  "값이 비어 있는 지역은 싣지 않아요.",
                ]}
                source={`한국부동산원 R-ONE${market[0]?.periodLabel ? ` · ${market[0].periodLabel} 기준` : ""}`}
              />
            </span>
            <span className="shrink-0 t-caption text-text-3">
              평균 매매가 · 지수 전월 대비
              {market[0]?.periodLabel ? ` · ${market[0].periodLabel}` : ""}
            </span>
          </div>
          {market.length === 0 &&
            (failed.market ? (
              <p className="py-3 t-sub text-text-2">시세를 불러오지 못했어요 (조회 실패)</p>
            ) : (
              /* [1012] 규칙 6 — 출처·시점을 적는다 */
              <p className="py-3 t-sub text-text-3">한국부동산원 월간 통계 아직 미반영 · 매달 공표 뒤 갱신</p>
            ))}
          {market.length > 0 && (
            <ul className="divide-y divide-line">
              {market.map((m) => (
                <li key={m.regionId} className="flex min-h-12 items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate t-body">
                    <b className="font-bold text-ink">{m.name}</b>
                    <span className="ml-1 t-sub text-text-3">{m.city}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-1.5 t-body t-num text-text-1">
                    {m.price}
                    <Delta
                      pct={m.changePct}
                      srContext={m.changeBasis === "weekly" ? "매매지수 전주보다" : "매매지수 전월보다"}
                      className="text-[12px]"
                    />
                    {m.changeBasis === "weekly" ? <span className="t-caption text-text-3">전주 대비</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 커뮤니티 (최근 7일 이웃 글) — [v4] 카드 → 1px 선 행 */}
        <section aria-labelledby="digest-community-title" className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="digest-community-title" className="t-section text-ink">
              이웃 글
              {community.count > 0 && <span className="ml-1.5 t-sub font-medium text-text-3">{community.count}건</span>}
            </h2>
            <Link href="/town" className="tap-line shrink-0 t-sub font-bold text-primary no-underline">
              동네이야기 ›
            </Link>
          </div>
          {failed.community ? (
            <p className="py-3 t-sub text-text-2">이웃 글을 불러오지 못했어요 (조회 실패) — 글이 없다는 뜻은 아니에요</p>
          ) : community.count === 0 ? (
            <p className="py-3 t-sub text-text-3">
              {/* [1012] 규칙 5·6 — "남겨보세요" 권유 대신 사실 + 동사·대상 링크 */}
              최근 7일 이웃 글 없음 ·{" "}
              <Link href="/town/write" className="tap-line font-bold text-primary no-underline">
                동네이야기 쓰기
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {/* [1007 · P2] 이웃 글(비자동)은 이야기 상세로 — 예전엔 뉴스 상세를 거쳐 리다이렉트됐다 */}
              {community.titles.map((t) => (
                <SummaryRow key={t.id} label={<span className="block truncate">{t.title}</span>} href={storyHref(t.id)} />
              ))}
            </ul>
          )}
        </section>

        {/* 구독 — 매주 받아보기 → 알림 설정.
            설정 → 푸시 알림 → "주간 다이제스트". 예전에는 이 링크가 수신함(/notifications)
            으로 갔고, 정작 켤 스위치도 보내는 크론도 없어서 지킬 수 없는 안내였다.
            지금은 옵트인 스위치(notification_preferences.push_weekly_digest)와
            발송 크론(/api/cron/weekly-digest, 월 18:00 KST)이 실제로 있다.
            [v4] 타일(설명 문장 + 연한 버튼) → 1px 선 행 하나 */}
        <ul className="divide-y divide-line border-y border-line">
          {/* [1012] 규칙 5 — CTA 는 동사+대상, 언제(월요일 18시) 를 적는다 */}
          <SummaryRow label="주간 다이제스트 알림 받기" sub="매주 월요일 저녁 6시 · 설정 › 알림 › 푸시 알림" href="/my/settings" />
        </ul>

        <div className="flex flex-col gap-1">
          {/* N23 — 이 페이지는 "최근 7일" 이라 어제 본 내용과 오늘 본 내용이 다르다.
              그래서 이 주소는 인용할 수 없다. 주 단위로 고정된 아카이브를 따로 둔다. */}
          <Link href="/digest/archive" className="tap-line self-start t-sub font-bold text-primary no-underline">
            지난 주간 다이제스트 아카이브 ›
          </Link>
          <p className="t-caption text-text-3">
            데이터 기준 시각 {asOfLabel(digest.generatedAt)}
            {digest.marketAsOf ? ` · 실거래 기준 ${digest.marketAsOf} (국토교통부)` : ""}
          </p>
        </div>
      </div>
    </PageShell>
  );
}
