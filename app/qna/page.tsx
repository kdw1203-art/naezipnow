import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { AdZone } from "@/app/components/ads/AdZone";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownHero } from "@/app/town/TownHero";
import { listQuestions } from "@/lib/qna/store";
import { complexHrefKey, resolveComplexHrefs } from "@/lib/newui/complex-link";
import { seoAlternates } from "@/lib/seo/alternates";
import { logger } from "@/lib/log";
import { AskForm } from "./AskForm";
import { QnaListClient, type QnaRow } from "./QnaListClient";
import { relativeTimeLabel } from "@/lib/format/relative-time";

/* 비용 실측(2026-08-10): 서버는 원래도 100건을 한 번 받아 메모리에서 걸렀다 —
   ?status/sort/topic/q 를 읽는 것만이 이 라우트를 영구 동적으로 만들고 있었다.
   거르는 자리를 QnaListClient 로 옮기고 ISR(5분) 전환. 새 질문은 등록 API 의
   revalidatePath 가 즉시 목록을 재생성한다(캐시 때문에 방금 쓴 질문이 안 보이면
   안 된다). 시각 라벨·복잡한 개수 계산은 서버 판과 동일 코드를 클라이언트에서
   같은 순서로 돈다. */
/* [1010] 300초 → 1일. 목록이 바뀌는 지점은 질문 등록(POST /api/qna)과 답변 등록
   (POST /api/qna/[id]/answers) 둘뿐이고, 둘 다 이미 revalidatePath("/qna") 를 부른다
   (답변 수·"답변 완료" 배지가 목록에 실리기 때문). 5분 눈금은 크롤 1회당 오리진 1회였다. */
export const revalidate = 86_400;

export const metadata: Metadata = {
  title: "단지 Q&A | 내집나우",
  description:
    /* [1012] 규칙 5 — "받아보세요·확인하세요" 제거 */
    "아파트 단지·동네 질문에 이웃·실거주자가 답하는 단지 Q&A. 재건축·학군·주차·교통 주제별 질문과 답변 완료 수.",
  robots: { index: true, follow: true },
  alternates: seoAlternates("/qna"),
};

/* 테마 구분: 단지 Q&A = 청록 (대화·질문). subtree 안에서 text-primary·
   bg-primary-soft·chip-active·btn-primary 가 청록으로 재테마됨.
   [970 · C-18] 인라인 style(--primary-soft:#e3f5f2)은 다크에서도 연한 청록이 남아 칩·패널이
   흰 얼룩으로 떴다 — globals.css `.qna-theme` / `.dark .qna-theme`(I1) 클래스로. */
const QNA_THEME_CLASS = "qna-theme";


/* 연동(2): 임장노트·단지 허브에서 "이 단지 Q&A" 로 올 때 쓰는 축.
   단지명을 그대로 넘겨받아 제목·본문·단지명·지역에서 찾는다. 검색은 서버 쿼리
   대신 이미 불러온 100건 안에서 하므로, 결과가 0이어도 "그 단지 질문이 아직
   없다"가 아니라 "최근 100건 중에는 없다"로 문구를 적는다 — 없는 것을 단정하지
   않는다. */
/** 상대/짧은 날짜 — 하루 이내는 시간, 30일 이내는 N일 전, 이후는 YYYY.MM.DD.
 *  [967 · 32] 본체는 lib/format/relative-time.ts (시간 단위 · 30일) */
function shortDate(iso: string): string {
  return relativeTimeLabel(iso, Date.now(), { unit: "hour", maxDays: 30 });
}

/* ---------- 카드 ---------- */

/* ---------- 페이지 ---------- */

export default async function QnaListPage() {

  /* 2026-07-26: store 가 실패 때 `[]` 를 돌려주던 걸 던지도록 고쳤다. 질문 등록
     폼(AskForm)은 그대로 두고 — 목록이 안 보인다고 질문까지 못 하게 할 이유는
     없다 — 목록 자리에만 "지금 불러오지 못했다"고 쓴다.

     상태 필터를 쿼리로 내리지 않고 한 번에 받아서 메모리에서 가른다. 그래야
     탭·주제 옆 개수가 전부 같은 스냅샷에서 나온 실제 값이 된다(개수만 따로
     세는 쿼리를 붙이면 그 사이에 값이 어긋난다). limit 은 100 이 상한이다. */
  const loaded = await listQuestions({ limit: 100 }).then(
    (items) => ({ ok: true as const, items }),
    (err: unknown) => {
      /* [970 · C-09] 원인 원문은 로그로만 — 화면엔 DB 오류 문구를 내보내지 않는다 */
      logger.error("[qna] 질문 목록 조회 실패", err);
      return { ok: false as const };
    },
  );
  /* 키워드를 먼저 적용한다 — 그래야 탭·주제 옆 개수가 "지금 화면에 걸린 조건
     안에서의 실제 건수" 가 된다(전체 개수를 보여주면 눌렀을 때 안 맞는다). */
  const items = loaded.ok ? loaded.items : [];

  /* 연동(1): 단지 허브 링크 — 필터와 무관하게 전량(≤100건)에 대해 한 번 해석.
     resolveComplexHrefs 는 중복 접기 + 동시 4개 + 3초 마감(기존 주석 참조). */
  const resolved = await resolveComplexHrefs(
    items
      .filter((q) => !q.complexId && q.complexName)
      .map((q) => ({ name: q.complexName, region: q.region })),
  );
  const rows: QnaRow[] = items.map((q) => {
    const complexHref = q.complexId
      ? `/complex/${encodeURIComponent(q.complexId)}`
      : q.complexName
        ? (resolved.get(complexHrefKey(q.complexName, q.region)) ?? null)
        : null;
    return { q, complexHref, timeLabel: shortDate(q.createdAt) };
  });


  return (
    /* [970 · C-28] 다른 동네이야기 카테고리(뉴스·모임·자료·공매·입주)와 같은 머리 —
       브레드크럼 "동네이야기 › …" + 카테고리 줄 + TownPageHead(아이콘 칩·제목·한 줄).
       PageShell title(맨 h1)은 이 패턴 밖이었다. */
    <PageShell breadcrumb="동네이야기 › 단지 Q&A" wide>
      <TownHero href="/qna" />
      <TownCategoryNav stick />

      <div className={QNA_THEME_CLASS}>
        {!loaded.ok ? (
          /* 조회 실패 — 필터 UI 없이 실패만 정확히 말한다. 질문 등록은 그대로 가능. */
          <div className="mt-4 flex flex-col gap-4">
            <AskForm />
            <ErrorState
              title="질문 목록을 불러오지 못했어요"
              desc="잠시 후 다시 시도해 주세요. 질문 등록은 위에서 그대로 할 수 있어요."
            />
          </div>
        ) : (
          /* 필터·목록은 클라이언트(QnaListClient). SSR 은 전체 100건을 HTML 에
             그리고 필터는 마운트 후 적용. AskForm·사이드바는 서버 조각으로 끼운다. */
          <QnaListClient
            rows={rows}
            askForm={<AskForm />}
            sidebar={
              <>
                {/* [1015] 레일 정리(브리프 규칙 B·C·D): 카드 머리의 설명문("…한 곳에 있어요")과 링크 부제의 안내문을
                    명사로, "자주 오르는 질문 주제" 힌트 카드(예시 문장 6개 + "…더 잘 닿아요" 사용법)는 걷었다 —
                    주제는 위 필터 칩 줄이 이미 보여 준다. 답변 면책은 남기되 문장만 다듬었다. */}
                <section className="rise-in-2 card flex flex-col gap-2 p-[18px] max-md:p-3.5">
                  <h2 className="t-body font-bold text-ink">질문 전에 볼 기록</h2>
                  <div className="mt-1 flex flex-col gap-2">
                    {[
                      {
                        href: "/map",
                        icon: "map",
                        label: "지도에서 단지 찾기",
                        desc: "단지 정보 · 실거래 · 지도",
                      },
                      {
                        href: "/notes",
                        icon: "clipboard",
                        label: "공개 임장노트 보기",
                        desc: "현장 기록",
                      },
                      {
                        href: "/notes/new",
                        icon: "notebook-pen",
                        label: "임장노트 쓰기",
                        desc: "내 현장 기록",
                      },
                    ].map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        className="press flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 no-underline"
                      >
                        {/* [1012] 규칙 9 — 아이콘 칩은 연한 회색 한 가지 */}
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-bg text-text-2">
                          <Icon name={l.icon} size={16} />
                        </span>
                        <span className="flex flex-col">
                          <span className="t-body font-bold text-ink">{l.label}</span>
                          <span className="t-sub text-text-3">{l.desc}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>

                <section className="rise-in-4 card flex flex-col gap-1.5 p-[18px] max-md:p-3.5">
                  <h2 className="t-body font-bold text-ink">답변 안내</h2>
                  <p className="t-sub text-text-3">
                    답변은 이용자 개인의 의견이며 정확성이 보장되지 않습니다. 투자·매매·임대차 등
                    계약 판단과 그 책임은 본인에게 있습니다.
                  </p>
                </section>

                {/* 광고 — ISR 페이지: 세션을 읽지 않고 plan={null} 경로의
                    클라이언트 게이트(AdFreeGate)가 유료 플랜을 숨긴다 */}
                <AdZone placement="community_feed" seed={0} plan={null} />
              </>
            }
          />
        )}
      </div>
    </PageShell>
  );
}