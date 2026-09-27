import type { HomeNoteItem } from "@/lib/newui/home-data";
import { CoverImage } from "@/app/components/CoverImage";
import { HOME_LIST, HomeRow, HomeSectionHead } from "./HomeRows";
import { homeNoteRowText } from "./home-note-title";

/* ============================================================
   [v4 · 규칙 5·6·10] 홈 "공개 임장노트" — 동네 피드 FeedRow 와 같은 행(썸네일 칸 + 제목 한 줄 + 메타 한 줄).

   예전: 카드 안 3줄 — 앞에 "Lab 데이터"/"이웃" 배지, 긴 제목("청량리역 한양수자인 그라시엘 — 그라시엘 전세10억3건
   월세71%(Lab #33 …)")이 말줄임으로 잘리고, 오른쪽 점수 배지(75점 이상 파랑), 머리의 "임장 점수 ⓘ" 설명 시트,
   맨 아래 "Lab 데이터 노트는 … 함께 보입니다." 설명 문장.
   지금: 제목 = 노트 제목만(단지명은 메타 줄로, Lab 카드의 괄호 부연은 뗀다 — home-note-title.ts · 동네 피드와 같은
   feedDisplayTitle) · 메타 = "단지명 · 작성 주체" · 오른쪽 = 점수(t-num). 배지·ⓘ·설명 문장은 뺐다 — 점수 계산법과 Lab 노트의 뜻은
   페이지 끝 "데이터 출처"(HomeDataSources)로 옮겼다. 목록 끝 행 = AI 입구 CTA(옛 네이비 AI 패널의 버튼).

   썸네일: 홈 노트 조회(listPublicNoteCards)에는 사진 칼럼이 없다(본문·jsonb 제외 — 최적화 8). 커버 담당
   (lib/notes/cover)이 `cover` 를 채우기 전까지는 칸 자체를 그리지 않는다 — 회색 빈 칸 세 개는 정보가 아니다.
   한 장이라도 커버가 오면 세 행 모두 72px 칸을 갖는다(없는 행은 회색 단면 — 행 높이·열을 맞춘다).
   ============================================================ */

/** 홈 노트 한 장 — 커버 URL 은 선택(커버 담당이 home-data 매핑에 붙일 자리) */
export type HomeNoteRowItem = HomeNoteItem & { cover?: string | null };

export function HomeNotesList({
  notes,
  total,
  today,
  failed,
  cta,
}: {
  notes: HomeNoteRowItem[];
  /** 누적 공개 노트 수(실카운트) — 없으면 숫자 없이 */
  total: number | null;
  /** KST 오늘 새 공개 노트 수 */
  today: number | null;
  failed: boolean;
  /** 노트 → AI 정리 입구(lib/brand/home-copy HOME_CTA_AI) */
  cta: { href: string; label: string };
}) {
  const withThumb = notes.some((n) => Boolean(n.cover));
  const count = typeof total === "number" && total > 0 ? `${total.toLocaleString("ko-KR")}편` : null;
  return (
    <section aria-labelledby="home-notes-h" className="flex flex-col gap-2">
      <HomeSectionHead
        id="home-notes-h"
        title="공개 임장노트"
        count={count}
        link={{ href: "/notes", label: "노트 전체 보기 ›" }}
        fact={typeof today === "number" && today > 0 ? `오늘 ${today.toLocaleString("ko-KR")}편 새로 올라옴` : null}
      />
      <ul data-tone="hanji" className={HOME_LIST}>
        {notes.length === 0 ? (
          /* [v4 · 규칙 8] 빈 상태 = 한 줄. 실패와 "아직 없음"은 다르게 말한다(가짜 카드 없음) */
          <HomeRow muted label={failed ? "목록을 지금 불러오지 못했어요" : "공개된 임장노트 아직 없음"} />
        ) : (
          notes.slice(0, 3).map((n, i) => {
            const { label, meta } = homeNoteRowText(n.title, n.kind);
            return (
              <HomeRow
                key={n.id}
                href={`/notes/${n.id}`}
                label={label}
                sub={meta}
                value={
                  <>
                    <span className="sr-only">임장 점수 </span>
                    {n.score}
                  </>
                }
                thumb={
                  withThumb
                    ? n.cover
                      ? (
                          <CoverImage
                            src={n.cover}
                            alt=""
                            sizes="72px"
                            priority={i === 0}
                            imgClassName="absolute inset-0 h-full w-full object-cover"
                          />
                        )
                      : null
                    : undefined
                }
              />
            );
          })
        )}
        {/* 옛 네이비 "임장노트 AI 정리" 패널의 버튼 — 동사 + 대상 한 행(채움 파랑은 검색 하나뿐) */}
        <HomeRow href={cta.href} label={cta.label} />
      </ul>
    </section>
  );
}
