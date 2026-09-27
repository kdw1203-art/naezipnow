import type { Metadata } from "next";
import Link from "next/link";
import { getBusinessInfo } from "@/lib/brand/business-info";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* [970 · A-31] 하위 8개 정책 페이지는 전부 buildPageMetadata(path) 로 canonical 이 있는데
   인덱스만 없었다 — 사이트맵에 있는 URL 이라 같은 경로로 canonical·OG 를 붙인다. */
/* [v4 · 규칙 1·5·10] 레이아웃·글자만 정리(문구는 그대로): 가운데 한 줄 760px · 본문 카드 면 제거 · 제목 t-title(800 → 700) ·
   섹션 제목 t-section 한 단계로 통일 · 섹션 카드 → 위 1px 선. 법적 문구는 한 글자도 바꾸지 않았다. */
export const metadata: Metadata = buildPageMetadata({
  title: "법적 고지",
  description: "이용약관, 개인정보처리방침, 위치/청소년 정책과 개인정보 열람 안내",
  path: "/legal",
});

const ITEMS = [
  {
    href: "/legal/terms",
    title: "이용약관",
    desc: "서비스 이용 조건, 권리·의무, 책임 범위를 확인합니다.",
  },
  {
    href: "/legal/privacy",
    title: "개인정보처리방침",
    desc: "개인정보 수집·이용·보관·파기와 이용자 권리를 안내합니다.",
  },
  {
    href: "/legal/expert",
    title: "전문가 운영정책",
    desc: "인증 절차, 사기 방지, 환불·오프플랫폼 결제 금지, 책임 범위를 안내합니다.",
  },
  {
    href: "/legal/community",
    title: "커뮤니티 운영정책",
    desc: "커뮤니티 이용 규칙, 금지 행위, 신고·제재 절차를 안내합니다.",
  },
  {
    href: "/legal/fees",
    title: "거래·수수료 안내",
    desc: "구매자·판매자·전문가 인증 수수료와 정산 기준을 안내합니다.",
  },
  {
    href: "/legal/location",
    title: "위치기반서비스 이용약관",
    desc: "위치정보 사용 범위, 제공 목적, 보관 기간을 안내합니다.",
  },
  {
    href: "/legal/youth",
    title: "청소년 보호정책",
    desc: "유해정보 대응, 신고 및 조치 절차를 안내합니다.",
  },
  {
    href: "/legal/privacy-request",
    title: "개인정보 열람·정정·삭제 요청",
    desc: "요청 방법, 처리 기한, 본인 확인 절차를 안내합니다.",
  },
];

/* [v4 · 한 화면 한 가지] "Legal Center" 꼬리표 + 카드 머리 + 카드 목록 → 제목 + 사실 한 줄 → 1px 선 행(문서 이름 + 한 줄 · ›) →
   끝 캡션(문의). 문서 설명 한 줄은 목록 행 보조 줄로 그대로 */
export default function LegalHubPage() {
  const info = getBusinessInfo();
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
      <header className="rise-in flex flex-col gap-0.5">
        <h1 className="t-title text-ink">법적 고지</h1>
        <p className="t-sub text-text-3">문서 {ITEMS.length}개 · 중요한 변경은 공지·이메일로 사전 안내</p>
      </header>

      <ul className="divide-y divide-line">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="press flex min-h-14 items-center justify-between gap-3 py-3 no-underline">
              <span className="min-w-0 flex-1">
                <span className="block t-body font-bold text-ink">{item.title}</span>
                <span className="mt-0.5 block truncate t-sub text-text-3">{item.desc}</span>
              </span>
              <span aria-hidden="true" className="shrink-0 t-body text-text-3">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="t-caption text-text-3">
        일반 문의 {info.supportEmail} · 개인정보 문의 {info.privacyEmail}
      </p>
    </main>
  );
}
