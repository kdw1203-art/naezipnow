"use client";
/* [1012 · 규칙 8] font-bold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */

/**
 * 거주민 후기 섹션 (호갱노노 "이야기" 벤치마크 — docs/benchmark-proposals.md D4 계열)
 * - GET /api/complex-reviews?complexId=&offset= 로 목록(50건씩)·평균·내 후기 표시 (빈 상태 정직)
 * - 로그인 시 작성: 항목별 별점(1~5) + 한줄 후기 → POST /api/complex-reviews (계정당 5회/시간)
 * - 비로그인 작성 시도(401) → A3 소프트 가입 프롬프트 (즉시 리다이렉트 대신 그 자리에서 설명)
 * - 신고: ReportButton(targetType="review") — 후기는 글 신고 API 대상이 아니라 문의 폼으로 접수
 *
 * [1058 · C3] 틀린 사실들의 수정 — 이미 쓴 사람에게 폼이 빈 채 열렸다(GET 이 내 후기를 안 줬다) → `mine` 프리필·"후기 수정";
 * 목록 상한 없음 → 50건 + 더 보기; 날짜가 브라우저 시간대 → KST; 별·도움돼요 누름 면 19·26px → 폰 40px;
 * 로그인 안내 "등록하면 30P가 적립돼요"(재작성·상한이면 0P) → "후기 저장 시 30P · 하루 5회".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ReportButton } from "../components/ReportButton";
import { Icon } from "@/app/components/Icon";
import { CharCount } from "@/app/components/ui/CharCount";
import { useSoftSignup } from "@/app/components/soft-signup/soft-signup-context";
import { kstParts } from "@/lib/format/kst";
import { reviewEditedAt } from "@/lib/complex-reviews/rules";
import { useNearViewport } from "./[id]/use-near-viewport";

type ReviewItem = {
  id: string;
  author: string;
  noiseScore: number;
  parkingScore: number;
  mgmtScore: number;
  neighborScore: number;
  transportScore: number;
  comment: string | null;
  createdAt: string;
  updatedAt?: string | null;
  helpfulCount?: number;
  isResident?: boolean;
  isVisitVerified?: boolean;
  residentPeriod?: string | null;
};

/** 내 후기(로그인 시 GET 이 돌려준다) — 폼 프리필 원본 */
type MyReview = {
  id: string;
  noiseScore: number;
  parkingScore: number;
  mgmtScore: number;
  neighborScore: number;
  transportScore: number;
  comment: string | null;
  isResident: boolean;
  isVisitVerified: boolean;
  residentPeriod: string | null;
};

type Summary = {
  count: number;
  avgNoise: number;
  avgParking: number;
  avgMgmt: number;
  avgNeighbor: number;
  avgTransport: number;
  overall: number;
};

const CATEGORIES = [
  { key: "noiseScore", label: "소음", avgKey: "avgNoise" },
  { key: "parkingScore", label: "주차", avgKey: "avgParking" },
  { key: "mgmtScore", label: "관리", avgKey: "avgMgmt" },
  { key: "neighborScore", label: "이웃", avgKey: "avgNeighbor" },
  { key: "transportScore", label: "교통", avgKey: "avgTransport" },
] as const;

type ScoreKey = (typeof CATEGORIES)[number]["key"];

const EMPTY_SCORES: Record<ScoreKey, number> = {
  noiseScore: 0,
  parkingScore: 0,
  mgmtScore: 0,
  neighborScore: 0,
  transportScore: 0,
};

function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <span
      className="font-bold text-brand-red"
      style={{ fontSize: size }}
      aria-label={`별점 ${value.toFixed(1)}점`}
    >
      {"★".repeat(Math.round(value))}
      <span className="text-line">{"★".repeat(5 - Math.round(value))}</span>
    </span>
  );
}

function StarInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="w-[42px] shrink-0 t-caption font-bold text-text-2">{label}</span>
      <div className="flex" role="radiogroup" aria-label={`${label} 별점`}>
        {[1, 2, 3, 4, 5].map((n) => (
          /* [1058 · C3] 별 글자(19px)가 곧 누름 면이었다 — 폰은 40×40 칸, md+ 는 24×24 */
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}점`}
            onClick={() => onChange(n)}
            className={`inline-flex h-10 w-10 items-center justify-center text-[19px] leading-none transition-colors md:h-6 md:w-6 ${
              n <= value ? "text-brand-red" : "text-line hover:text-brand-red/50"
            }`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

/** [1058 · C3] "YYYY.MM.DD" — KST 고정. 틀린 사실: new Date(iso).getDate() 는 보는 사람의 브라우저 시간대라 해외·UTC 기기에서 하루 어긋났다 */
function formatDate(iso: string): string {
  const p = kstParts(iso);
  if (!p) return "";
  return `${p.year}.${String(p.month).padStart(2, "0")}.${String(p.day).padStart(2, "0")}`;
}

export function ComplexReviews({
  complexId,
  complexName,
}: {
  complexId: string;
  complexName: string;
}) {
  const pathname = usePathname();
  const { promptSignup } = useSoftSignup();
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [mine, setMine] = useState<MyReview | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [moreState, setMoreState] = useState<"idle" | "loading" | "error">("idle");

  const [formOpen, setFormOpen] = useState(false);
  const [scores, setScores] = useState<Record<ScoreKey, number>>(EMPTY_SCORES);
  const [comment, setComment] = useState("");
  const [isResident, setIsResident] = useState(false);
  const [isVisitVerified, setIsVisitVerified] = useState(false);
  const [residentPeriod, setResidentPeriod] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "sending" | "done">("idle");
  /* [1056 · B3] 저장 뒤 실제 적립액 — 재작성·상한이면 0 이라 문구에 "+30P" 를 고정으로 적지 않는다 */
  const [savedPoints, setSavedPoints] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // 도움돼요 — 서버 authoritative count 오버라이드 + 투표 완료 표시(중복 방지)
  const [helpfulOverride, setHelpfulOverride] = useState<Record<string, number>>({});
  const [votedIds, setVotedIds] = useState<Record<string, boolean>>({});
  const [helpfulBusy, setHelpfulBusy] = useState<Record<string, boolean>>({});
  /* [1058 · C3] 실패를 조용히 삼키던 것 → 그 칩 옆에 "도움 표시 실패 · 잠시 후 다시" */
  const [helpfulFailed, setHelpfulFailed] = useState<Record<string, boolean>>({});

  const voteHelpful = async (reviewId: string) => {
    if (votedIds[reviewId] || helpfulBusy[reviewId]) return;
    setHelpfulBusy((m) => ({ ...m, [reviewId]: true }));
    setHelpfulFailed((m) => ({ ...m, [reviewId]: false }));
    try {
      const res = await fetch("/api/complex-reviews/helpful", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId }),
      });
      if (res.status === 401) {
        promptSignup({
          action: "review_helpful_vote",
          title: "로그인 필요 · 도움돼요",
          benefit: "후기마다 한 번 · 도움 표시가 많은 후기가 위로",
          callbackUrl: pathname ?? "/",
        });
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { count?: number; already?: boolean };
      if (!res.ok) {
        setHelpfulFailed((m) => ({ ...m, [reviewId]: true }));
        return;
      }
      if (typeof data.count === "number") {
        setHelpfulOverride((m) => ({ ...m, [reviewId]: data.count as number }));
      }
      setVotedIds((m) => ({ ...m, [reviewId]: true }));
    } catch {
      setHelpfulFailed((m) => ({ ...m, [reviewId]: true }));
    } finally {
      setHelpfulBusy((m) => ({ ...m, [reviewId]: false }));
    }
  };

  type Page = { reviews?: ReviewItem[]; summary?: Summary | null; mine?: MyReview | null; nextOffset?: number | null };

  const fetchPage = useCallback(
    async (offset: number): Promise<Page> => {
      const res = await fetch(
        `/api/complex-reviews?complexId=${encodeURIComponent(complexId)}${offset > 0 ? `&offset=${offset}` : ""}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error();
      return (await res.json()) as Page;
    },
    [complexId],
  );

  const load = useCallback(async () => {
    try {
      const data = await fetchPage(0);
      setReviews(Array.isArray(data.reviews) ? data.reviews : []);
      setSummary(data.summary ?? null);
      setMine(data.mine ?? null);
      setNextOffset(typeof data.nextOffset === "number" ? data.nextOffset : null);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [fetchPage]);

  const loadMore = async () => {
    if (nextOffset === null || moreState === "loading") return;
    setMoreState("loading");
    try {
      const data = await fetchPage(nextOffset);
      const got = Array.isArray(data.reviews) ? data.reviews : [];
      setReviews((cur) => {
        const seen = new Set(cur.map((r) => r.id));
        return [...cur, ...got.filter((r) => !seen.has(r.id))];
      });
      setNextOffset(typeof data.nextOffset === "number" ? data.nextOffset : null);
      setMoreState("idle");
    } catch {
      setMoreState("error");
    }
  };

  /* [968 · 3] 이 섹션은 단지 페이지 아래쪽(탭·인근 단지 아래)인데 마운트 즉시 조회했다 —
     첫 화면만 보고 떠나는 방문자에게도 하이드레이션 직후 XHR 하나가 나갔다.
     뷰포트 200px 앞에 들어올 때 한 번만 읽는다. IntersectionObserver 가 없는 환경은
     예전처럼 바로 읽는다(기능을 빼지 않는다). 후기 등록 뒤의 재조회(submit → load)는 그대로.
     [1058 · C1] 관찰자는 use-near-viewport 한 훅으로. */
  const rootRef = useRef<HTMLDivElement | null>(null);
  const nearViewport = useNearViewport(rootRef, "200px 0px");

  useEffect(() => {
    if (nearViewport) void load();
  }, [nearViewport, load]);

  /** 폼 열기 — 내 후기가 있으면 그 값으로 채운다(없으면 빈 폼) */
  const openForm = () => {
    if (mine) {
      setScores({
        noiseScore: mine.noiseScore,
        parkingScore: mine.parkingScore,
        mgmtScore: mine.mgmtScore,
        neighborScore: mine.neighborScore,
        transportScore: mine.transportScore,
      });
      setComment(mine.comment ?? "");
      setIsResident(mine.isResident);
      setIsVisitVerified(mine.isVisitVerified);
      setResidentPeriod(mine.residentPeriod ?? "");
    }
    setFormOpen(true);
    setSubmitState("idle");
    setError(null);
  };

  const submit = async () => {
    if (CATEGORIES.some((c) => scores[c.key] < 1)) {
      setError("별점 미선택 항목 있음 · 5개 항목 모두 필요");
      return;
    }
    setSubmitState("sending");
    setError(null);
    try {
      const res = await fetch("/api/complex-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complexId,
          complexName,
          ...scores,
          comment: comment.trim() || null,
          isResident,
          isVisitVerified,
          residentPeriod: residentPeriod.trim() || null,
        }),
      });
      if (res.status === 401) {
        // 예전엔 여기서 곧바로 이동해서 "전송 중" 상태로 남아도 상관없었지만,
        // 이제는 프롬프트를 닫으면 이 화면에 그대로 머문다. idle 로 되돌리지 않으면
        // 등록 버튼이 영영 비활성 상태로 굳는다.
        setSubmitState("idle");
        promptSignup({
          action: "complex_review_create",
          title: "로그인 필요 · 후기",
          /* [1058 · C3] 틀린 사실: "등록하면 30P가 적립돼요" — 재작성·하루 상한이면 0P. 규칙 그대로(catalog review_written) */
          benefit: "후기 저장 시 30P · 하루 5회",
          callbackUrl: pathname ?? "/",
        });
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string; pointsAwarded?: number };
      if (!res.ok) {
        setError(data.error ?? "후기 저장 실패 · 잠시 후 다시");
        setSubmitState("idle");
        return;
      }
      setSavedPoints(typeof data.pointsAwarded === "number" ? data.pointsAwarded : 0);
      setSubmitState("done");
      setFormOpen(false);
      await load();
    } catch {
      setError("후기 저장 실패 · 잠시 후 다시");
      setSubmitState("idle");
    }
  };

  const openLabel = mine ? "후기 수정" : "후기 쓰기";

  return (
    <div ref={rootRef} className="card rounded-2xl px-[18px] py-4 max-md:px-3.5 max-md:py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="t-section text-ink">거주민 후기</h2>
        {!formOpen && (
          <button
            type="button"
            onClick={openForm}
            /* [1015 · 규칙 J] 채움 파랑은 화면당 1개 — 여기는 outline(등록 버튼은 폼 안에서만 채움) */
            className="btn-outline min-h-[40px] rounded-lg px-3.5 py-2 t-sub md:min-h-6"
          >
            {openLabel}
          </button>
        )}
      </div>
      {/* [1015 · 규칙 B] 사용법 세 문장은 폼을 열었을 때만(아래 폼 안의 한 줄) — 목록 위에서는 걷었다 */}

      {submitState === "done" && (
        <div className="mt-2 rounded-lg bg-primary-soft px-3 py-2 t-sub font-bold text-primary">
          {/* [1056 · B3] "등록됐어요. 큰 도움이 됩니다" → 저장 사실 + 실제 적립액(0이면 적지 않는다) */}
          {savedPoints > 0 ? `후기 저장 · +${savedPoints}P` : "후기 저장"}
        </div>
      )}

      {/* 작성 폼 */}
      {formOpen && (
        <div className="mt-3 flex flex-col gap-2.5 rounded-lg border border-line bg-bg p-3.5">
          {mine && <p className="t-caption text-text-3">내 후기 수정 · 같은 단지는 한 건 · 저장하면 기존 후기가 갱신</p>}
          {CATEGORIES.map((c) => (
            <StarInput
              key={c.key}
              label={c.label}
              value={scores[c.key]}
              onChange={(v) => setScores((s) => ({ ...s, [c.key]: v }))}
            />
          ))}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="한줄 후기 (선택 · 500자 이내)"
            className="w-full resize-none rounded-xl border border-line bg-surface p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
          />
          {/* [966] 글자 수 — maxLength 와 같은 상한 */}
          <div className="-mt-1.5 flex justify-end">
            <CharCount value={comment} max={500} />
          </div>

          {/* 신뢰 신호 — 실거주/방문 인증 (선택) */}
          <div className="flex flex-col gap-2">
            <span className="t-sub font-bold text-text-2">신뢰 정보 (선택)</span>
            <div className="flex flex-wrap gap-2">
              <label className="flex min-h-[40px] cursor-pointer items-center gap-1.5 t-sub text-text-1 md:min-h-6">
                <input
                  type="checkbox"
                  checked={isResident}
                  onChange={(e) => setIsResident(e.target.checked)}
                  className="accent-primary"
                />
                실거주 (자가/세입자)
              </label>
              <label className="flex min-h-[40px] cursor-pointer items-center gap-1.5 t-sub text-text-1 md:min-h-6">
                <input
                  type="checkbox"
                  checked={isVisitVerified}
                  onChange={(e) => setIsVisitVerified(e.target.checked)}
                  className="accent-primary"
                />
                방문 (임장)
              </label>
            </div>
            <input
              type="text"
              value={residentPeriod}
              onChange={(e) => setResidentPeriod(e.target.value)}
              maxLength={60}
              placeholder="거주/방문 시기 (선택)"
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 t-sub text-ink outline-none placeholder:text-text-3 focus:border-primary"
            />
          </div>

          {error && <div className="t-sub font-semibold text-danger">{error}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitState === "sending"}
              className="btn-primary flex-1 rounded-xl p-2.5 t-body disabled:opacity-60"
            >
              {submitState === "sending" ? "저장 중…" : mine ? "후기 수정" : "후기 등록"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setError(null);
              }}
              className="btn-secondary rounded-xl px-4 py-2.5 t-body"
            >
              취소
            </button>
          </div>
          <p className="t-caption text-text-3">
            개인 특정·비방 내용은 삭제될 수 있음 · 계정당 시간당 5회 · 저장 시 30P(하루 5회 · 재작성은 적립 없음)
          </p>
        </div>
      )}

      {/* 평균 요약 */}
      {summary && summary.count > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-line bg-bg px-3.5 py-3">
          <div className="flex items-baseline gap-1.5">
            <span className="t-title text-ink">
              {summary.overall.toFixed(1)}
            </span>
            <Stars value={summary.overall} size={13} />
            <span className="t-sub text-text-3">후기 {summary.count}개</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 t-sub text-text-2">
            {CATEGORIES.map((c) => (
              <span key={c.key}>
                {c.label}{" "}
                <strong className="text-ink">
                  {(summary[c.avgKey as keyof Summary] as number).toFixed(1)}
                </strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 목록 */}
      {loadState === "loading" && (
        <div className="mt-3 py-6 text-center t-sub text-text-3">
          후기를 불러오는 중…
        </div>
      )}
      {loadState === "error" && (
        <div className="mt-3 flex flex-col items-center gap-2 py-6 text-center t-sub text-text-3">
          후기 불러오기 실패 · 잠시 후 다시
          <button type="button" onClick={() => void load()} className="btn-soft inline-flex min-h-10 items-center px-4 t-sub font-bold">
            다시 불러오기
          </button>
        </div>
      )}
      {loadState === "ready" && reviews.length === 0 && (
        <div className="mt-3 flex flex-col items-center gap-1 py-6 text-center">
          {/* [1012 · 규칙 6] 권유 → 어디서(단지명)·무엇이 없는지 사실만 — 쓰기 입구는 위 버튼 */}
          <div className="t-body font-bold text-ink">
{complexName} 거주민 후기 없음
          </div>
          <div className="t-sub text-text-3">
            직접 살아봤거나 임장에서 확인한 내용만
          </div>
        </div>
      )}
      {loadState === "ready" && reviews.length > 0 && (
        <ul className="lq-panel mt-3 flex flex-col divide-y" data-tone="hanji">
          {reviews.map((r) => {
            const edited = reviewEditedAt(r.createdAt, r.updatedAt);
            return (
            <li key={r.id} className="flex flex-col gap-1.5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="t-sub font-bold text-ink">
                  {r.author}
                  {mine?.id === r.id && <span className="ml-1 t-caption font-normal text-text-3">내 후기</span>}
                </span>
                <Stars
                  value={
                    (r.noiseScore +
                      r.parkingScore +
                      r.mgmtScore +
                      r.neighborScore +
                      r.transportScore) /
                    5
                  }
                />
                <span className="t-caption text-text-3">
                  {formatDate(r.createdAt)}
                  {/* [1058 · C3] 재작성된 후기는 "수정 YYYY.MM.DD" — created_at 만 적어 갱신 사실이 안 보였다 */}
                  {edited ? ` · 수정 ${formatDate(edited)}` : ""}
                </span>
                {/* [1058 · C3] 후기 신고는 문의 폼으로(후기는 글 신고 API 대상이 아니다) */}
                <ReportButton postId={`complex-review:${r.id}`} targetType="review" className="ml-auto" />
              </div>

              {/* 신뢰 배지 — 실거주 / 방문 / 시기 */}
              {(r.isResident || r.isVisitVerified || r.residentPeriod) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.isResident && (
                    <span
                      className="chip chip-pad t-caption"
                      style={{ background: "var(--success-soft)", color: "var(--success)" }}
                    >
                      실거주
                    </span>
                  )}
                  {r.isVisitVerified && (
                    <span className="chip bg-primary-soft chip-pad t-caption text-primary">
                      방문
                    </span>
                  )}
                  {r.residentPeriod && (
                    <span className="t-caption text-text-3">{r.residentPeriod}</span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 t-caption text-text-3">
                {CATEGORIES.map((c) => (
                  <span key={c.key}>
                    {c.label} {r[c.key]}
                  </span>
                ))}
              </div>
              {r.comment && (
                <p className="t-body text-text-1">{r.comment}</p>
              )}

              {/* 도움돼요 투표 — [1058 · C3] 칩 높이 26px → 폰 40px(md+ 24px) · 실패 문구 */}
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void voteHelpful(r.id)}
                  disabled={votedIds[r.id] || helpfulBusy[r.id]}
                  aria-pressed={votedIds[r.id] ?? false}
                  className={`press chip inline-flex min-h-[40px] items-center gap-1 border border-line px-2.5 t-caption md:min-h-6 ${
                    votedIds[r.id]
                      ? "bg-primary-soft text-primary"
                      : "bg-surface text-text-2 hover:text-primary"
                  } disabled:opacity-70`}
                >
                  <Icon name="thumbs-up" size={13} />
                  도움돼요 {helpfulOverride[r.id] ?? r.helpfulCount ?? 0}
                </button>
                {helpfulFailed[r.id] && (
                  <span role="alert" className="t-caption font-bold text-danger">
                    도움 표시 실패 · 잠시 후 다시
                  </span>
                )}
              </div>
            </li>
            );
          })}
        </ul>
      )}
      {/* [1058 · C3] 더 보기 — 50건씩. 상한 없는 목록이 1,000행에서 조용히 잘리던 것의 수정 */}
      {loadState === "ready" && nextOffset !== null && (
        <div className="mt-2 flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={moreState === "loading"}
            className="btn-soft inline-flex min-h-10 items-center px-4 t-sub font-bold disabled:opacity-60"
          >
            {moreState === "loading" ? "불러오는 중…" : "더 보기"}
          </button>
          {moreState === "error" && (
            <span role="alert" className="t-caption font-bold text-danger">
              후기 불러오기 실패 · 잠시 후 다시
            </span>
          )}
        </div>
      )}
    </div>
  );
}
