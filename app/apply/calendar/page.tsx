import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { AdZone } from "@/app/components/ads/AdZone";
import { ErrorState, EmptyState } from "@/app/components/ui/EmptyState";
import { buildApplyCalendar, weekSlugFor } from "@/lib/applyhome/calendar";
import { seoAlternates } from "@/lib/seo/alternates";

/* [개선 #17] 이번 주 청약 캘린더 — 접수 시작·마감을 날짜별로.
   "이번주 청약"은 매주 스스로 새로워지는 검색 수요다. 청약홈 실데이터의
   접수기간을 날짜로 묶어 보여준다 — 경쟁률·특공 표는 /apply 가 맡는다. */

/* [1010] 크롤러 재방문(≈2.2일)보다 짧은 TTL 은 크롤 1회 = 재렌더 1회다. 이 화면을 바꾸는
   적재(SOURCE_MAP)가 이제 경로를 직접 비우므로 시간 TTL 은 안전망으로만 둔다. */
export const revalidate = 21_600;

export const metadata: Metadata = {
  title: "이번 주 청약 캘린더 — 접수 시작·마감 일정 | 내집나우",
  description:
    "이번 주와 다음 달 아파트 청약 접수 시작·마감 일정을 날짜별로 정리했습니다. 청약홈(한국부동산원) 공공데이터 기준.",
  alternates: seoAlternates("/apply/calendar"),
  robots: { index: true, follow: true },
};

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function dateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00+09:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
}

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export default async function ApplyCalendarPage() {
  const cal = await buildApplyCalendar();
  const today = todayKst();

  return (
    <PageShell breadcrumb="동네이야기 › 청약 센터 › 청약 캘린더" title="청약 캘린더">
      {/* [1015] 데스크톱 2단 — 760px 한 열 옆이 비던 화면(브리프 규칙 F). 오른쪽 340px 레일 = 관련 링크 · 출처 · 광고 1.
          폰은 한 열, 레일은 본문 아래. */}
      <div className="mx-auto grid w-full max-w-[1080px] grid-cols-1 gap-4 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="rise-in mb-4 flex flex-wrap items-center gap-2 max-md:mb-3">
          {/* [1015] 안내문 → 사실 한 줄(브리프 규칙 D) */}
          <p className="min-w-0 flex-1 t-body text-text-2">
            앞으로 5주 <b className="text-ink">접수 시작·마감</b> · 청약홈(한국부동산원) 공공데이터
          </p>
          <Link
            href="/apply"
            className="chip press shrink-0 border border-line bg-surface px-3.5 py-2 t-sub font-bold text-primary no-underline"
          >
            경쟁률·특별공급 보기 ›
          </Link>
        </div>

        {cal.state === "unconfigured" ? (
          /* [1011] "공공데이터 연동이 설정되지 않았어요 / 연동이 켜지면 … 자동으로 채워집니다" 를
             걷었다(소유자 지시) — 연동 상태는 운영 쪽 말이다. 아직 못 보여 준다는 사실과 지금 어디서
             보면 되는지(아래 청약홈 링크)만 남긴다. */
          <EmptyState
            icon="lock"
            title="접수 일정 아직 없음"
            desc="준비되면 이 자리에 접수 일정 표시"
            action={{ href: "https://www.applyhome.co.kr", label: "청약홈에서 직접 보기 ↗" }}
          />
        ) : cal.state === "error" ? (
          <ErrorState
            title="청약 일정 불러오기 실패"
            desc="잠시 후 다시 시도해 주세요."
            cause={cal.cause}
            action={{ label: "청약 센터로 이동", href: "/apply" }}
          />
        ) : cal.days.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="앞으로 5주 안에 잡힌 접수 일정 없음"
            desc="새 모집공고가 올라오면 이 캘린더에 실립니다."
            action={{ href: "/apply", label: "전체 공고 보기" }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {cal.days.map((day, di) => (
              <section
                key={day.date}
                className={`rise-in-${Math.min(di + 1, 6)} card p-[18px] ${
                  day.date === today ? "border-primary/40" : ""
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="t-section text-ink">{dateLabel(day.date)}</h2>
                  {day.date === today && (
                    <span className="rounded-md bg-primary-soft px-1.5 py-0.5 t-caption font-bold text-primary">
                      오늘
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  {day.starts.map((it, i) => (
                    <CalendarRow key={`s${i}`} kind="start" it={it} />
                  ))}
                  {day.ends.map((it, i) => (
                    <CalendarRow key={`e${i}`} kind="end" it={it} />
                  ))}
                </div>
              </section>
            ))}
            <p className="text-center t-sub text-text-3">
              {/* [994] 저장소(매일 적재)면 기준 시각을, 라이브면 그 사실을 적는다 */}
              {cal.source === "store"
                ? `${new Date(cal.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} 기준 · 매일 갱신`
                : "청약홈 즉시 조회 기준"}
              {" "}· 정확한 일정·자격은 청약홈 공고 원문을 확인하세요
            </p>
          </div>
        )}
        {/* [#53] 주간 아카이브 링크 — 지난 주 일정은 고정 URL 로 남는다 */}
        <div className="mt-5 flex flex-wrap justify-center gap-2 max-md:mt-3">
          {[weekSlugFor(-2), weekSlugFor(-1), weekSlugFor(0)].map((s) => (
            <Link
              key={s}
              href={`/apply/calendar/${s}`}
              className="chip border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-2 no-underline"
            >
              {s === weekSlugFor(0) ? "이번 주 아카이브" : `${s} 일정`}
            </Link>
          ))}
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-3">
        <div className="card flex flex-col gap-1.5 p-[18px] max-md:p-3.5">
          <div className="t-body font-bold text-ink">관련 데이터</div>
          {[
            { href: "/apply", label: "청약 경쟁률 · 특별공급" },
            { href: "/supply", label: "입주 물량" },
            { href: "/auctions", label: "공매 물건" },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary no-underline">
              {l.label} ›
            </Link>
          ))}
          <a
            href="https://www.applyhome.co.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary no-underline"
          >
            청약홈 공고 원문 ↗
          </a>
        </div>
        <p className="px-1 t-caption text-text-3">
          출처 청약홈(한국부동산원) 공공데이터 ·{" "}
          <Link href="/data-sources" className="font-bold text-primary no-underline">
            데이터 출처와 한계
          </Link>
        </p>
      </aside>
      </div>
      {/* [1015] 광고 — 페이지 끝 1곳(브리프 규칙 G: 첫 화면 밖). 레일은 짧아 데스크톱 첫 화면 안에 들어오므로 본문 뒤에 둔다 */}
      <AdZone placement="page_bottom" seed={0} plan={null} className="mx-auto mt-6 w-full max-w-[1080px] max-md:mt-4" />
    </PageShell>
  );
}

function CalendarRow({
  kind,
  it,
}: {
  kind: "start" | "end";
  it: {
    houseName: string;
    region: string;
    houseKind: string | null;
    receiptStart: string | null;
    receiptEnd: string | null;
    portalUrl: string | null;
  };
}) {
  const body = (
    <>
      <span
        className={`shrink-0 rounded-md px-1.5 py-0.5 t-caption font-bold ${
          kind === "start" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
        }`}
      >
        {kind === "start" ? "접수 시작" : "접수 마감"}
      </span>
      <span className="min-w-0 flex-1 truncate t-body font-bold text-ink">
        {it.houseName}
        <span className="ml-1.5 t-sub font-medium text-text-3">
          {it.region}
          {it.houseKind ? ` · ${it.houseKind}` : ""}
        </span>
      </span>
      {it.portalUrl && <span className="shrink-0 t-sub font-bold text-primary">공고 ↗</span>}
    </>
  );
  return it.portalUrl ? (
    <a
      href={it.portalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2 no-underline"
    >
      {body}
    </a>
  ) : (
    <div className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2">{body}</div>
  );
}
