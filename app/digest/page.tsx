import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { HouseMark } from "@/app/components/Logo";
import { ErrorState } from "@/app/components/ui";
import { AdZone } from "@/app/components/ads/AdZone";
import { getWeeklyDigest, type WeeklyDigest } from "@/lib/newui/digest";
import { Delta } from "@/app/components/num/Delta";
import { Explain } from "@/app/components/explain/Explain";
import { logger } from "@/lib/log";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { newsHref, storyHref } from "@/lib/town/post-href";

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
      <PageShell breadcrumb="주간 다이제스트">
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-2.5">
          <h1 className="mt-2 t-section text-ink">주간 다이제스트</h1>
          <ErrorState
            title="주간 요약 불러오기 실패"
            desc="잠시 후 다시 시도해 주세요."
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
  /* 일부가 조회 실패면 "0건"이라고 말하지 않는다 — 그건 사실이 아니다. */
  const previewLine =
    previewParts.length > 0
      ? `이번 주 ${previewParts.join(" · ")}${anyFailed ? "· 일부는 불러오기 실패" : ""}`
      : anyFailed
        ? "이번 주 요약 일부 불러오기 실패"
        : "이번 주 새로 모인 소식 없음";

  return (
    <PageShell breadcrumb="주간 다이제스트">
      {/* [1015] 데스크톱 2단 — 480px 한 열이라 옆이 비던 화면(브리프 규칙 F). 본문 카드는 그대로 두고
          아카이브 링크·기준 시각·관련 링크·광고 1 을 오른쪽 340px 레일로 옮겼다. 폰은 한 열 그대로(순서 같음). */}
      <div className="mx-auto grid w-full max-w-[860px] grid-cols-1 gap-4 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-2.5">
        {/* 푸시 미리보기 카드 */}
        <div className="rise-in glass-strong flex gap-2.5 rounded-2xl px-3.5 py-3 shadow-[0_8px_24px_rgba(16,28,54,.12)]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <HouseMark size={17} />
          </div>
          <div className="flex-1">
            <div className="flex justify-between">
              <span className="text-xs font-bold text-ink">
                내집나우 · 주간 다이제스트
              </span>
              <span className="t-caption text-text-3">최근 7일</span>
            </div>
            <div className="mt-0.5 t-sub text-text-2">{previewLine}</div>
          </div>
        </div>

        {/* 구독 CTA — 매주 받아보기 → 알림 설정 */}
        {/* 설정 → 푸시 알림 → "주간 다이제스트". 예전에는 이 링크가 수신함(/notifications)
            으로 갔고, 정작 켤 스위치도 보내는 크론도 없어서 지킬 수 없는 안내였다.
            지금은 옵트인 스위치(notification_preferences.push_weekly_digest)와
            발송 크론(/api/cron/weekly-digest, 월 18:00 KST)이 실제로 있다. */}
        <Link
          href="/my/settings"
          className="rise-in-1 tile flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3.5 no-underline"
        >
          <div>
            <div className="t-body font-bold text-ink">매주 받아보기</div>
            {/* [1015] 안내문 → 사실 한 줄(브리프 규칙 D) */}
            <div className="mt-0.5 t-sub text-text-2">
              설정 › 알림 › 푸시 알림 ‘주간 다이제스트’ · 매주 월요일 저녁 1회
            </div>
          </div>
          <span className="shrink-0 rounded-lg bg-primary-soft px-3.5 py-2 text-xs font-bold text-primary">
            알림 설정 ›
          </span>
        </Link>

        <h1 className="rise-in-1 mt-2 t-section text-ink">
          {digest.weekLabel} 주간 다이제스트
        </h1>

        {/* 뉴스 하이라이트 (board_posts 자동 수집, 7일) */}
        <div className="rise-in-2 card flex flex-col gap-2 rounded-2xl px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink">뉴스 하이라이트</span>
            {/* [1007 · P2] 목적지 이름 그대로 + 24px 히트(인라인 링크 규칙) */}
            <Link href="/town/news" className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary">
              뉴스룸 전체 ›
            </Link>
          </div>
          {news.length === 0 &&
            (failed.news ? (
              <div className="rounded-lg bg-danger-soft px-3 py-2 t-sub text-ink">
뉴스 불러오기 실패 · 잠시 후 다시
              </div>
            ) : (
              <div className="t-sub text-text-3">
최근 7일 수집된 뉴스 없음
              </div>
            ))}
          {news.map((n) => (
            <Link key={n.id} href={newsHref(n.id)} className="group press -mx-1 block rounded-lg px-1 py-0.5 no-underline">
              <div className="t-sub font-bold text-ink group-hover:text-primary">
                {n.title}
              </div>
              <div className="mt-[2px] t-caption text-text-3">
                {[n.sourceName, shortDate(n.publishedAt), n.region]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </Link>
          ))}
        </div>

        {/* 시장 요약 (market_region_price, 전월 대비) */}
        <div className="rise-in-3 card flex flex-col gap-[7px] rounded-2xl px-4 py-3.5">
          {/* [1009 · H] 등락이 무엇의 변화인지 적는다 — 스냅샷 sale_change 는 부동산원 **매매가격지수** 전월비다
              (평균가 변화가 아니다). 예전 머리 "평균 매매가 · 전월 대비"는 평균가가 그만큼 움직인 것처럼 읽혔다. */}
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-0.5 text-xs font-bold text-ink">
              시장 요약
              <Explain
                title="시장 요약"
                body="주요 지역의 한국부동산원 월간 통계입니다."
                how={[
                  "가격 = 한국부동산원이 공표한 지역 아파트 평균 매매가격(없으면 중위가격).",
                  "등락 = 같은 통계의 매매가격지수 전월 대비 변동률. 평균가 자체의 변화가 아닙니다.",
                  "월간 변동률이 없는 지역은 주간 변동률(전주 대비)로 대신하고, 그 줄에 “전주 대비”라고 적습니다.",
                  "값이 비어 있는 지역은 싣지 않습니다.",
                ]}
                source={`한국부동산원 R-ONE${market[0]?.periodLabel ? ` · ${market[0].periodLabel} 기준` : ""}`}
              />
            </span>
            <span className="t-caption text-text-3">
              평균 매매가 · 지수 전월 대비
              {market[0]?.periodLabel ? ` · ${market[0].periodLabel} 기준` : ""}
            </span>
          </div>
          {market.length === 0 &&
            (failed.market ? (
              <div className="rounded-lg bg-danger-soft px-3 py-2 t-sub text-ink">
시세 불러오기 실패 · 잠시 후 다시
              </div>
            ) : (
              <div className="t-sub text-text-3">
주요 지역 시세로 표시할 최신 스냅샷 없음
              </div>
            ))}
          {/* [1015] 가격·등락 행 목록 = 리퀴드 판(blue — 시세 톤, 브리프 규칙 I)
              [1038 · 14] 행 6줄 → 숫자 타일 격자(지역 · 가격 · 등락 색) — 한눈에 어디가 오르고 내렸는지 */}
          {market.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
          {market.map((m) => (
            <div key={m.regionId} className="rounded-lg bg-bg px-3 py-2.5">
              <div className="truncate t-caption text-text-3">
                <b className="font-bold text-ink">{m.name}</b> {m.city}
              </div>
              <div className="t-section t-num text-ink">{m.price}</div>
              <span className="flex items-baseline gap-1 t-sub">
                <Delta
                  pct={m.changePct}
                  srContext={m.changeBasis === "weekly" ? "매매지수 전주보다" : "매매지수 전월보다"}
                  className="text-[12px]"
                />
                <span className="t-caption text-text-3">{m.changeBasis === "weekly" ? "전주 대비" : "전월 대비"}</span>
              </span>
            </div>
          ))}
          </div>
          )}
        </div>

        {/* 커뮤니티 (최근 7일 이웃 글) */}
        <div className="rise-in-4 card flex flex-col gap-2 rounded-2xl px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink">커뮤니티</span>
            <Link href="/town" className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary">
              동네이야기 ›
            </Link>
          </div>
          {failed.community ? (
            <div className="rounded-lg bg-danger-soft px-3 py-2 t-sub text-ink">
이웃 글 불러오기 실패 · 잠시 후 다시
            </div>
          ) : community.count === 0 ? (
            <div className="t-sub text-text-3">이번 주 새 이웃 글 없음</div>
          ) : (
            <>
              <div className="t-sub text-text-2">
                이번 주 새 이웃 글 <b className="text-ink">{community.count}건</b>
              </div>
              {/* [1007 · P2] 이웃 글(비자동)은 이야기 상세로 — 예전엔 뉴스 상세를 거쳐 리다이렉트됐다 */}
              {community.titles.map((t) => (
                <Link
                  key={t.id}
                  href={storyHref(t.id)}
                  className="press inline-flex min-h-[24px] items-center t-sub font-bold text-ink hover:text-primary"
                >
                  {t.title}
                </Link>
              ))}
            </>
          )}
        </div>

      </div>

      {/* ===== 오른쪽 레일(데스크톱) — 관련 링크 · 아카이브 · 기준 시각 · 광고 1. 폰은 본문 아래 ===== */}
      <aside className="flex min-w-0 flex-col gap-2.5">
        <div className="rise-in-4 card flex flex-col gap-1.5 rounded-2xl px-4 py-3.5">
          <div className="text-xs font-bold text-ink">관련 화면</div>
          {[
            { href: "/town/news", label: "뉴스룸" },
            { href: "/town", label: "동네이야기" },
            { href: "/apply", label: "청약 경쟁률 · 특별공급" },
            { href: "/supply", label: "입주 물량" },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary no-underline">
              {l.label} ›
            </Link>
          ))}
        </div>

        {/* N23 — 이 페이지는 "최근 7일" 이라 어제 본 내용과 오늘 본 내용이 다르다.
            그래서 이 주소는 인용할 수 없다. 주 단위로 고정된 아카이브를 따로 둔다. */}
        <p className="rise-in-5 px-1 t-sub text-text-3">
          <Link href="/digest/archive" className="inline-flex min-h-[24px] items-center font-bold text-primary">
            지난 주간 다이제스트 아카이브 ›
          </Link>
        </p>

        <p className="rise-in-5 px-1 t-caption text-text-3">
          데이터 기준 시각 {asOfLabel(digest.generatedAt)}
          {digest.marketAsOf ? ` · 실거래 기준 ${digest.marketAsOf} (국토교통부)` : ""}
        </p>
      </aside>
      </div>

      {/* [1015] 광고 — 페이지 끝 1곳(브리프 규칙 G: 첫 화면 밖). 레일은 짧아 데스크톱 첫 화면 안에 들어오므로
          본문이 끝난 뒤에 둔다. 이 화면에 광고 자리가 없었다. */}
      <AdZone placement="page_bottom" seed={0} plan={null} className="mx-auto mt-6 w-full max-w-[860px] max-md:mt-4" />
    </PageShell>
  );
}
