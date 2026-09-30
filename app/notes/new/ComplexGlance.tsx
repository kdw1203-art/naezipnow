"use client";
/* [1026b · 노트 쓰기] 1단계 위치 카드 바로 아래 — ① "이 단지 한눈에"(GET /api/complex/[id]/detail, 공개) 한 줄 결론 + 사실 칩 줄
   ② "내 지난 노트" 띠(로그인 힌트가 있을 때만 GET /api/me/complex-records) — 내 노트 N개 · 마지막 방문일 · 점수 + "지난 체크 불러오기"
   (?revisit= 과 같은 로더 fetchRevisit → 같은 프리필을 지금 입력 위에 합친다) + "지난 노트 보기 ›". 단지 사실은 이 카드 한 곳(데스크톱
   레일에 두면 5축 레이더가 저장 카드 밑으로 밀려 첫 화면에서 안 보였다 — 통합 실측).

   번들: NoteForm 이 next/dynamic(ssr:false)으로 받고 단지 id 가 있을 때만 마운트한다 — 조회·판정·UI 가 전부 이 조각 안에 있다.
   값은 응답에 있는 것만(lib/notes/complex-glance). 실패하면 카드도 띠도 없다. 상태(태그·체크리스트 등)는 NoteForm 이 든다. */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/app/components/Icon";
import { useToast } from "@/app/components/toast/ToastProvider";
import {
  glanceFromDetail,
  loadComplexDetail,
  loadMyComplexNotes,
  myNotesLine,
  type ComplexGlanceView,
  type MyNotesLine,
} from "@/lib/notes/complex-glance";
import { mergeRevisitSeed, type RevisitFormState } from "@/lib/notes/form-extras";
import type { RevisitPrefill } from "@/lib/inspection/revisit-prefill";
import { fetchRevisit } from "./NoteNewEntry";

/** 단지 사실 — 같은 id 는 한 번만 조회(폼 카드와 레일이 나눠 쓴다) */
function useComplexGlance(id: string, fallbackName: string): ComplexGlanceView | null {
  const [got, setGot] = useState<{ id: string; raw: unknown } | null>(null);
  useEffect(() => {
    let alive = true;
    void loadComplexDetail(id).then((raw) => {
      if (alive) setGot({ id, raw });
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return useMemo(
    () => (got && got.id === id ? glanceFromDetail(got.raw, id, fallbackName) : null),
    [got, id, fallbackName],
  );
}

/** 사실 칩 줄 + 단지 상세 링크(공개 노트가 있으면 그 수) */
function GlanceFacts({ view }: { view: ComplexGlanceView }) {
  return (
    <ul className="m-0 mt-2 flex list-none flex-wrap items-center gap-1.5 p-0">
      {view.chips.map((c) => (
        <li key={c.key} className="rounded-md bg-bg px-2 py-1 t-caption t-num text-text-2">
          {c.text}
        </li>
      ))}
      <li>
        <Link href={view.href} className="inline-flex min-h-10 items-center px-1 t-sub font-bold text-primary">
          {view.notesCount != null ? `공개 노트 ${view.notesCount.toLocaleString("ko-KR")}개` : "단지 상세"} ›
        </Link>
      </li>
    </ul>
  );
}

export type ComplexGlanceProps = {
  id: string;
  aptName: string;
  /** 수정 화면이면 그 노트 id — 내 노트 수에서 빼고, "지난 체크 불러오기"는 그리지 않는다(새 노트만) */
  editId: string | null;
  /** 지금 폼(불러오기 전 값 — 합치기 재료이자 "비우기"가 되돌릴 값) */
  form: RevisitFormState;
  /** 이미 이 단지의 지난 노트를 이어받은 상태(재방문 배너가 떠 있다) — 띠를 또 그리지 않는다 */
  linked: boolean;
  /** 응답에 단지 좌표가 있고 폼 좌표가 비었을 때(새 노트만 넘긴다) — 방문 인증 카드의 기준 */
  onCoords?: (lat: number, lng: number) => void;
  onRevisit: (seed: RevisitPrefill, merged: RevisitFormState, before: RevisitFormState) => void;
};

export function ComplexGlance(p: ComplexGlanceProps) {
  const { showToast } = useToast();
  const view = useComplexGlance(p.id, p.aptName);

  /* 좌표 — 응답에 있고 폼이 비었으면 한 번 넘긴다(넘길 곳이 없으면 NoteForm 이 undefined 를 준다) */
  const onCoordsRef = useRef(p.onCoords);
  useEffect(() => {
    onCoordsRef.current = p.onCoords;
  });
  useEffect(() => {
    if (view?.lat != null && view.lng != null) onCoordsRef.current?.(view.lat, view.lng);
  }, [view]);

  const [mine, setMine] = useState<{ id: string; line: MyNotesLine | null } | null>(null);
  useEffect(() => {
    let alive = true;
    void loadMyComplexNotes(p.id).then((raw) => {
      if (alive) setMine({ id: p.id, line: myNotesLine(raw, p.editId) });
    });
    return () => {
      alive = false;
    };
  }, [p.id, p.editId]);
  const line = mine && mine.id === p.id ? mine.line : null;

  /* 불러오는 동안 바뀐 입력도 지키게 — 응답이 온 순간의 폼 위에 합친다. 그 사이 단지를 바꿨거나 조각이 내려갔으면 버린다 */
  const latestRef = useRef({ form: p.form, id: p.id, alive: true });
  useEffect(() => {
    latestRef.current.form = p.form;
    latestRef.current.id = p.id;
  });
  useEffect(() => {
    const cur = latestRef.current;
    cur.alive = true;
    return () => {
      cur.alive = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const loadPrevious = async () => {
    if (!line || busy) return;
    const askedFor = p.id;
    setBusy(true);
    const seed = await fetchRevisit(line.latestId);
    const now = latestRef.current;
    if (!now.alive) return;
    setBusy(false);
    if (now.id !== askedFor) return;
    if (!seed) {
      showToast("지난 노트를 불러오지 못했어요");
      return;
    }
    const before = now.form;
    p.onRevisit(seed, mergeRevisitSeed(before, seed), before);
    showToast("지난 체크를 불러왔어요");
  };

  return (
    <>
      {view && (
        <section aria-label="이 단지" className="card rounded-2xl p-4 max-md:p-3.5">
          <h2 className="t-section text-ink">{view.headline}</h2>
          <GlanceFacts view={view} />
        </section>
      )}
      {line && !p.linked && (
        <div className="card flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-2 max-md:px-3.5">
          <Icon name="repeat" size={16} className="shrink-0 text-primary" />
          <p className="min-w-0 flex-1 t-sub t-num text-text-1">{line.text}</p>
          <div className="flex shrink-0 items-center gap-3">
            {!p.editId && (
              <button
                type="button"
                onClick={() => void loadPrevious()}
                disabled={busy}
                className="btn-outline btn-md whitespace-nowrap disabled:opacity-60"
              >
                {busy ? "불러오는 중…" : "지난 체크 불러오기"}
              </button>
            )}
            <Link
              href={`/notes/${encodeURIComponent(line.latestId)}`}
              className="inline-flex min-h-10 items-center whitespace-nowrap t-sub font-bold text-primary"
            >
              지난 노트 보기 ›
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
