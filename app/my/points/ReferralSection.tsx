/* [1012] 규칙 1·2 — 본문 카드 반경 12px→8px(rounded-3xl→rounded-lg 5곳). */
/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 2곳을 font-bold(700)로 바꿨다. */
import Link from "next/link";
import { headers } from "next/headers";
import { getReferralStats, getReferralLeaderboard } from "@/lib/referral/store";
import { CopyLink } from "./CopyLink";
import { ShareRow } from "./ShareRow";

/**
 * 마이 · 친구 추천 — 리치 대시보드.
 * 내 코드/초대 링크 + 공유 버튼(카카오·링크복사·문자) + 성과(초대 수·적립 P)
 * + 초대 여정 배지 + "이렇게 초대돼요" 3-step 안내.
 * 데이터는 기존 getReferralStats(= GET /api/referral 와 동일 shape) 만 사용한다.
 */



const FALLBACK_ORIGIN = "https://naezipnow.com";

/** 초대 여정 배지 — 실제 추가 적립을 약속하지 않는 순수 동기부여 지표. */
const MILESTONES: { n: number; label: string }[] = [
  { n: 1, label: "첫 초대" },
  { n: 3, label: "친구 셋" },
  { n: 5, label: "인기 초대" },
  { n: 10, label: "초대왕" },
];

async function currentOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return host ? `${proto}://${host}` : FALLBACK_ORIGIN;
}

/* [v4 · 한 화면 한 가지] 유리 가운데 히어로(선물 아이콘 원) · 아이콘 칸 성과 · 원형 배지 4개 + 진행 막대 · 아이콘 원 3단계 ·
   회색 알약 리더보드 → 섹션 제목 + 1px 선 행(오른쪽 숫자). 코드·링크 복사·공유·성과·여정·리더보드 기능은 그대로. */

const ROW = "flex min-h-12 items-center justify-between gap-3 py-2.5";

/** 초대 여정 — invitedCount 기준 달성/남은 수를 행으로 */
function MilestoneRows({ invitedCount }: { invitedCount: number }) {
  const next = MILESTONES.find((m) => invitedCount < m.n) ?? null;
  return (
    <section aria-labelledby="ref-journey-h" className="flex flex-col">
      <h2 id="ref-journey-h" className="t-section text-ink">
        초대 여정
      </h2>
      <p className="t-caption text-text-3">
        {next ? `${next.label}까지 ${next.n - invitedCount}명 · ` : "모든 배지 달성 · "}초대 성사마다 나와 친구 모두 300P
      </p>
      <ul data-tone="sand" className="mt-1 divide-y divide-line">
        {MILESTONES.map((m) => {
          const reached = invitedCount >= m.n;
          return (
            <li key={m.n} className={ROW}>
              <span className={`t-body font-bold ${reached ? "text-ink" : "text-text-3"}`}>{m.label}</span>
              <span className={`shrink-0 t-body t-num ${reached ? "text-primary" : "text-text-3"}`}>
                {reached ? `${m.n}명 달성` : `${m.n}명`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* [994] /my/points?tab=referral 의 한 탭(옛 /my/referral). 로그인은 부모(points)가 보장한다. */
export async function ReferralSection({ email }: { email: string }) {
  const [stats, origin, leaders] = await Promise.all([
    getReferralStats(email),
    currentOrigin(),
    getReferralLeaderboard(email, 10),
  ]);
  const code = stats.code;
  const link = code ? `${origin}/invite/${code}` : null;

  return (
    <div className="flex flex-col gap-8">
      {/* ── 주인공: 코드 + 링크 + 공유 (h1 은 부모 탭 머리 "포인트") ── */}
      <section aria-labelledby="ref-h" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="ref-h" className="t-section text-ink">
            친구 초대 · 둘 다 300P
          </h2>
          <p className="t-sub text-text-3">내 링크로 친구가 가입하면 친구와 나 모두 300P 적립</p>
        </div>
        {code ? (
          <>
            <div className="flex flex-col gap-1">
              <p className="t-sub font-bold text-text-2">내 추천 코드</p>
              <CopyLink value={code} variant="code" />
            </div>
            {link && <CopyLink value={link} variant="link" />}
            {link && <ShareRow link={link} code={code} />}
          </>
        ) : (
          <p className="t-body text-text-3">코드 준비 중 · 잠시 후 새로고침</p>
        )}
      </section>

      {/* ── 성과 — 못 센 것을 "0명"·"0P"로 그리지 않는다(아직 아무도 초대 못 한 사람과 지금 셀 수 없는 사람은 다르다) ── */}
      <section aria-labelledby="ref-stats-h" className="flex flex-col">
        <h2 id="ref-stats-h" className="t-section text-ink">
          초대 성과
        </h2>
        <ul data-tone="mint" className="divide-y divide-line">
          <li className={ROW}>
            <span className="t-body font-bold text-ink">초대 성공</span>
            <span className="shrink-0 t-body t-num text-ink">
              {stats.invitedCount === null ? "—" : `${stats.invitedCount.toLocaleString("ko-KR")}명`}
            </span>
          </li>
          <li className={ROW}>
            <span className="t-body font-bold text-ink">적립 포인트</span>
            <span className="shrink-0 t-body t-num text-primary">
              {stats.pointsEarned === null ? "—" : `${stats.pointsEarned.toLocaleString("ko-KR")}P`}
            </span>
          </li>
        </ul>
        {stats.invitedCount === null && (
          <p className="t-caption text-text-3">초대 성과 조회 실패 · 초대 링크는 그대로 사용 가능 · 적립은 다시 열면 반영</p>
        )}
      </section>

      {/* ── 초대 여정 — 성사 수를 모르면 접는다(0으로 그리면 이미 초대한 사람에게 거짓말) ── */}
      {stats.invitedCount !== null && <MilestoneRows invitedCount={stats.invitedCount} />}

      {/* ── 이렇게 초대돼요 ── */}
      <section aria-labelledby="ref-how-h" className="flex flex-col">
        <h2 id="ref-how-h" className="t-section text-ink">
          이렇게 초대돼요
        </h2>
        <ol data-tone="hanji" className="divide-y divide-line">
          {[
            "초대 링크 공유 · 카카오톡·문자로 링크나 코드 보내기",
            "친구 가입 · 링크로 접속해 가입 완료",
            "둘 다 300P · 친구와 나에게 각각 자동 적립",
          ].map((t, i) => (
            <li key={t} className="flex min-h-12 items-center gap-3 py-2.5">
              <span className="t-num w-4 shrink-0 text-primary">{i + 1}</span>
              <span className="min-w-0 t-body text-text-1">{t}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* [#100] 추천 리더보드 — 초대의 사회적 동기. 못 읽으면 섹션 생략(0명 위장 금지) */}
      {leaders !== null && leaders.length > 0 && (
        <section aria-labelledby="ref-board-h" className="flex flex-col">
          <h2 id="ref-board-h" className="t-section text-ink">
            추천 리더보드
          </h2>
          <p className="t-caption text-text-3">가장 많이 초대한 이웃 · 익명 표시</p>
          <ol data-tone="blue" className="mt-1 list-none divide-y divide-line p-0">
            {leaders.map((l, i) => (
              <li key={`${l.label}-${i}`} className={`${ROW} ${l.isMe ? "-mx-1.5 bg-primary-soft px-1.5" : ""}`}>
                <span className="flex min-w-0 items-center gap-3">
                  <span className="t-num w-5 shrink-0 text-primary">{i + 1}</span>
                  <span className="min-w-0 truncate t-body font-bold text-ink">
                    {l.label}
                    {l.isMe && <span className="ml-1 t-sub font-bold text-primary">나</span>}
                  </span>
                </span>
                <span className="shrink-0 t-sub font-bold tabular-nums text-text-2">
                  {l.count.toLocaleString("ko-KR")}명 초대
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <Link href="/my/points" className="press self-start py-[5px] t-sub font-semibold text-text-3 no-underline">
        적립된 포인트는 지갑에서 확인 ›
      </Link>
    </div>
  );
}
