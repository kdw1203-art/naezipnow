import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { ErrorState, EmptyState } from "@/app/components/ui/EmptyState";
import {
  buildApplyWeek,
  parseWeekSlug,
  weekSlugFor,
} from "@/lib/applyhome/calendar";
import { seoAlternates } from "@/lib/seo/alternates";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

/* [#53] 주간 청약 아카이브 — /apply/calendar/2026-w35 형태의 고정 URL.
 * "이번주 청약"(캘린더)과 달리 이 페이지는 특정 주의 일정으로 고정돼,
 * 매주 새 URL 이 쌓이는 프로그래매틱 축이 된다. 데이터 커버리지는 최신 공고
 * 400건 — 오래된 주는 공고가 그 창을 벗어나 비어 보일 수 있어, 그 사실을
 * 화면에 명기한다(없는 데이터를 있는 척하지 않는다). */

/* [1010] 크롤러 재방문(≈2.2일)보다 짧은 TTL 은 크롤 1회 = 재렌더 1회다. 이 화면을 바꾸는
   적재(SOURCE_MAP)가 이제 경로를 직접 비우므로 시간 TTL 은 안전망으로만 둔다. */
export const revalidate = 86_400;

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function dateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00+09:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
}

function weekLabel(slug: string, range: { start: string; end: string }): string {
  const s = new Date(`${range.start}T00:00:00+09:00`);
  const weekNo = slug.split("-w")[1];
  return `${s.getFullYear()}년 ${s.getMonth() + 1}월 ${weekNo}주차`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ week: string }>;
}): Promise<Metadata> {
  const { week } = await params;
  const range = parseWeekSlug(week);
  /* 메타데이터 단계에서 404 를 확정해야 상태코드가 200 으로 굳지 않는다
     (ISR 스트리밍은 본문 notFound() 시점엔 이미 헤더를 보낸 뒤다 — 로컬 실측). */
  if (!range) notFound();
  const label = weekLabel(week, range);
  return {
    title: `${label} 청약 일정 — 접수 시작·마감 | 내집나우`,
    description: `${range.start}~${range.end} 아파트 청약 접수 시작·마감 일정. 청약홈(한국부동산원) 공공데이터 기준.`,
    alternates: seoAlternates(`/apply/calendar/${week.toLowerCase()}`),
    robots: { index: true, follow: true },
  };
}

export default async function ApplyWeekPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  const slug = week.toLowerCase();
  /* 슬러그 검증은 데이터 조회 **전에** 동기로 — await 뒤의 notFound() 는 스트리밍이
     시작된 뒤라 상태코드가 200 으로 굳는 soft-404 가 된다(로컬 실측). */
  const range = parseWeekSlug(slug);
  if (range === null) notFound();
  const result = await buildApplyWeek(range);
  if (result === null) notFound();
  const label = range ? weekLabel(slug, range) : slug;
  const thisWeek = weekSlugFor(0);

  const itemCount =
    result.state === "ok" ? result.days.reduce((n, d) => n + d.starts.length + d.ends.length, 0) : 0;

  return (
    /* [v4] "한 화면 한 가지" — /apply/calendar 와 같은 모양: 제목 한 줄 + 사실 한 줄(기간 · 건수) · 오른쪽 작은 링크 →
       날짜별 1px 선 행 → 다른 주 글자 링크 한 줄 → 출처 캡션 한 줄. 브레드크럼 문자열 · 날짜 카드 · 면 배지 · 주 칩을 뺐다. */
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="t-title text-ink">{label} 청약 일정</h1>
            {/* [1012] 규칙 6·7 → [v4 · 규칙 1] 기간 · 건수 한 줄(출처는 맨 끝 캡션) */}
            <p className="mt-0.5 t-sub text-text-3">
              {range ? `${range.start} ~ ${range.end}` : slug}
              {itemCount > 0 ? ` · 접수 시작·마감 ${itemCount}건` : ""}
            </p>
          </div>
          <Link href="/apply/calendar" className="btn-outline btn-sm shrink-0 no-underline">
            {/* [1012] 규칙 5 — 동사 + 대상 */}
            이번 주 일정 보기
          </Link>
        </header>

        {result.state === "unconfigured" ? (
          /* [1011] "공공데이터 연동이 설정되지 않았어요 / 연동이 켜지면 … 자동으로 채워집니다" 를
             걷었다(소유자 지시) — 연동 상태는 운영 쪽 말이다. 아직 못 보여 준다는 사실과 지금 어디서
             보면 되는지(아래 청약홈 링크)만 남긴다. */
          <EmptyState
            icon="lock"
            title="청약 접수 일정을 아직 보여 줄 수 없어요"
            desc="준비되면 이 자리에 그 주의 접수 일정이 채워져요. 지금은 청약홈 공고에서 볼 수 있어요."
            action={{ href: "https://www.applyhome.co.kr", label: "청약홈 공고 보기 ↗" }}
          />
        ) : result.state === "error" ? (
          <ErrorState
            title="청약 일정을 지금 불러오지 못했어요"
            desc="일정이 없는 게 아니라 조회 자체가 실패했어요. 잠시 후 다시 열어 주세요."
            cause={result.cause}
            action={{ label: "청약 경쟁률 보기", href: "/apply" }}
          />
        ) : result.days.length === 0 ? (
          <EmptyState
            icon="calendar"
            title={`${label}에 잡힌 청약 접수 일정이 없어요`}
            /* [1012] 규칙 5·6 — "확인하세요" → 사실. 모수(최근 공고 400건) 명시 */
            desc="이 주에 접수가 없었거나, 오래된 주라 최근 공고 400건 창을 벗어났을 수 있어요. 지난 일정 원문은 청약홈에 있어요."
            action={{ href: "/apply/calendar", label: "이번 주 일정 보기" }}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {result.days.map((day, i) => (
              <section key={day.date} aria-label={dateLabel(day.date)} className="flex flex-col gap-1">
                <h2 className="t-section text-ink">{dateLabel(day.date)}</h2>
                {/* [v4.1 · 리퀴드 목록] 접수 일정 = sand, 이웃한 날은 blue 로 번갈아 */}
                <ul data-tone={i % 2 === 0 ? "sand" : "blue"} className="divide-y divide-line">
                  {day.starts.map((it, i) => (
                    <WeekRow key={`s${i}`} kind="start" it={it} />
                  ))}
                  {day.ends.map((it, i) => (
                    <WeekRow key={`e${i}`} kind="end" it={it} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1">
          {/* 주간 네비 — 지난주·이번주만 (미래 주는 캘린더가 담당). [v4] 칩 → 글자 링크 한 줄 */}
          <nav aria-label="다른 주" className="t-sub text-text-3">
            다른 주 —{" "}
            {[weekSlugFor(-2), weekSlugFor(-1), thisWeek]
              .filter((s) => s !== slug)
              .map((s, i) => (
                <span key={s}>
                  {i > 0 && " · "}
                  <Link href={`/apply/calendar/${s}`} className="tap-line font-bold text-text-2 no-underline">
                    {s === thisWeek ? "이번 주" : s}
                  </Link>
                </span>
              ))}
          </nav>
          <p className="t-caption text-text-3">
            청약홈(한국부동산원) 공공데이터 · 최근 공고 400건 기준 · 일정·자격은 청약홈 공고 원문 우선
          </p>
        </div>
      </div>
    </PageShell>
  );
}

function WeekRow({
  kind,
  it,
}: {
  kind: "start" | "end";
  it: {
    houseName: string;
    region: string;
    houseKind: string | null;
    portalUrl: string | null;
    /** [#109] 당첨자 발표일 — 지난 주에는 "결과 발표됨/발표 예정"으로 표기 */
    winnerDate?: string | null;
  };
}) {
  const today = new Date().toISOString().slice(0, 10);
  const winner = it.winnerDate ?? null;
  const winnerLabel =
    winner === null
      ? null
      : winner <= today
        ? `결과 발표됨 (${winner.slice(5).replace("-", ".")})`
        : `발표 ${winner.slice(5).replace("-", ".")}`;
  /* [v4 · 규칙 5·6] 행 = 왼쪽 단지명(굵게) + 지역 · 유형 · 발표 한 줄 / 오른쪽 접수 시작·마감(의미색 글자) + 공고 ↗ */
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate t-body font-bold text-ink">{it.houseName}</span>
        <span className="mt-0.5 block truncate t-sub text-text-3">
          {it.region}
          {it.houseKind ? ` · ${it.houseKind}` : ""}
          {winnerLabel ? ` · ${winnerLabel}` : ""}
        </span>
      </span>
      <span className={`shrink-0 t-sub font-bold ${kind === "start" ? "text-success" : "text-warning"}`}>
        {kind === "start" ? "접수 시작" : "접수 마감"}
        {it.portalUrl && <span className="ml-1.5 text-primary">공고 ↗</span>}
      </span>
    </>
  );
  return (
    <li>
      {it.portalUrl ? (
        <a
          href={it.portalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-14 items-center gap-3 py-3 no-underline"
        >
          {body}
        </a>
      ) : (
        <div className="flex min-h-14 items-center gap-3 py-3">{body}</div>
      )}
    </li>
  );
}
