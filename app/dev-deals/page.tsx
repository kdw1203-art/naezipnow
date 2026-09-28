import type { Metadata } from "next";
import { PageShell } from "../components/PageShell";
import { listDeals } from "@/lib/dev-deals/store";
import { seoAlternates } from "@/lib/seo/alternates";
import { logger } from "@/lib/log";
import { DevDealsListClient } from "./DevDealsListClient";
import { ComplianceNotice } from "@/app/components/ComplianceNotice";
import { Explain } from "@/app/components/explain/Explain";
import { AdZone } from "@/app/components/ads/AdZone";

/* [2026-08-10 저녁 재전환] 필터는 DevDealsListClient(클라이언트), DB 왕복 1회.
   낮에 ISR 로 갔다가 되돌렸었다 — 프로덕션 서비스롤 키가 유실돼(Pro 재임포트)
   dev_deals(anon GRANT 없음) 조회 실패가 5분 캐시에 눌러앉았기 때문. 소유자가
   키를 복구했고 실측으로 확인했다(목록 정상 + anon GRANT 는 여전히 닫힘).
   같은 부류 재발은 /api/health 의 privilegedRead 체크가 이제 degraded 로 잡는다
   — 실패가 또 캐시되더라도 5분 안에 헬스가 울린다. */
/* [1010] 300 → 21,600(6시간). 목록을 바꾸는 쓰기는 물건 등록 하나뿐이고
   (app/api/dev-deals/deal/route.ts POST) 그 자리에서 /dev-deals 를 즉시 비운다.
   조회 실패를 캐시에 눌러앉히는 문제는 위 주석대로 health.privilegedRead 가 감시한다. */
export const revalidate = 21_600;
export function generateStaticParams() {
  return [];
}

export const metadata: Metadata = {
  /* [970 · C-25] 제목 접미 통일 `| 내집나우` */
  title: "개발물건 중개 | 내집나우",
  description:
    "시행사·부동산사업자가 개발물건(정비사업·신축·부지)을 등록하면 시공사·설계사·신탁·PF 등 협력업체가 참여 문의를 보내는 B2B 디벨로퍼 매칭. 내집나우는 소개·중개(매칭)만 담당합니다.",
  robots: { index: true, follow: true },
  // N7 — 필터·정렬 파라미터 조합이 별개 URL 로 색인되지 않도록 canonical 고정
  alternates: seoAlternates("/dev-deals"),
};

const DISCLAIMER =
  "내집나우는 개발물건의 소개·정보 게시 플랫폼으로, 당사자 간 계약·자금 정산에 관여하지 않습니다. 게시 정보의 정확성은 등록자에게 있으며, 실제 거래·인허가·수수료 약정은 반드시 당사자 간 확인 및 전문가(법무·세무·공인중개사 등) 자문을 거치시기 바랍니다. 표기된 중개 수수료는 기준이며 사업 규모·조건에 따라 협의됩니다.";

/* [1015 · 규칙 B] 0건일 때 그리던 예시 카드(가공 데이터 EXAMPLE_DEAL — "○○구 가로주택정비사업 · 168세대 · 420억")를 지웠다.
   예시 카드는 실데이터가 아니면 그리지 않는다. 빈 화면은 한 줄 + 등록 버튼. */

export default async function DevDealsHubPage() {
  /* 2026-07-26: store 가 실패 때 `[]` 를 돌려주던 걸 던지도록 고쳤다. 여기서
     받아서 "지금 불러오지 못했다"고 말한다 — 등록된 개발물건이 0건인 것과
     조회가 죽은 것은 다른 사실이다. */
  const loaded = await listDeals({}).then(
    (all) => ({ ok: true as const, all }),
    (err: unknown) => {
      logger.error("[dev-deals] 개발물건 목록 조회 실패", err);
      return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
    },
  );

  /* 조회 실패가 페이지 전체를 삼키지 않게 한다 (2026-08-02).
     예전에는 여기서 ErrorState 만 그리고 일찍 반환했는데, 그러면 목록과 무관한
     정적 허브(역할 안내·매칭 3단계·수수료 링크·"개발물건 등록" CTA)까지 통째로
     사라졌다 — 등록하러 온 시행사가 DB 장애 화면만 보고 돌아간다. 실패는
     **목록 섹션에만** 표시하고, 건수 요약도 "0건"이 아니라 "조회 실패"로 적는다. */
  const loadFailed = !loaded.ok;
  const all = loaded.ok ? loaded.all : [];

  // 지역 필터 옵션 — 전체 목록에서 유니크 추출(클라이언트 필터 화이트리스트로도 쓰인다)
  const regions = Array.from(
    new Set(all.map((d) => d.region).filter((r): r is string => !!r)),
  ).sort();

  return (
    <PageShell breadcrumb="동네이야기 › 개발물건 중개" wide>
      {/* 테마 구분: 개발물건 중개 = 앰버(디벨로퍼 매칭). 값은 globals.css
          .theme-dev-deals — 인라인 style 이면 다크 값도, 대비 게이트도 없다([975]). */}
      <div className="theme-dev-deals">
        {/* 헤더 · 역할 요약(면책 취지 포함) */}
        <div className="rise-in mb-4 max-md:mb-3">
          {/* [970 · C-42] h1 안에 배지 span 이 들어 있어 제목이 "개발물건 중개 B2B 디벨로퍼 매칭"
              으로 읽혔다(스크린리더·검색 스니펫). 배지는 h1 밖 형제로.
              [1015 · 규칙 B·C] 제목 옆 "B2B 디벨로퍼 매칭" 부연 배지, 기능 설명 문단(누가 등록하면 누가 문의한다 …),
              "안내" 색면 배너(면책 — 아래 DISCLAIMER 와 같은 사실의 반복)를 지웠다. 역할·면책은 페이지 끝 DISCLAIMER
              한 곳과 제목 옆 ⓘ 하나로. */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <h1 className="text-[19px] font-bold leading-[1.3] text-ink md:text-[21px]">
              개발물건 중개
            </h1>
            <Explain
              title="개발물건 중개"
              body="시행사·부동산사업자가 정비사업·신축·부지 등 개발물건을 등록하면 시공사·설계사·신탁·PF 등 협력업체가 참여 문의를 보내는 B2B 매칭 게시판."
              how="내집나우는 소개·정보 게시(매칭)만 하고 결제·자금 정산에 관여하지 않는다. 계약·인허가·수수료 약정은 당사자 간 확인과 전문가 자문을 거친다."
              source="/dev-deals/fees 수수료 기준 · 페이지 끝 면책 고지"
            />
          </div>
        </div>

        {/* 목록 + 필터는 클라이언트(DevDealsListClient) — 서버 렌더를 필터와
            무관하게 만들어 ISR 한 벌로 재사용한다. 실패는 loadFailed 로 전달해
            빈 결과와 구분한다(예시 카드로 장애를 덮지 않는다). */}
        <DevDealsListClient all={all} regions={regions} loadFailed={loadFailed} />

        {/* [1015 · 규칙 G] 광고 자리 — 페이지 끝 1곳(폰·데스크톱 같음). 첫 화면·필터·목록 사이에는 없다. */}
        <AdZone placement="page_bottom" seed={4} plan={null} className="mt-8 max-md:mt-5" />

        {/* 면책 고지 — [1015 · 규칙 C] 앰버 색면 → 흰 카드 + 1px 선(문구는 그대로) */}
        <div className="rise-in-4 card mt-4 rounded-xl px-4 py-3 text-[12px] leading-[1.7] text-text-3">
          {DISCLAIMER}
        </div>
        {/* 수익 문구 미기재 방침(소유자 방침 2026-08-11) — 마켓 표면 공통 고지 */}
        <ComplianceNotice variant="market" className="mt-2" />
      </div>
    </PageShell>
  );
}
