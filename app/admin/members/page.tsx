import { redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";
import { canAccessAdminSection } from "@/lib/auth/staff-roles";
import { formatKstShortDate } from "@/lib/format/kst";
import { loadBasicStats, loadMembers } from "@/lib/admin/members";
import type { Tally } from "@/lib/admin/member-stats";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { logger } from "@/lib/log";

/* [1141 · 회원 조회] 가입 회원 목록(이메일 · 이름 검색 · 최근 50명) + 기본 정보 통계(연령대 · 지역 · 직업 · 보유 주택 · 이용 목적).
   개인정보는 줄여서 보인다 — 생년월일은 연령대, 휴대전화는 가운데 가림, 주소는 시·구까지. 전부 실집계 · 조회 실패는 실패로. */
export const dynamic = "force-dynamic";

const darkCard = "rounded-lg border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.05)]";

function TallyCard({ title, rows, total }: { title: string; rows: Tally; total: number }) {
  return (
    <section className={`${darkCard} flex flex-col gap-2 p-4`}>
      <h2 className="m-0 text-[13px] font-bold text-white">{title}</h2>
      {rows.length === 0 ? (
        <p className="m-0 text-[12px] text-[#9aa6b8]">자료 없음</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {rows.slice(0, 6).map((r) => (
            <li key={r.label} className="flex items-center gap-2 text-[12px] text-[#c9d2e0]">
              <span className="w-20 flex-none truncate">{r.label}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,.08)]">
                <span className="block h-full rounded-full bg-ai-accent" style={{ width: `${Math.round((r.count / Math.max(total, 1)) * 100)}%` }} />
              </span>
              <span className="w-8 flex-none text-right tabular-nums text-white">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function AdminMembersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await safeAuth();
  if (!canAccessAdminSection(session, "users")) redirect("/admin");
  const { q } = await searchParams;
  const [membersR, statsR] = await Promise.allSettled([loadMembers(q ?? null), loadBasicStats()]);
  if (membersR.status === "rejected") logger.error("[admin/members] 회원 조회 실패", membersR.reason);
  if (statsR.status === "rejected") logger.error("[admin/members] 기본 정보 통계 실패", statsR.reason);
  const members = membersR.status === "fulfilled" ? membersR.value : null;
  const stats = statsR.status === "fulfilled" ? statsR.value : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-[19px] font-bold text-white">
          회원{" "}
          <span className="text-[12px] font-medium text-[#9aa6b8]">
            {members?.total == null ? "전체 수 불러오기 실패" : `${members.query ? "검색 결과" : "전체"} ${members.total.toLocaleString("ko-KR")}명 · 최근 50명 표시`}
          </span>
        </h1>
        <form action="/admin/members" method="get" role="search" className="flex gap-2">
          <label htmlFor="member-q" className="sr-only">
            이메일 · 이름 검색
          </label>
          <input
            id="member-q"
            name="q"
            type="search"
            defaultValue={members?.query ?? ""}
            placeholder="이메일 · 이름"
            maxLength={60}
            className="h-10 w-56 rounded-lg border border-[rgba(255,255,255,.12)] bg-[rgba(255,255,255,.05)] px-3 text-[13px] !text-white placeholder:!text-[#7d8798]"
          />
          <button type="submit" className="h-10 rounded-lg bg-[rgba(126,162,255,.15)] px-4 text-[13px] font-bold text-ai-accent">
            검색
          </button>
        </form>
      </div>

      {stats ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <TallyCard title={`연령대 · 입력 ${stats.total}명`} rows={stats.age} total={stats.total} />
          <TallyCard title="지역(시·도)" rows={stats.region} total={stats.total} />
          <TallyCard title="직업" rows={stats.job} total={stats.total} />
          <TallyCard title="보유 주택" rows={stats.housing} total={stats.total} />
          <TallyCard title="이용 목적" rows={stats.purpose} total={stats.total} />
        </div>
      ) : (
        <ErrorState tone="admin" title="기본 정보 통계 불러오기 실패" desc="잠시 후 다시 · 입력이 0명이라는 뜻이 아닙니다." />
      )}

      {!members ? (
        <ErrorState tone="admin" title="회원 불러오기 실패" desc="잠시 후 다시 · 회원이 0명이라는 뜻이 아닙니다." />
      ) : members.rows.length === 0 ? (
        <p className={`${darkCard} m-0 p-5 text-[13px] text-[#9aa6b8]`}>{members.query ? "검색 결과 없음" : "회원 없음"}</p>
      ) : (
        <div className={`${darkCard} overflow-x-auto`}>
          <table className="w-full min-w-[920px] border-collapse text-left text-[13px] text-[#c9d2e0]">
            <thead>
              <tr className="text-[12px] text-[#9aa6b8]">
                {["가입일", "이름", "이메일", "요금제", "연령대", "지역", "휴대전화", "직업", "보유 주택", "이용 목적"].map((h) => (
                  <th key={h} scope="col" className="whitespace-nowrap border-b border-[rgba(255,255,255,.08)] px-3 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.rows.map((m) => (
                <tr key={m.email} className="border-b border-[rgba(255,255,255,.05)] last:border-b-0">
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{formatKstShortDate(m.joinedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-bold text-white">
                    {m.name}
                    {m.role !== "user" ? <span className="ml-1.5 text-[12px] font-medium text-ai-accent">{m.role}</span> : null}
                    {m.banned ? <span className="ml-1.5 text-[12px] font-medium text-[#ff8f85]">정지</span> : null}
                  </td>
                  <td className="px-3 py-2.5">{m.email}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{m.plan}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{m.ageBand}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{m.region}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{m.phone}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{m.job}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{m.housing}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{m.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="m-0 text-[12px] text-[#7d8798]">생년월일은 연령대로 · 휴대전화는 가운데 가림 · 주소는 시·구까지만 표시</p>
    </>
  );
}
