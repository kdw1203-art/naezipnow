import Link from "next/link";
import { buildPromoKit, type ComplexPack } from "@/lib/content/promo-kit";
import type { InflowSummaryRow } from "@/lib/content/promo-pure";
import { CopyBlock } from "../blog-pack/CopyBlock";

/* [1002] 홍보 킷 — 관리자 전용(레이아웃이 RBAC 게이트 · force-dynamic).
   실측 유입(30일) → 이번 주 채널별 할 일 → 단지 글 붙여넣기 완성본.
   발행은 사장님이 한다. 여기서는 "준비 시간 0"만 만든다. 킷 자체는 1시간 캐시. */

export const metadata = { title: "홍보 킷 | 내집나우 관리자" };

const SITE = "https://naezipnow.com";

const CARD = "rounded-2xl border border-[rgba(255,255,255,.12)] bg-[#1a2130] p-5";
const H2 = "text-[15px] font-extrabold text-white";
const MUTED = "text-[12px] leading-[1.7] text-[#9aa6b8]";

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="break-all text-[12px] font-bold !text-ai-accent underline underline-offset-2"
    >
      {children}
    </a>
  );
}

function ChannelBars({ rows }: { rows: InflowSummaryRow[] }) {
  if (rows.length === 0) {
    return <p className={MUTED}>최근 30일에 집계된 랜딩이 없습니다 (분석 동의 표본 기준).</p>;
  }
  const max = Math.max(1, ...rows.map((r) => r.sessions));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.channel} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-bold text-[#e7ecf5]">{r.label}</span>
            <span className="text-[12px] tabular-nums text-[#c9d2e0]">
              {r.sessions.toLocaleString("ko-KR")}세션 · {r.share}%
              <span className="text-[#5f6b7d]"> · 랜딩 {r.landings.toLocaleString("ko-KR")}</span>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#0d1119]">
            <div
              className="h-full rounded-full bg-[#3182f6]"
              style={{ width: `${Math.max(2, Math.round((r.sessions / max) * 100))}%` }}
            />
          </div>
          {r.sources.length > 0 && (
            <div className="text-[10px] text-[#5f6b7d]">{r.sources.join(" · ")}</div>
          )}
        </li>
      ))}
    </ul>
  );
}

function PackSection({ pack, index }: { pack: ComplexPack; index: number }) {
  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#5f6b7d]">
          단지 글 팩 {index + 1}
        </div>
        <h3 className="mt-1 text-[19px] font-extrabold text-white">
          {pack.name}
          <span className="ml-2 text-[13px] font-semibold text-[#9aa6b8]">{pack.region}</span>
        </h3>
        <p className={MUTED}>
          {pack.asOfLabel} · {pack.reason}
          {pack.tradeCount12m !== null && ` · 최근 12개월 신고 ${pack.tradeCount12m.toLocaleString("ko-KR")}건`}
        </p>
      </div>
      <CopyBlock label="제목 후보 1" text={pack.titles[0] ?? ""} rows={2} />
      {pack.titles[1] && <CopyBlock label="제목 후보 2" text={pack.titles[1]} rows={2} />}
      <CopyBlock label="본문 (네이버 블로그 · 출처·투자 권유 아님 문단 유지)" text={pack.blogBody} rows={16} />
      <CopyBlock label="짧은 글 (카페·커뮤니티 · 5줄)" text={pack.shortPost} rows={6} />
      <CopyBlock label="해시태그" text={pack.hashtags.map((h) => `#${h}`).join(" ")} rows={2} />
      <CopyBlock label="링크 (블로그용 · utm 포함)" text={pack.blogUrl} rows={2} />
      <CopyBlock label="링크 (커뮤니티용 · utm 포함)" text={pack.shortUrl} rows={2} />
    </div>
  );
}

export default async function AdminPromoPage() {
  const kit = await buildPromoKit();
  const kakaoConfigured = Boolean(process.env.NEXT_PUBLIC_KAKAO_JS_KEY?.trim());
  const utmTop = (kit.inflow.utm ?? []).slice(0, 8);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[19px] font-extrabold text-white">홍보 킷</h1>
        <p className="mt-1 text-[13px] leading-[1.7] text-[#9aa6b8]">
          지난 30일 실측 유입에서 시작해, 이번 주 채널별로 할 일을 정하고, 단지 글은
          붙여넣기 완성본으로 내려받는 화면입니다. 발행은 직접 하시고, 글 안의 출처 문단과
          &ldquo;투자 권유 아님&rdquo; 문구는 지우지 말아 주세요. 링크에는 이미 utm 이 붙어
          있어 어느 글에서 왔는지 트래픽 화면에서 추적됩니다.
        </p>
      </div>

      {kit.missing.length > 0 && (
        <div className="rounded-xl border border-[#5a4a1e] bg-[#2a2416] px-4 py-3 text-[12px] text-[#e0c589]">
          이번 킷에서 빠진 것: {kit.missing.join(", ")} — 소스 조회 실패로 생략됐어요
          (없는 것이 아니라 못 읽은 것). 다음 갱신(최대 1시간) 뒤에 채워질 수 있어요.
        </div>
      )}

      {/* ── 1. 유입 30일 ── */}
      <section className={`${CARD} flex flex-col gap-4`}>
        <div>
          <h2 className={H2}>유입 {kit.inflow.sinceLabel}</h2>
          <p className={MUTED}>
            page_view 랜딩의 referrer 를 채널로 묶은 것 — 분석 동의 표본이라 전체 방문의
            하한선입니다. 미리보기 도메인(vercel.app)은 뺐습니다.
          </p>
        </div>
        {kit.inflow.rows === null ? (
          <p className="text-[13px] font-bold text-[#e0c589]">
            유입 조회 실패(0건이 아니라 못 읽은 것) — <Link href="/admin/traffic" className="underline">트래픽</Link>{" "}
            화면에서 다시 확인해 주세요.
          </p>
        ) : (
          <ChannelBars rows={kit.inflow.rows} />
        )}

        <div className="border-t border-[rgba(255,255,255,.08)] pt-4">
          <h3 className="text-[13px] font-bold text-[#c9d2e0]">UTM 유입 (상위 8)</h3>
          {kit.inflow.utm === null ? (
            <p className="mt-1 text-[12px] text-[#e0c589]">UTM 조회 실패 — 없는 것이 아니라 못 읽은 것.</p>
          ) : utmTop.length === 0 ? (
            <p className={`mt-1 ${MUTED}`}>
              UTM 유입 없음 — 아래 글의 링크에는 utm 이 이미 붙어 있어요. 발행하면 여기서 세어집니다.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[#5f6b7d]">
                    <th className="py-1 pr-3 font-semibold">source</th>
                    <th className="py-1 pr-3 font-semibold">medium</th>
                    <th className="py-1 pr-3 font-semibold">campaign</th>
                    <th className="py-1 pr-3 text-right font-semibold">세션</th>
                    <th className="py-1 text-right font-semibold">랜딩</th>
                  </tr>
                </thead>
                <tbody className="text-[#e7ecf5]">
                  {utmTop.map((u, i) => (
                    <tr key={`${u.utm_source}|${u.utm_medium}|${u.utm_campaign}|${i}`} className="border-t border-[rgba(255,255,255,.06)]">
                      <td className="py-1 pr-3">{u.utm_source || "—"}</td>
                      <td className="py-1 pr-3">{u.utm_medium || "—"}</td>
                      <td className="py-1 pr-3 break-all">{u.utm_campaign || "—"}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{u.sessions.toLocaleString("ko-KR")}</td>
                      <td className="py-1 text-right tabular-nums">{u.landings.toLocaleString("ko-KR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── 2. 이번 주 실행 ── */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className={H2}>이번 주 실행 ({kit.weekTag})</h2>
          <p className={MUTED}>
            채널 다섯 곳, 각각 한 가지씩. 네이버는 유입이 거의 없으니 링크가 달린 글을 밖에
            내보내는 것이 이번 주의 핵심입니다.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className={CARD}>
            <h3 className="text-[13px] font-extrabold text-white">1. 네이버 블로그</h3>
            <p className={`mt-1 ${MUTED}`}>
              주간 시황은 <Link href="/admin/blog-pack" className="font-bold !text-ai-accent underline">블로그 팩</Link>
              , 단지 글은 아래 팩을 그대로 붙여넣습니다. 네이버 서치어드바이저에 RSS·사이트맵을 한 번
              제출해 두면 새 글이 네이버 검색에 잡힙니다.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              <li><Ext href="https://searchadvisor.naver.com/">서치어드바이저 열기</Ext></li>
              <li><Ext href={`${SITE}/feed.xml`}>{SITE}/feed.xml</Ext></li>
              <li><Ext href={`${SITE}/sitemap.xml`}>{SITE}/sitemap.xml</Ext></li>
            </ul>
          </div>
          <div className={CARD}>
            <h3 className="text-[13px] font-extrabold text-white">2. 네이버 카페 · 커뮤니티</h3>
            <p className={`mt-1 ${MUTED}`}>
              아래 팩의 &ldquo;짧은 글&rdquo;을 씁니다. 규칙 세 가지 — 광고 금지 카페는 존중하고
              올리지 않는다 · 사실(신고분 수치)만 적는다 · 같은 곳에는 주 1회만. 링크는 커뮤니티용
              utm 이 붙은 것을 씁니다.
            </p>
          </div>
          <div className={CARD}>
            <h3 className="text-[13px] font-extrabold text-white">3. 구글</h3>
            <p className={`mt-1 ${MUTED}`}>
              구글·AI 유입은 대부분 단지 페이지로 들어옵니다 — 단지 페이지가 검색의 현관입니다.
              Search Console 에서 단지 사이트맵 색인 수와 &ldquo;크롤됨 · 색인 안 됨&rdquo; 추이를 확인합니다.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              <li><Ext href="https://search.google.com/search-console">Search Console 열기</Ext></li>
              <li><Ext href={`${SITE}/sitemap-complexes.xml`}>{SITE}/sitemap-complexes.xml</Ext></li>
            </ul>
          </div>
          <div className={CARD}>
            <h3 className="text-[13px] font-extrabold text-white">4. AI 검색 (ChatGPT · Perplexity)</h3>
            <p className={`mt-1 ${MUTED}`}>
              llms.txt 가 라이브입니다 — 인용 형식(기준월·출처 병기)과 페이지 목록이 실데이터로
              찍힙니다. 단지 글에도 같은 출처 문장이 들어가므로 AI 가 인용할 때 근거가 따라갑니다.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              <li><Ext href={`${SITE}/llms.txt`}>{SITE}/llms.txt</Ext></li>
              <li><Ext href={`${SITE}/llms-full.txt`}>{SITE}/llms-full.txt</Ext></li>
            </ul>
          </div>
          <div className={CARD}>
            <h3 className="text-[13px] font-extrabold text-white">5. 카카오 · 공유</h3>
            <p className={`mt-1 ${MUTED}`}>
              임장노트 공개 시 나오는 공유 카드(카카오·링크 복사)가 지인 유입의 통로입니다. 카카오
              공유 키(NEXT_PUBLIC_KAKAO_JS_KEY):{" "}
              <span className={kakaoConfigured ? "font-bold text-[#7fd1a8]" : "font-bold text-[#e0c589]"}>
                {kakaoConfigured ? "설정됨" : "미설정 — 노트 카드에 카카오 버튼이 아예 그려지지 않습니다(링크 복사만)"}
              </span>
              .
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              <li>
                <Link href="/admin/traffic" className="text-[12px] font-bold !text-ai-accent underline underline-offset-2">
                  공유 유입 집계 (트래픽 화면)
                </Link>
              </li>
              <li>
                <Link href="/notes" className="text-[12px] font-bold !text-ai-accent underline underline-offset-2">
                  공개 임장노트 목록
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── 3. 단지 글 팩 ── */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className={H2}>단지 글 팩</h2>
          <p className={MUTED}>
            최근 30일 검색·AI 로 실제 랜딩된 단지를 먼저, 부족하면 거래 많은 단지로 채웠습니다.
            숫자는 단지 허브와 같은 로더에서 나와 사이트와 글이 같은 값을 말합니다.
          </p>
        </div>
        {kit.complexPacks.length === 0 ? (
          <div className={`${CARD} text-[13px] text-[#c9d2e0]`}>
            이번 킷에 단지 글이 없습니다 — 후보 단지를 읽지 못했거나(위 빠진 항목 참고) 12개월 안에
            신고된 매매가 없는 단지뿐이었습니다. 잠시 후 새로고침해 주세요.
          </div>
        ) : (
          kit.complexPacks.map((p, i) => <PackSection key={p.id} pack={p} index={i} />)
        )}
      </section>

      <div className="rounded-xl bg-[#141a26] px-4 py-3 text-[12px] leading-[1.7] text-[#8b94a6]">
        생성 시각: {new Date(kit.generatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (KST) ·
        수치는 국토교통부 신고분 실측 · 1시간 캐시 · 유입은 분석 동의 표본(하한선).
      </div>
    </div>
  );
}
