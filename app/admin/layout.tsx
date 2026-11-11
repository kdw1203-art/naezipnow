import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";
import { canAccessAdminConsole } from "@/lib/auth/staff-roles";
import { AdminNav } from "./AdminNav";
import { loadCriticalAlerts24h } from "@/lib/admin/health-alerts";
import { loadAdminQueueCounts } from "@/lib/admin/queue-counts";
import { admin2faGate } from "@/lib/auth/admin-2fa";
import { criticalAlertNames } from "@/lib/admin/health-alerts-fold";

export const metadata: Metadata = {
  /* [970 · C-25] 제목 접미 통일 — 사이트 전체 `| 내집나우`(`·`·`—` 혼용 제거) */
  title: "관리자 콘솔 | 내집나우",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 관리자 접근 제어 (구 코드베이스 staff-roles 재사용) — 12o RBAC
  const session = await safeAuth();
  if (!session) {
    redirect("/login?callbackUrl=/admin");
  }
  if (!canAccessAdminConsole(session)) {
    redirect("/");
  }
  /* [1147] 2단계 인증 — 등록을 마친 계정은 번호 확인(12시간) 없이는 못 들어온다. 등록 전이면 통과시키고 아래에서 등록을 권한다.
     상태를 못 읽으면("error") 등록 안 함으로 읽지 않는다 — 확인 화면으로 보낸다(거기서도 못 읽으면 실패로 보인다). */
  const email2fa = session.user?.email?.trim().toLowerCase() ?? "";
  const gate = email2fa ? await admin2faGate(email2fa) : "error";
  if (gate === "need-code" || gate === "error") redirect("/admin-2fa");
  /* [G001 2026-08-31] critical 경보는 어느 관리자 화면에서든 먼저 보인다.
     billing-renewals 가 4일 넘게 critical 이었는데, 신선도 서브 페이지에
     들어가야만 보였다 — 대시보드에 살면서도 장애를 모를 수 있었다.
     [999] 지금 울리는 것만 센다 — 그친 경보는 운영 콘솔 판에 "해소"로 남는다. */
  /* [1141] 메뉴 옆 처리 대기 숫자 — 실집계 · 못 읽으면 숫자 없음 */
  const [criticals, badges] = await Promise.all([
    loadCriticalAlerts24h().catch(() => []),
    loadAdminQueueCounts().catch((): Record<string, number> => ({})),
  ]);
  const criticalNames = criticalAlertNames(criticals);
  return (
    <div className="flex min-h-screen flex-col bg-[#12161f] md:flex-row">
      {/* 사이드바 (모바일: 상단 바) */}
      <aside className="flex flex-shrink-0 flex-col border-b border-[rgba(255,255,255,.07)] py-5 md:min-h-screen md:w-[220px] md:border-b-0 md:border-r">
        <Link
          href="/admin"
          className="flex items-center gap-[7px] px-5 pb-[18px]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 2.6 L22 10.4 V20 a1.4 1.4 0 0 1 -1.4 1.4 H14.8 V14.6 H9.2 V21.4 H3.4 A1.4 1.4 0 0 1 2 20 V10.4 Z"
              fill="#7ea2ff"
            />
          </svg>
          <span className="text-[15px] font-bold !text-white">
            내집나우 Admin
          </span>
        </Link>
        <AdminNav badges={badges} />
        <div className="mt-auto hidden px-5 pt-6 text-[12px] text-[#9aa6b8] md:block">
          <Link href="/" className="!text-[#9aa6b8] hover:!text-[#c9d2e0]">
            ← 서비스로 돌아가기
          </Link>
        </div>
      </aside>

      {/* 본문 */}
      <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
        {criticals.length > 0 && (
          <a
            href="/admin/ops"
            className="block rounded-xl border border-[#7a2a2a] bg-[#2a1616] px-4 py-3 text-[13px] leading-relaxed !text-[#ffb4a8] no-underline hover:bg-[#331a1a]"
          >
            <b>심각 경보 {criticals.length}건 진행 중</b> —{" "}
            {/* [1045] 경보는 검사·대상 단위로 접힌다 — 한 검사에 문제가 둘이면 이름이 두 번 나오므로 이름은 한 번만, 건수를 붙인다 */}
            {criticalNames.slice(0, 3).join(" · ")}
            {criticalNames.length > 3 ? " 외" : ""} · 운영 콘솔에서 확인 →
          </a>
        )}
        {gate === "not-enrolled" && (
          <a
            href="/admin-2fa"
            className="block rounded-xl border border-[rgba(126,162,255,.35)] bg-[rgba(126,162,255,.08)] px-4 py-3 text-[13px] leading-relaxed !text-[#c9d7ff] no-underline hover:bg-[rgba(126,162,255,.14)]"
          >
            <b>2단계 인증 미등록</b> — 관리자 화면에 회원 정보가 있습니다 · 인증 앱 등록 →
          </a>
        )}
        {children}
      </main>
    </div>
  );
}
