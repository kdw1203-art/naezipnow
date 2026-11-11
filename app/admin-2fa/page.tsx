import { redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";
import { canAccessAdminConsole } from "@/lib/auth/staff-roles";
import { Admin2faClient } from "./Admin2faClient";

/* [1147] 관리자 2단계 인증 — 등록(QR · 열쇠) 또는 번호 확인. /admin 밖에 둔다(관리자 레이아웃이 여기로 보내므로 안에 두면 맴돈다). */
export const dynamic = "force-dynamic";
export const metadata = { title: "관리자 2단계 인증 | 내집나우", robots: { index: false, follow: false } };

export default async function Admin2faPage() {
  const session = await safeAuth();
  if (!session) redirect("/login?callbackUrl=/admin-2fa");
  if (!canAccessAdminConsole(session)) redirect("/");
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center gap-4 px-5 py-10">
      <h1 className="m-0 t-title text-ink">관리자 2단계 인증</h1>
      <Admin2faClient />
    </main>
  );
}
