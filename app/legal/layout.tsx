import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { getBusinessInfo } from "@/lib/brand/business-info";

const NAV_ITEMS = [
  { href: "/legal/terms", label: "이용약관" },
  { href: "/legal/privacy", label: "개인정보처리방침" },
  { href: "/legal/expert", label: "전문가 운영정책" },
  { href: "/legal/community", label: "커뮤니티 운영정책" },
  { href: "/legal/fees", label: "거래·수수료" },
  { href: "/legal/location", label: "위치기반서비스 이용약관" },
  { href: "/legal/youth", label: "청소년 보호방침" },
  { href: "/legal/privacy-request", label: "개인정보 열람·정정·삭제" },
];

/* [v4 · 규칙 10·12] 가운데 한 줄(760px) · 사이드바 없음 — 왼쪽 문서 목록(lg 전용)과 문의 상자는 본문 **아래**
   "다른 법적 고지" 1px 선 목록 + 캡션으로 옮겼다(모바일에서도 보인다). PageShell 브레드크럼(글자뿐)은 본문 줄과 어긋나 뺐다. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const info = getBusinessInfo();
  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-10">
        {/* 본문 */}
        <div className="min-w-0">{children}</div>

        {/* 다른 법적 고지 */}
        <nav aria-labelledby="legal-nav-h" className="flex flex-col border-t border-line pt-5">
          <h2 id="legal-nav-h" className="t-section text-ink">
            다른 법적 고지
          </h2>
          <ul className="divide-y divide-line">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="press flex min-h-12 items-center justify-between gap-3 py-2.5 t-body text-text-1 no-underline"
                >
                  {item.label}
                  <span aria-hidden className="text-text-3">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 t-caption text-text-3">법적 고지 관련 문의 · 개인정보보호책임자 {info.privacyEmail}</p>
        </nav>
      </div>
    </PageShell>
  );
}
