/* [1026c · 폰 배율 1] 문장 속 링크 24px 하한(py-[5px]) — 전 경로 폰 조작 검사에서 지적된 자리. */
/* [1022 · 정렬·글씨·테마] 지시 4 — 머리 한 모양(PageHead) · 램프 글자 · 흰 카드 테마 · 사실 문장. 자세한 사유는 본문의 [1022 · 정렬·글씨·테마] 주석. */
/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-bold/black 4곳을 font-bold(700)로 바꿨다. */
import type { Metadata } from "next";
import Link from "next/link";
import { listPublicNotes, type InspectionNote } from "@/lib/inspection/store-db";
import { maskNoteAuthor } from "@/app/town/shared";
import { noteCoverUrl } from "@/lib/notes/cover/resolve";
import { CoverImage } from "@/app/components/CoverImage";
import { Icon } from "@/app/components/Icon";
import { PageHead } from "@/app/components/PageHead";

/* [#143] 유료 리포트 진열대 — 잠금 상태(#70 선행분).
   기준을 넘는 공개 노트를 "판매 예정 리포트"로 미리 진열한다. 결제 버튼은
   비활성(오픈 준비 중) — 결제 기능 승인 회신이 오면 버튼만 켠다(billing-open 런북).
   가격은 표시하지 않는다: 가격은 오픈 후 판매자(작성자)가 등록할 때 정해진다.
   기준(#70): 사진 5장+ · 본문 2,000자+ (방문 인증은 우대 배지). */

/* [1010] 3600초 → 1일. 진열 대상은 공개 노트(사진 5장+·본문 2,000자+)뿐이고, 공개 노트가
   바뀌는 지점이 invalidatePublicNoteRoutes() 로 이 경로를 비운다. */
export const revalidate = 86_400;

export const metadata: Metadata = {
  title: "임장 리포트 진열대 · 판매 오픈 준비 중 | 내집나우",
  description:
    "기준을 충족한 임장노트가 유료 리포트로 판매될 예정입니다. 사진 5장 이상, 본문 2,000자 이상의 검증된 현장 기록.",
  alternates: { canonical: "/notes/market" },
};

const MIN_PHOTOS = 5;
const MIN_TEXT = 2000;

function noteTextLen(n: InspectionNote): number {
  const parts: string[] = [n.summary ?? ""];
  for (const v of Object.values(n.sections ?? {})) if (typeof v === "string") parts.push(v);
  return parts.join("").length;
}

export default async function NotesMarketPage() {
  let notes: InspectionNote[] = [];
  let loadFailed = false;
  try {
    notes = await listPublicNotes(50);
  } catch {
    loadFailed = true;
  }

  const qualified = notes
    .map((n) => ({ note: n, textLen: noteTextLen(n) }))
    .filter(
      ({ note, textLen }) => (note.photos?.length ?? 0) >= MIN_PHOTOS && textLen >= MIN_TEXT,
    );

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 px-4 py-6 max-md:gap-3 max-md:py-4">
      {/* 헤더 */}
      <div className="flex flex-col gap-2">
        <nav className="t-sub font-semibold text-text-3">
          <Link href="/notes" className="no-underline hover:underline">
            임장노트
          </Link>{" "}
          › 리포트 진열대
        </nav>
        {/* [1015 · 규칙 D] 설명 세 문장 → 사실 한 줄. [1022 · 정렬·글씨·테마] 공용 PageHead · 경고색 알약 → 테두리 칩 */}
        <PageHead
          icon="store"
          title="임장 리포트 진열대"
          sub="기준 충족 공개 노트의 진열 · 판매는 결제 오픈 후 · 전문은 지금 각 노트에서 무료"
          subOnPhone
          actions={
            <span className="chip border border-line bg-surface px-2.5 py-1 t-sub font-bold text-text-2">
              판매 오픈 준비 중
            </span>
          }
        />
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-lg bg-bg px-2.5 py-1 t-sub font-bold text-text-2">
            기준 · 사진 {MIN_PHOTOS}장+
          </span>
          <span className="rounded-lg bg-bg px-2.5 py-1 t-sub font-bold text-text-2">
            본문 {MIN_TEXT.toLocaleString("ko-KR")}자+
          </span>
          <span className="rounded-lg bg-bg px-2.5 py-1 t-sub font-bold text-text-2">
            직접 방문 인증 우대
          </span>
        </div>
      </div>

      {/* 목록 */}
      {loadFailed ? (
        <div className="rounded-lg border border-line bg-surface px-5 py-8 text-center t-body font-bold text-text-3">
          목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </div>
      ) : qualified.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface px-5 py-8 text-center">
          <p className="t-body font-bold text-text-2">
            아직 기준을 충족한 노트가 없어요.
          </p>
          <p className="mt-1 t-body text-text-3">
            사진 {MIN_PHOTOS}장·본문 {MIN_TEXT.toLocaleString("ko-KR")}자를 넘긴 첫
            노트가 이 자리에 올라옵니다.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {qualified.map(({ note, textLen }) => {
            const verified = Boolean(note.metadata?.visitVerified);
            return (
              <div
                key={note.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface"
              >
                <div className="relative h-[150px] w-full overflow-hidden bg-bg">
                  {/* [1015 · 규칙 H] 커버 주소는 lib/notes/cover/resolve 한 곳 — 이 자리는 넓은 커버(150px 가로) → 통합자가 wide 판으로 바꾼다(보고서) */}
                  <CoverImage
                    src={noteCoverUrl(note, "wide")}
                    alt=""
                    /* [970 · B-24] 세로(3:4) 사진은 가운데 크롭에서 건물이 잘렸다 — 위쪽 기준 */
                    imgClassName="absolute inset-0 h-full w-full object-cover object-top"
                    fallback={
                      <div className="absolute inset-0 flex items-center justify-center bg-primary-soft t-body font-bold text-primary">
                        임장노트
                      </div>
                    }
                  />
                  {verified && (
                    <span className="absolute left-2.5 top-2.5 rounded-full bg-success px-2 py-0.5 t-caption font-bold text-surface">
                      ✓ 직접 방문 인증
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-4">
                  <div className="t-section text-ink line-clamp-2">
                    {note.title}
                  </div>
                  <div className="t-sub font-semibold text-text-3">
                    {note.region}
                    {note.aptName ? ` · ${note.aptName}` : ""} ·{" "}
                    {maskNoteAuthor(note.authorLabel, note.authorEmail ?? "")}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <span className="rounded-lg bg-bg px-2 py-0.5 t-sub font-bold text-text-2">
                      사진 {note.photos.length}장
                    </span>
                    <span className="rounded-lg bg-bg px-2 py-0.5 t-sub font-bold text-text-2">
                      본문 {textLen.toLocaleString("ko-KR")}자
                    </span>
                  </div>
                  <div className="mt-auto flex items-center gap-2 pt-2.5">
                    <Link
                      href={`/notes/${note.id}`}
                      className="rounded-lg border border-line-strong bg-bg px-3.5 py-2 t-body font-bold text-text-1 no-underline"
                    >
                      노트 전문 읽기
                    </Link>
                    {/* [1012] 규칙 4 — 🔒 이모지 → 자물쇠 선 아이콘 */}
                    <button
                      type="button"
                      disabled
                      title="결제 기능 오픈 후 판매가 시작됩니다"
                      className="inline-flex min-h-10 flex-1 cursor-not-allowed items-center justify-center gap-1 rounded-lg bg-bg px-3.5 py-2 t-body font-bold text-text-3"
                    >
                      <Icon name="lock" size={15} />
                      판매 오픈 준비 중
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 작성자 CTA + 정직 고지 */}
      <div className="rounded-lg border border-line bg-bg px-4 py-3.5">
        <p className="t-body text-text-2">
          기준(사진 {MIN_PHOTOS}장+ · 본문 {MIN_TEXT.toLocaleString("ko-KR")}자+)을 넘긴 공개 노트는
          자동으로 진열.{" "}
          <Link href="/notes/new" className="inline-block py-[5px] font-bold text-primary no-underline">
            임장노트 쓰기 ›
          </Link>
        </p>
        <p className="mt-1.5 t-sub text-text-3">
          가격·정산은 결제 오픈 후 작성자가 정함 · 오픈 전 결제 없음
        </p>
      </div>
    </div>
  );
}
