/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 5곳을 font-bold(700)로 바꿨다. */
import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { AIPanel } from "../../components/AIPanel";
import { CompareView } from "./CompareView";
import { Timeline } from "./Timeline";
import { safeAuth } from "@/lib/safe-auth";
import {
  getNote,
  listNotesByAuthorForApt,
  listNotesByAuthorForComplex,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import {
  buildVisitCompareModel,
  type CellTone,
  type VisitCompareModel,
} from "@/lib/inspection/visit-compare";
import { AiFeedbackButtons } from "@/app/components/AiFeedbackButtons";
import { CompareFunnelPing } from "./CompareFunnelPing";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";

/* 시안 9e — 노트 다회차 비교.
   실데이터: listNotesByAuthorForApt. 예시 목업 제거 — 회차 부족 시 empty+CTA. */

export const dynamic = "force-dynamic";

/* note= 쿼리로 본인 노트를 비교하는 개인 화면 — URL 마다 내용이 다르고
   로그인한 작성자에게만 의미가 있다. 검색엔진에 들어갈 페이지가 아니므로
   noindex (N7 파라미터 canonical 감사 기준). */
export const metadata = {
  title: "임장노트 회차 비교 | 내집나우",
  robots: { index: false, follow: false },
};

const TONE_CLASS: Record<CellTone, string> = {
  good: "font-bold text-primary",
  avg: "font-bold text-text-2",
  bad: "font-bold text-danger",
  none: "text-text-3",
};

function firstParam(
  v: string | string[] | undefined,
): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0].trim() || null;
  return null;
}

async function loadCompareNotes(
  noteId: string | null,
  email: string | null,
): Promise<
  | { kind: "ok"; notes: InspectionNote[]; model: VisitCompareModel }
  | { kind: "need_login" }
  | { kind: "need_note" }
  | { kind: "need_more"; aptName: string; count: number; noteId: string }
  | { kind: "forbidden" }
  | { kind: "error"; message: string }
> {
  if (!email) return { kind: "need_login" };
  if (!noteId) return { kind: "need_note" };

  try {
    const note = await getNote(noteId);
    if (!note) return { kind: "need_note" };
    if (note.authorEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
      return { kind: "forbidden" };
    }
    const apt = note.aptName?.trim();
    const complexId =
      typeof note.metadata?.complexId === "string" ? note.metadata.complexId.trim() : "";
    /* complexId 가 있으면 표기 다른 aptName 끼리도 같은 단지로 묶는다.
       둘 다 없으면 비교 자체가 성립하지 않으므로 soft-empty. */
    if (!complexId && !apt) {
      return { kind: "need_more", aptName: "단지 미지정", count: 1, noteId };
    }
    const notes = complexId
      ? await listNotesByAuthorForComplex(email, complexId, 20)
      : await listNotesByAuthorForApt(email, apt!, 20);
    const label = apt || complexId || "단지";
    if (notes.length < 2) {
      return {
        kind: "need_more",
        aptName: label,
        count: notes.length,
        noteId,
      };
    }
    const model = buildVisitCompareModel(notes);
    if (!model) return { kind: "need_more", aptName: label, count: notes.length, noteId };
    return { kind: "ok", notes, model };
  } catch (e) {
    return {
      kind: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/* [v4 · 규칙 5] 표 — 카드 면을 걷고 1px 구분선 행만. 회차가 늘면 가로로 넓어지는 표라 가로 스크롤(760px 한 줄의 예외).
   최신 회차 칸의 옅은 파랑 면(rgba) → 글자 색(text-primary)으로만 구분 */
function CompareTable({ model }: { model: VisitCompareModel }) {
  const n = model.colCount;
  const gridStyle = {
    gridTemplateColumns: `90px repeat(${n}, minmax(72px, 1fr))`,
  } as const;
  const first = model.scores[0]?.value ?? 0;
  const last = model.scores[model.scores.length - 1]?.value ?? 0;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div
          className="grid items-end gap-2 border-b border-line pb-2.5 pt-2 t-sub text-text-3"
          style={gridStyle}
        >
          <span />
          {model.headers.map((h) => (
            <div key={h.noteId} className="text-center">
              <Link
                href={`/notes/${encodeURIComponent(h.noteId)}`}
                className={`inline-flex min-h-6 items-center font-bold no-underline ${
                  h.latest ? "text-primary" : "text-text-1"
                }`}
              >
                {h.n}
              </Link>
              <br />
              {h.meta}
            </div>
          ))}
        </div>
        {model.rows.map((row) => (
          <div
            key={row.label}
            className="grid items-center gap-2 border-b border-line py-[9px] t-sub"
            style={gridStyle}
          >
            <span className="text-text-2">{row.label}</span>
            {row.cells.map((c, i) => (
              <span key={i} className={`text-center ${TONE_CLASS[c.tone]}`}>
                {c.text}
              </span>
            ))}
          </div>
        ))}
        <div className="grid items-center gap-2 py-[9px] t-sub" style={gridStyle}>
          <span className="font-bold text-text-1">종합 점수</span>
          {model.scores.map((s, i) => (
            <span key={i} className={`text-center font-bold ${s.cls}`}>
              {s.value}
            </span>
          ))}
        </div>
      </div>
      {/* 출처·계산은 섹션 끝 캡션 한 줄 */}
      <p className="mt-1 t-caption text-text-3">
        종합 = 작성자 5축 평균 × 20 · {first} → {last}
      </p>
    </div>
  );
}

export default async function NotesComparePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const noteId = firstParam(sp.noteId);
  const session = await safeAuth();
  const email = session?.user?.email?.trim() ?? null;
  const result = await loadCompareNotes(noteId, email);

  if (result.kind === "ok") {
    const { model } = result;
    const regionQ = model.region ? `&region=${encodeURIComponent(model.region)}` : "";
    return (
      <PageShell breadcrumb={`임장노트 › 회차 비교 › ${model.aptName}`}>
        <CompareFunnelPing
          noteId={noteId ?? model.headers[model.headers.length - 1]?.noteId ?? ""}
          aptName={model.aptName}
        />
        {/* [v4 · 한 화면 한 가지] 머리(제목 + 사실 한 줄) → 주인공(표/타임라인) → 채움 파랑 1개 → AI 패널 → 이어서 행.
            지운 것: 회차 칩 줄(표 머리·타임라인 회차가 같은 링크) · 파랑/회색 알약 링크 두 개(→ 이어서 행) ·
            "다음 방문 기록 남기기" 카드와 설명 문장("같은 단지를 한 번 더 기록하면 표에 새 열이 붙어요") */}
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
          <div className="flex flex-col gap-4">
            <header className="flex flex-col gap-0.5">
              <h1 className="t-title text-ink">노트 다회차 비교</h1>
              <p className="t-sub text-text-3">
                {[model.region, model.aptName, `방문 ${model.colCount}회`].filter(Boolean).join(" · ")}
              </p>
            </header>

            <CompareView
              timeline={
                <Timeline
                  steps={model.timeline}
                  hrefs={model.headers.map((h) => `/notes/${encodeURIComponent(h.noteId)}`)}
                />
              }
              table={<CompareTable model={model} />}
            />

            <Link
              href={`/notes/new?apt=${encodeURIComponent(model.aptName)}${regionQ}`}
              className="btn-primary flex min-h-12 items-center justify-center rounded-lg px-4 text-center t-body no-underline"
            >
              이 단지 다음 방문 노트 쓰기
            </Link>
          </div>

          <div className="flex flex-col gap-2">
            <AIPanel title="다회차 종합 (규칙 요약)">{model.summaryText}</AIPanel>
            <AiFeedbackButtons
              targetType="visit_compare"
              targetId={noteId ?? model.headers[model.headers.length - 1]?.noteId}
              context={{ aptName: model.aptName, visits: model.colCount }}
            />
          </div>

          <section aria-labelledby="compare-next-h" className="flex flex-col gap-1">
            <h2 id="compare-next-h" className="t-section text-ink">
              이어서
            </h2>
            <ul data-tone="blue" className="divide-y divide-line border-b border-line">
              <SummaryRow
                label="지도에서 비교"
                sub={[model.region, model.aptName].filter(Boolean).join(" · ")}
                href={`/map?apt=${encodeURIComponent(model.aptName)}${regionQ}`}
              />
              <SummaryRow label="단지 A/B 비교" sub="두 단지 실거래 나란히" href="/complex/compare" />
            </ul>
          </section>
        </div>
      </PageShell>
    );
  }

  /* [v4 · 규칙 3·8] 빈 상태 — 제목 한 줄 + 사실 한 줄(명사형) + 행동 하나 + 보조 글자 링크. 가운데 카드 → 왼쪽 정렬 */
  const emptyTitle =
    result.kind === "need_login"
      ? "로그인이 필요해요"
      : result.kind === "forbidden"
        ? "내 노트만 비교할 수 있어요"
        : result.kind === "error"
          ? "회차 비교를 불러오지 못했어요"
          : result.kind === "need_more"
            ? `${result.aptName} 방문 ${result.count}회`
            : "비교할 노트 없음";

  const emptyDesc =
    result.kind === "need_login"
      ? "같은 단지 2회 이상 기록 후 비교"
      : result.kind === "forbidden"
        ? "다른 사람의 임장노트 회차는 비교 불가"
        : result.kind === "error"
          ? result.message
          : result.kind === "need_more"
            ? "같은 단지 노트 2회부터 표·타임라인 · 예시 데이터 없음"
            : "노트 상세의 ‘회차 비교’ 또는 내 노트에서 단지 선택";

  const action =
    result.kind === "need_login"
      ? {
          /* [970 · B-14] noteId 를 callbackUrl 에 실어야 로그인 뒤 같은 비교로 돌아온다 */
          href: `/login?callbackUrl=${encodeURIComponent(noteId ? `/notes/compare?noteId=${noteId}` : "/notes/compare")}`,
          label: "로그인",
        }
      : result.kind === "need_more"
        ? { href: `/notes/new?apt=${encodeURIComponent(result.aptName)}`, label: "같은 단지 한 번 더 기록" }
        : { href: "/notes?mine=1", label: "내 노트 보기" };
  const secondary =
    result.kind === "need_login"
      ? null
      : result.kind === "need_more"
        ? { href: `/notes/${encodeURIComponent(result.noteId)}`, label: "노트 상세로 ›" }
        : { href: "/notes/new", label: "임장노트 쓰기 ›" };

  return (
    <PageShell breadcrumb="임장노트 › 회차 비교">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        <h1 className="t-title text-ink">노트 다회차 비교</h1>
        <div className="flex flex-col gap-1 border-y border-line py-4">
          <p className="t-section text-ink">{emptyTitle}</p>
          <p className="t-sub text-text-2">{emptyDesc}</p>
        </div>
        <Link
          href={action.href}
          className="btn-primary flex min-h-12 items-center justify-center rounded-lg px-4 text-center t-body no-underline"
        >
          {action.label}
        </Link>
        {secondary && (
          <Link href={secondary.href} className="tap-line w-fit t-sub font-bold text-primary no-underline">
            {secondary.label}
          </Link>
        )}
      </div>
    </PageShell>
  );
}
