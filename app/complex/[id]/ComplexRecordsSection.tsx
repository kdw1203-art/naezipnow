import type { ReactNode } from "react";
import Link from "@/app/components/IntentLink";
import { seedGradient } from "@/lib/town/shared";
import { ComplexRecords, type RecordPane } from "./ComplexRecords";
import { loadHubInspectionNotes, withSectionBudget, type HubInspectionNoteRow } from "./section-loaders";

/* [1108 · 단지 상세 A안] "이 단지 기록" 서버 조각 — 임장노트(서버 HTML) + 거주민 후기 · 단지 토론(page.tsx 가 넘기는 지연 조각)을
   ComplexRecords(칩 한 줄)에 담는다. 예전 ComplexNotesNewsAi 의 임장노트 칸이 여기로 왔고, 관련 기사는 ComplexRelatedNews(동네 묶음)로,
   "이 단지 AI 분석 받기"는 다요인 분석 아래 한 곳으로 갔다(AI 진입 12 → 3 — 화면당 입구 하나).

   임장노트 목록의 모양은 그대로(1015 · 규칙 H·I — 40px 정사각 썸네일 · 한지 리퀴드 판 · 두 줄 제목). 조회 실패는 "못 읽음",
   0건은 "{단지}에 공개된 임장노트 없음"(1012 · 규칙 6) — 둘은 다른 말이다. */

export async function ComplexRecordsSection({
  complexId,
  name,
  region,
  reviews,
  talk,
}: {
  complexId: string;
  name: string;
  region: string;
  /** 거주민 후기 칸(ComplexReviewsLazy) — 실단지가 아니면 null(칸 자체가 없다) */
  reviews: ReactNode | null;
  /** 단지 토론 칸(ComplexTalkLazy + 지역 토론 링크) — 토론 지역 밖이면 null */
  talk: ReactNode | null;
}) {
  const { notes, failed } = await withSectionBudget(loadHubInspectionNotes(complexId, name)).catch(
    (): { notes: HubInspectionNoteRow[]; failed: boolean } => ({ notes: [], failed: true }),
  );
  const noteHref = `/notes/new?${new URLSearchParams({ apt: name, region, complexId }).toString()}`;

  const notesNode = failed ? (
    <p className="card m-0 rounded-2xl px-4 py-3.5 t-sub text-text-3">노트 불러오기 실패 · 잠시 후 다시</p>
  ) : notes.length === 0 ? (
    <p className="card m-0 rounded-2xl px-4 py-3.5 t-sub text-text-3">{name}에 공개된 임장노트 없음</p>
  ) : (
    <ul className="lq-panel flex list-none flex-col divide-y p-0" data-tone="hanji">
      {notes.map((n) => (
        <li key={n.id}>
          <Link href={`/notes/${encodeURIComponent(n.id)}`} className="press flex min-h-12 items-center gap-3 py-2 no-underline">
            {/* 40px 정사각 썸네일 — 고른 템플릿 → 첫 사진 → 단색 칸 */}
            <span
              className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-divider"
              style={n.cover ? undefined : { background: seedGradient(n.region || n.id) }}
              aria-hidden="true"
            >
              {n.cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={n.cover} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 object-cover" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              {/* [1084] 한 줄 말줄임이라 "[내집나우 Lab] AI …"만 보였다 — 두 줄까지 */}
              <span className="line-clamp-2 break-words t-body font-bold text-ink">{n.title}</span>
              <span className="mt-0.5 block truncate t-sub text-text-3">
                {[n.visitDate, n.region].filter(Boolean).join(" · ") || "방문일 미기재"}
              </span>
            </span>
            <span aria-hidden="true" className="t-body text-text-3">
              ›
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  const panes: RecordPane[] = [{ key: "notes", label: "임장노트", count: failed ? null : notes.length, node: notesNode }];
  if (reviews) panes.push({ key: "reviews", label: "거주민 후기", node: reviews });
  if (talk) panes.push({ key: "talk", label: "토론", node: talk });

  const summaryBits = [failed ? null : `임장노트 ${notes.length}`, reviews ? "후기" : null, talk ? "토론" : null].filter(Boolean);

  return (
    <ComplexRecords
      name={name}
      panes={panes}
      initial="notes"
      summary={summaryBits.length > 1 ? summaryBits.join(" · ") : null}
      action={
        <Link href={noteHref} className="btn-outline block rounded-xl p-2.5 text-center t-sub font-bold">
          이 단지 임장노트 쓰기
        </Link>
      }
    />
  );
}

export default ComplexRecordsSection;
