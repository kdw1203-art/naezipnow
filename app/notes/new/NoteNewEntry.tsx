"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { NoteForm, type NoteFormTemplate } from "./NoteForm";
import type { RevisitPrefill, RevisitSourceNote } from "@/lib/inspection/revisit-prefill";
import {
  needsRemoteEntryData,
  parseNoteNewParams,
  revisitLoginHref,
  type NoteNewParams,
} from "@/lib/notes/new-entry";
import { hasSession } from "@/lib/client/has-session";

/* [1007] 작성 화면 진입 — 정적 셸 + 클라이언트 진입값.
 *
 * 예전 page.tsx 는 searchParams 와 safeAuth() 를 서버에서 읽어 force-dynamic 이었고,
 * 하루 1,790회(24h 실측) 함수를 띄웠다 — 사람 방문은 한 자릿수, 나머지는 크롤러가
 * "노트 쓰기" 링크를 따라온 것. 이제 서버는 스켈레톤(fallback = loading.tsx 와 같은 골격)만
 * 굳혀 두고, 이 컴포넌트가 마운트 뒤 주소를 읽어 NoteForm 에 **같은 props** 를 준다.
 *
 * useSearchParams 를 쓰지 않는 이유: (1) 저장소 규칙 — 정적/ISR 셸에서는 Suspense 경계 없이
 * 프리렌더가 깨지고(HeaderAuth·NewsListClient 주석), (2) 폼은 props 를 useState 초기값으로
 * 쓰므로 URL 이 바뀔 때마다 다시 그리면 안 된다 — 마운트 때 **한 번만** 읽는다.
 *
 * 흐름: 파라미터만 있으면 즉시 폼 → ?tpl 은 /api/note-templates/{id} → ?revisit 은
 * 세션 확인(없으면 예전처럼 /login 으로) 뒤 /api/inspection/notes/{id}(소유자 응답에만
 * authorEmail 이 실린다 — 남의 노트·없는 노트·조회 실패는 예전과 같이 조용히 일반 작성).
 * 회차 프리필 판정(lib/inspection/revisit-prefill)은 그때만 동적 import — 첫 로드 번들에
 * 더하지 않는다(/notes/new 예산 470KB, 실측 462). */

type Resolved = NoteNewParams & {
  template: NoteFormTemplate | null;
  revisitOf: RevisitPrefill | null;
};

type NoteApiResponse = {
  note?: {
    id: string;
    region: string;
    aptName?: string | null;
    visitDate: string;
    scores: RevisitSourceNote["scores"];
    checklist?: { label: string; done: boolean }[];
    sections?: { pros?: string; cons?: string; memo?: string };
    metadata?: Record<string, unknown> | null;
    authorEmail?: string;
  } | null;
};
async function fetchTemplate(id: string): Promise<NoteFormTemplate | null> {
  try {
    const r = await fetch(`/api/note-templates/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as { template?: NoteFormTemplate | null } | null;
    const t = j?.template;
    if (!t || typeof t.id !== "string" || !Array.isArray(t.sections)) return null;
    return { id: t.id, title: String(t.title ?? ""), sections: t.sections };
  } catch {
    /* 템플릿 조회 실패 — 템플릿 없이 일반 작성으로 진행(예전 서버 판정과 같다) */
    return null;
  }
}

/** 소유자의 이전 노트 → 회차 프리필. 아닌 경우는 전부 null(조용히 일반 작성) */
async function fetchRevisit(id: string): Promise<RevisitPrefill | null> {
  try {
    const r = await fetch(`/api/inspection/notes/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as NoteApiResponse | null;
    const note = j?.note;
    /* authorEmail 은 소유자 응답에만 실린다(API 가 남의 노트에서는 뗀다) — 그 사실이 곧 소유자 판정 */
    if (!note || typeof note.authorEmail !== "string" || !note.scores) return null;
    const { buildRevisitPrefill } = await import("@/lib/inspection/revisit-prefill");
    /* 방문일 기본값은 폼이 기기 달력으로 다시 정한다 — 여기서도 기기 날짜를 넘긴다 */
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return buildRevisitPrefill(
      {
        id: note.id,
        region: note.region,
        aptName: note.aptName ?? null,
        visitDate: note.visitDate,
        scores: note.scores,
        checklist: Array.isArray(note.checklist) ? note.checklist : [],
        sections: {
          pros: note.sections?.pros,
          cons: note.sections?.cons,
          memo: note.sections?.memo,
        },
        metadata: (note.metadata ?? null) as Record<string, unknown> | null,
      },
      today,
    );
  } catch {
    return null;
  }
}

export function NoteNewEntry({ fallback }: { fallback: ReactNode }) {
  const router = useRouter();
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    let cancelled = false;
    let params: NoteNewParams;
    try {
      params = parseNoteNewParams(window.location.search);
    } catch {
      params = parseNoteNewParams("");
    }
    if (!needsRemoteEntryData(params)) {
      setResolved({ ...params, template: null, revisitOf: null });
      return;
    }
    void (async () => {
      let revisitJob: Promise<RevisitPrefill | null> = Promise.resolve(null);
      if (params.revisitId) {
        /* [995 · 3] 비로그인은 로그인으로(돌아올 주소에 revisit 을 남긴다) — 서버 redirect 와 같은 목적지 */
        if (!(await hasSession())) {
          if (!cancelled) router.replace(revisitLoginHref(params.revisitId));
          return;
        }
        revisitJob = fetchRevisit(params.revisitId);
      }
      const [template, revisitOf] = await Promise.all([
        params.tplId ? fetchTemplate(params.tplId) : Promise.resolve(null),
        revisitJob,
      ]);
      if (cancelled) return;
      setResolved({ ...params, template, revisitOf });
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!resolved) return <>{fallback}</>;
  return (
    <NoteForm
      template={resolved.template}
      presetMemo={resolved.presetMemo}
      preferAi={resolved.preferAi}
      fromWelcome={resolved.fromWelcome}
      quickStart={resolved.quickStart}
      quickExplicit={resolved.quickExplicit}
      revisitOf={resolved.revisitOf}
    />
  );
}
