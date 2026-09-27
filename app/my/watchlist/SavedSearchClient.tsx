"use client";

import { useState } from "react";
import { Icon } from "@/app/components/Icon";
import { useToast } from "@/app/components/toast/ToastProvider";
import {
  SCOPE_LABELS,
  type SavedSearch,
  type SavedSearchScope,
} from "@/lib/saved-search/types";

const SCOPES: SavedSearchScope[] = ["map", "listings", "complex", "auctions", "news", "apply"];

function riseClass(index: number): string {
  if (index <= 0) return "rise-in";
  if (index === 1) return "rise-in-1";
  return "rise-in-2";
}

export function SavedSearchClient({ initial }: { initial: SavedSearch[] }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<SavedSearch[]>(initial);
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<SavedSearchScope>("map");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** GET 으로 목록을 다시 읽어 상태를 동기화한다. */
  async function refresh(): Promise<void> {
    try {
      const res = await fetch("/api/saved-searches", { cache: "no-store" });
      if (!res.ok) throw new Error("목록을 불러오지 못했어요.");
      const data = (await res.json()) as { items?: SavedSearch[] };
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setError("목록을 새로고침하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) {
      setError("검색 이름을 입력해 주세요.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: trimmed,
          query: query.trim(),
          scope,
          filters: {},
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "저장에 실패했어요.");
      }
      setLabel("");
      setQuery("");
      setScope("map");
      await refresh();
      showToast("검색을 저장했어요");
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했어요.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(item: SavedSearch): Promise<void> {
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/saved-searches/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertEnabled: !item.alertEnabled }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "변경에 실패했어요.");
      }
      await refresh();
      showToast(item.alertEnabled ? "알림을 껐어요" : "알림을 켰어요");
    } catch (err) {
      setError(err instanceof Error ? err.message : "변경에 실패했어요.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: SavedSearch): Promise<void> {
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/saved-searches/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "삭제에 실패했어요.");
      }
      await refresh();
      /* [961] 되돌리기 토스트 — 파괴적 동작에 확인 모달 대신 흐름을 끊지 않고 되돌릴 길을 준다.
         되돌리기는 같은 내용으로 다시 저장한다(서버는 새 id 를 발급). */
      showToast("검색을 삭제했어요", {
        label: "되돌리기",
        onClick: () => {
          /* [1009 · H] 되돌리기 실패도 말한다 — 예전엔 결과를 보지 않아 실패해도 조용히 사라졌다 */
          void fetch("/api/saved-searches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              label: item.label,
              query: item.query ?? "",
              scope: item.scope,
              filters: item.filters ?? {},
            }),
          })
            .then(async (r) => {
              if (!r.ok) {
                const d = (await r.json().catch(() => ({}))) as { error?: string };
                showToast(d.error ? `되돌리지 못했어요 — ${d.error}` : "되돌리지 못했어요 — 위에서 다시 저장해 주세요");
                return;
              }
              showToast("검색을 되돌렸어요");
              await refresh();
            })
            .catch(() => showToast("되돌리지 못했어요 — 연결을 확인하고 다시 저장해 주세요"));
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했어요.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    /* [v4 · 규칙 5·7·8·10] 폼 머리 아이콘 · 버튼 아이콘 · 가운데 빈 카드(아이콘 원) · 카드 목록 → 글자 제목 · 한 줄 빈 상태 ·
       1px 선 행(왼쪽 이름 + 범위·검색어 한 줄 / 오른쪽 알림·삭제). 조작 버튼(알림·삭제)의 아이콘은 조작이라 남긴다 */
    <div className="flex w-full flex-col gap-6">
      {/* 생성 폼 */}
      <form onSubmit={handleCreate} className="card rise-in flex flex-col gap-3 rounded-lg p-4">
        <h2 className="t-section text-ink">새 검색 저장</h2>

        <label className="flex flex-col gap-1">
          <span className="t-sub font-semibold text-text-2">검색 이름</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            placeholder="예) 강남 30평대 전세"
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 t-body text-ink placeholder:text-text-3"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="t-sub font-semibold text-text-2">탐색 범위</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as SavedSearchScope)}
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 t-body text-ink"
          >
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {SCOPE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="t-sub font-semibold text-text-2">
            검색어 <span className="text-text-3">(선택)</span>
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={200}
            placeholder="예) 래미안, 역세권"
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 t-body text-ink placeholder:text-text-3"
          />
        </label>

        <button
          type="submit"
          disabled={creating}
          className="btn-primary btn-md press self-start disabled:opacity-60"
        >
          {creating ? "저장 중…" : "검색 저장"}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="rise-in flex items-start gap-1.5 rounded-xl border border-line bg-primary-soft px-3.5 py-2.5 t-sub text-primary-strong"
        >
          <Icon name="x" size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* 목록 */}
      {items.length === 0 ? (
        /* [1012] 규칙 6 — 누가·어디서 */
        <p className="rise-in border-y border-line py-3 t-sub text-text-3">
          저장한 검색 조건 없음 · 위 폼에서 이름·범위·검색어 저장
        </p>
      ) : (
        <ul data-tone="hanji" className="flex flex-col divide-y divide-line border-y border-line">
          {items.map((item, i) => (
            <li
              key={item.id}
              /* [1009 · H] 행 자체는 누를 수 없다(안의 버튼만) — 눌림(.tile)을 주지 않는다 */
              className={`${riseClass(i)} flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate t-body font-bold text-ink">{item.label}</span>
                <span className="mt-0.5 block truncate t-sub text-text-3">
                  {SCOPE_LABELS[item.scope]} · {item.query ? item.query : "검색어 없음"}
                </span>
              </span>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggle(item)}
                  disabled={busyId === item.id}
                  aria-pressed={item.alertEnabled}
                  className={`press inline-flex items-center gap-1.5 ${
                    item.alertEnabled ? "chip-active" : "chip"
                  } disabled:opacity-60`}
                >
                  <Icon name="bell" size={14} />
                  {item.alertEnabled ? "알림 켜짐" : "알림 꺼짐"}
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  disabled={busyId === item.id}
                  className="press inline-flex min-h-10 items-center gap-1 rounded-full px-2.5 t-sub font-semibold text-text-3 disabled:opacity-60"
                  aria-label={`${item.label} 삭제`}
                >
                  <Icon name="x" size={14} />
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
