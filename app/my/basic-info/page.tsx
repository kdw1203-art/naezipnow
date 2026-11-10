import { redirect } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { safeAuth } from "@/lib/safe-auth";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { BasicInfoComplete } from "./BasicInfoComplete";

/* [1138 · 필수 기본 정보 완성] 소셜 가입(카카오 · 토스 · Google) · 1138 이전 가입자처럼 기본 정보가 비어 있는 회원을
   BasicInfoGate 가 여기로 보낸다. 다 채우면 ?next= (내부 경로만)로 돌아간다. */
export const metadata = buildPageMetadata({
  title: "기본 정보 입력",
  description: "생년월일 · 주소 · 휴대전화 · 직업 · 보유 주택 · 이용 목적을 입력합니다.",
  path: "/my/basic-info",
  noIndex: true,
});

export default async function BasicInfoPage() {
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/login?callbackUrl=%2Fmy%2Fbasic-info");
  return (
    <PageShell title="기본 정보 입력" breadcrumb="마이 › 기본 정보">
      <BasicInfoComplete />
    </PageShell>
  );
}
