import { safeAuth } from "@/lib/safe-auth";
import { admin2faGate } from "@/lib/auth/admin-2fa";

/* [1153] 관리자 API 도 2단계 인증을 본다 — 등록을 마친 계정은 확인 표식(12시간)이 있어야 통과한다.
   등록 전 계정은 예전처럼 통과(화면이 등록을 권한다). 저장소를 못 읽으면 막는다(장애가 우회가 되지 않게). */
export async function isAdminApiRequest(): Promise<boolean> {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email || session.user.role !== "admin") return false;
  return admin2faPassed(email);
}

/** [1156] 제 손으로 관리자 확인을 하는 API 가 붙여 쓰는 2단계 인증 확인 — 등록 계정은 확인 표식이 있어야 true. 이메일이 없으면 false */
export async function admin2faPassed(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const gate = await admin2faGate(email);
  return gate === "ok" || gate === "not-enrolled";
}
