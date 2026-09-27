import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { ErrorState, EmptyState } from "@/app/components/ui/EmptyState";
import { buildApplyCalendar, weekSlugFor } from "@/lib/applyhome/calendar";
import { seoAlternates } from "@/lib/seo/alternates";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

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

/* [1012] 규칙 6 — 출처·시점 줄("청약홈 · 9월 26일 기준")의 날짜 토막 */
function asOfShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
}

export default async function ApplyCalendarPage() {
  const cal = await buildApplyCalendar();
  const today = todayKst();
  const thisWeek = weekSlugFor(0);

  return (
    /* [v4] "한 화면 한 가지" — 가운데 한 줄(760px): 제목 한 줄 + 사실 한 줄(건수만) · 오른쪽 작은 링크 →
       날짜별 1px 선 행 목록 → 지난 일정 글자 링크 한 줄 → 출처 캡션 한 줄.
       지운 것: 브레드크럼 문자열 · 날짜 카드(카드 안 회색 상자 행 = 카드 안에 카드) · "접수 시작/마감" 면 배지(→ 행 오른쪽
       의미색 글자) · "오늘" 배지(→ 날짜 옆 글자) · 아카이브 칩(→ 글자 링크) · 끝 설명 문장("…원문이 우선해요" → 캡션 명사형). */
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="t-title text-ink">청약 캘린더</h1>
            {/* [1012] 규칙 6·7 → [v4 · 규칙 1] 사실 한 줄은 숫자만 — 출처·기준 시점은 맨 끝 캡션 */}
            {cal.state === "ok" && cal.totalInWindow > 0 && (
              <p className="mt-0.5 t-sub text-text-3">
                앞으로 5주 접수 시작·마감 {cal.totalInWindow.toLocaleString("ko-KR")}건
              </p>
            )}
          </div>
          <Link href="/apply" className="btn-outline btn-sm shrink-0 no-underline">
            경쟁률·특별공급 보기
          </Link>
        </header>

        {cal.state === "unconfigured" ? (
          /* [1011] "공공데이터 연동이 설정되지 않았어요 / 연동이 켜지면 … 자동으로 채워집니다" 를
             걷었다(소유자 지시) — 연동 상태는 운영 쪽 말이다. 아직 못 보여 준다는 사실과 지금 어디서
             보면 되는지(아래 청약홈 링크)만 남긴다. */
          <EmptyState
            icon="lock"
            title="청약 접수 일정을 아직 보여 줄 수 없어요"
            desc="준비되면 이 자리에 앞으로 5주 접수 일정이 채워져요. 지금은 청약홈 공고에서 볼 수 있어요."
            action={{ href: "https://www.applyhome.co.kr", label: "청약홈 공고 보기 ↗" }}
          />
        ) : cal.state === "error" ? (
          <ErrorState
            title="청약 일정을 지금 불러오지 못했어요"
            desc="일정이 없는 게 아니라 조회 자체가 실패했어요. 잠시 후 다시 열어 주세요."
            cause={cal.cause}
            action={{ label: "청약 경쟁률 보기", href: "/apply" }}
          />
        ) : cal.days.length === 0 ? (
          /* [1012] 규칙 6 — 언제(앞으로 5주)·출처·기준 시점(청약홈 ○월 ○일) */
          <EmptyState
            icon="calendar"
            title="앞으로 5주 안에 잡힌 청약 접수 일정이 없어요"
            desc={`청약홈 ${asOfShort(cal.fetchedAt)} 기준 · 새 모집공고가 올라오면 이 캘린더에 실려요`}
            action={{ href: "/apply", label: "청약 경쟁률 보기" }}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {cal.days.map((day, i) => (
              <section key={day.date} aria-label={dateLabel(day.date)} className="flex flex-col gap-1">
                <h2 className="t-section text-ink">
                  {dateLabel(day.date)}
                  {day.date === today && <span className="ml-1.5 t-sub font-bold text-primary">오늘</span>}
                </h2>
                {/* [v4.1 · 리퀴드 목록] 접수 일정 = sand, 이웃한 날은 blue 로 번갈아 — 같은 색이 붙지 않는다 */}
                <ul data-tone={i % 2 === 0 ? "sand" : "blue"} className="divide-y divide-line">
                  {day.starts.map((it, i) => (
                    <CalendarRow key={`s${i}`} kind="start" it={it} />
                  ))}
                  {day.ends.map((it, i) => (
                    <CalendarRow key={`e${i}`} kind="end" it={it} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1">
          {/* [#53] 주간 아카이브 링크 — 지난 주 일정은 고정 URL 로 남는다. [v4] 칩 → 글자 링크 한 줄 */}
          <nav aria-label="주간 아카이브" className="t-sub text-text-3">
            주간 아카이브 —{" "}
            {[weekSlugFor(-2), weekSlugFor(-1), thisWeek].map((s, i) => (
              <span key={s}>
                {i > 0 && " · "}
                <Link href={`/apply/calendar/${s}`} className="tap-line font-bold text-text-2 no-underline">
                  {s === thisWeek ? "이번 주" : s}
                </Link>
              </span>
            ))}
          </nav>
          {cal.state === "ok" && (
            <p className="t-caption text-text-3">
              {/* [994] 저장소(매일 적재)면 기준 시각을, 라이브면 그 사실을 적는다 */}
              {/* [1012] 규칙 5·6 — "확인하세요" → 사실 서술. "적재"(내부 말) 도 뺐다 */}
              {cal.source === "store" ? `청약홈(한국부동산원) ${asOfShort(cal.fetchedAt)} 기준 · 매일 자동 갱신` : "청약홈(한국부동산원) 즉시 조회"}
              {" "}· 일정·자격은 청약홈 공고 원문 우선
            </p>
          )}
        </div>
      </div>
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
  /* [v4 · 규칙 5·6] 행 = 왼쪽 단지명(굵게) + 지역 · 유형 한 줄 / 오른쪽 "접수 시작"·"접수 마감"(의미색 글자) + 공고 ↗ */
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate t-body font-bold text-ink">{it.houseName}</span>
        <span className="mt-0.5 block truncate t-sub text-text-3">
          {it.region}
          {it.houseKind ? ` · ${it.houseKind}` : ""}
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
