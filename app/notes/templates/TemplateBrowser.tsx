"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { CATEGORIES, type NoteTemplate } from "@/lib/note-templates/types";

/* [#69] 내 체크리스트 공유 폼 — "#섹션제목" 줄 + 항목 줄 텍스트를 구조로 파싱.
   저장되면 목록이 새로고침돼 바로 보인다. 내 템플릿으로 다른 이웃이 노트를
   저장할 때마다 20P(일 5회 상한)가 적립된다. */
function ShareTemplateForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("기본");
  const [description, setDescription] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNeedLogin(false);
    // 파싱: "#제목" 줄 = 새 섹션, 그 외 비어있지 않은 줄 = 체크 항목
    const sections: { title: string; items: string[] }[] = [];
    let current: { title: string; items: string[] } = { title: "체크리스트", items: [] };
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("#")) {
        if (current.items.length > 0) sections.push(current);
        current = { title: line.replace(/^#+\s*/, ""), items: [] };
      } else {
        current.items.push(line.replace(/^[-·•]\s*/, ""));
      }
    }
    if (current.items.length > 0) sections.push(current);
    try {
      const res = await fetch("/api/notes/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, category, sections }),
      });
      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      const json: { id?: string; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !json.id) {
        setError(json.error ?? "저장 실패");
        return;
      }
      setTitle("");
      setDescription("");
      setText("");
      onDone();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
          placeholder="체크리스트 이름 (예: 아이 학령기 실거주 체크)"
          className="min-w-[220px] flex-1 rounded-lg border border-line bg-surface px-3.5 py-2.5 t-body"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2.5 t-body"
          aria-label="카테고리"
        >
          {CATEGORIES.filter((c) => c !== "전체").map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={200}
        placeholder="한 줄 소개 (예: 아이 학령기 실거주)"
        className="rounded-lg border border-line bg-surface px-3.5 py-2.5 t-body"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        placeholder={"# 등하교 동선\n정문에서 초등학교까지 직접 걸어보기\n횡단보도·신호등 개수 세기\n\n# 소음\n창문 닫고 5분, 열고 5분 있어보기"}
        className="rounded-lg border border-line bg-surface px-3.5 py-2.5 font-mono t-body"
      />
      {/* [1015 · 규칙 D] 설명 세 문장 → 규칙 나열 한 줄 */}
      <p className="t-sub text-text-3">
        # 줄 = 섹션 제목 · 나머지 줄 = 항목 · 항목 5개 이상 · 하루 3개 · 모두에게 공개 · 이웃이 저장할 때마다
        20P(일 5회)
      </p>
      {needLogin && (
        <p className="t-sub font-bold text-warning">
          로그인한 사람만 공유할 수 있어요.{" "}
          <Link href="/login?callbackUrl=/notes/templates" className="text-primary underline">
            로그인하고 체크리스트 공유하기 ›
          </Link>
        </p>
      )}
      {error && <p className="t-sub font-bold text-danger">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="btn-primary w-fit rounded-lg px-5 py-2.5 t-body disabled:opacity-60"
      >
        {busy ? "저장 중…" : "체크리스트 공유하기"}
      </button>
    </div>
  );
}

/** 템플릿의 총 항목(체크 아이템) 수 */
function totalItems(t: NoteTemplate): number {
  return t.sections.reduce((sum, s) => sum + s.items.length, 0);
}

function TemplateCard({ t, delay }: { t: NoteTemplate; delay: string }) {
  const sectionCount = t.sections.length;
  const itemCount = totalItems(t);

  return (
    <Link
      href={`/notes/templates/${t.id}`}
      /* [1012] 규칙 1·9 — 카드 12px→8px. 배지는 반짝이 아이콘 없이 사실 명사만("내집나우 공식" / "이웃 제작"),
         연한 배경 + 진한 글자 11px/500, 4px. 카테고리는 배지가 아니라 글자로. */
      className={`card tile press ${delay} flex flex-col gap-3 rounded-lg p-5 no-underline max-md:gap-2 max-md:p-3.5`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {t.isOfficial ? (
          <span className="inline-flex items-center rounded-sm bg-primary-soft px-1.5 py-px t-caption font-medium text-primary">
            내집나우 공식
          </span>
        ) : (
          <span className="inline-flex items-center rounded-sm bg-success-soft px-1.5 py-px t-caption font-medium text-success">
            이웃 제작
          </span>
        )}
        <span className="t-caption text-text-3">{t.category}</span>
      </div>

      <h2 className="t-section text-ink">
        {t.title}
      </h2>

      {t.description && (
        <p className="line-clamp-2 t-body text-text-2">
          {t.description}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 t-sub text-text-3">
        <span className="inline-flex items-center gap-1">
          <Icon name="notebook-pen" size={13} />
          {sectionCount}개 섹션
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon name="check" size={13} />
          {itemCount}개 항목
        </span>
        {/* [#69] 사용 횟수 — 노트 저장 시 실집계(use_count)가 생겼으므로 되살림.
            이웃 템플릿만: 공식은 DB 행이 없어 값이 항상 0 이라 표기가 거짓이 된다. */}
        {!t.isOfficial && t.useCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <Icon name="notebook-pen" size={13} />
            {t.useCount}회 사용
          </span>
        )}
      </div>

      {/* [1012] 규칙 5 — 동사 + 대상 */}
      <span className="t-body font-medium text-primary">
        항목 {itemCount}개 보기 ›
      </span>
    </Link>
  );
}

export function TemplateBrowser({ initial }: { initial: NoteTemplate[] }) {
  const [category, setCategory] = useState<string>("전체");
  const [shareOpen, setShareOpen] = useState(false);
  const router = useRouter();

  const visible = useMemo(() => {
    if (category === "전체") return initial;
    return initial.filter((t) => t.category === category);
  }, [initial, category]);

  return (
    <div className="flex flex-col gap-4 max-md:gap-3">
      {/* [#69] 내 체크리스트 공유 — 공식 목록 옆의 UGC 두 번째 축 */}
      {/* [1012] 규칙 6 — 부제는 누가·언제 + 숫자: 이웃이 내 체크리스트로 노트를 저장할 때마다 20P */}
      <div className="rise-in card flex flex-col gap-2 rounded-lg p-5 max-md:p-3.5">
        <button
          type="button"
          onClick={() => setShareOpen((v) => !v)}
          className="flex items-center justify-between text-left"
          aria-expanded={shareOpen}
        >
          <span className="t-section text-ink">
            내 체크리스트 공유
            <span className="ml-2 t-sub font-bold text-primary">이웃이 쓸 때마다 +20P</span>
          </span>
          <span className="t-body font-bold text-text-3">{shareOpen ? "접기 ▴" : "열기 ▾"}</span>
        </button>
        {shareOpen && (
          <ShareTemplateForm
            onDone={() => {
              setShareOpen(false);
              router.refresh();
            }}
          />
        )}
      </div>

      {/* 카테고리 칩 필터 */}
      <div className="rise-in flex flex-wrap gap-2 t-body">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`chip px-4 py-2 ${
              category === c
                ? "chip-active"
                : "border border-line bg-surface text-text-2"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rise-in-1 flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-12 text-center">
          <Icon name="search" size={22} className="text-text-3" />
          {/* [1012] 규칙 6 — 어느 카테고리에서 몇 개 중 0 인지 */}
          <p className="t-body text-text-2">
            {category} 체크리스트 0개. 전체 {initial.length}개는 &lsquo;전체&rsquo; 칩에서.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 max-md:gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((t, i) => (
            <TemplateCard
              key={t.id}
              t={t}
              delay={i === 0 ? "rise-in" : i === 1 ? "rise-in-1" : "rise-in-2"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
