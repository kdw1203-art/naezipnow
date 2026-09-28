"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { ComplexPicker, type PickedComplex } from "@/app/analysis/ComplexPicker";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { useHumanGate } from "@/lib/client/human-gate";
import { isBotBrowser } from "@/lib/client/is-bot-ua";
import {
  COMPARE_BAND_LABELS,
  COMPARE_MAX,
  COMPARE_STORAGE_KEY,
  addCompareId,
  compareRowFromDetail,
  parseCompareParam,
  parseStoredIds,
  removeCompareId,
  withCompareParam,
  type CompareRow,
  type DetailLike,
} from "./price-search-model";

/* [1022 · 면적대별 검색·비교] 지시 2 — 타 단지 비교 카드(선반 아래).
   "비교할 단지 추가"(기존 ComplexPicker · /api/search/suggest) → 최대 4곳. 표: 행 = 단지, 열 = 면적대 5칸(그 단지의
   면적대별 **최근 실거래가**·건수·평균 — 기존 `/api/complex/[id]/detail` 응답의 areaBands 에 있는 값만, 없는 칸 "—"),
   마지막 열 = 최근 거래월. 행마다 "단지 보기" 링크·삭제. 선택은 URL `?cmp=id1,id2`(replaceState 만) + localStorage.
   데이터는 클라이언트에서 읽는다 — 사람일 때만(useHumanGate: 봇·마운트 즉시 조회 없음, WorkbenchClient 와 같은 정책),
   행마다 로딩·실패 상태를 그린다. 새 API 는 없다. 지역 중앙값 행(reference)은 페이지가 이미 가진 선반 값이다. */

type RowState =
  | { id: string; status: "loading"; name: string }
  | { id: string; status: "ok"; row: CompareRow }
  | { id: string; status: "error"; name: string; reason: "fail" | "not_found" };

export function CompareComplexes({
  regionName,
  reference,
}: {
  regionName: string;
  /** 이 지역 면적대별 중앙값(선반 값 · AREA_BANDS 순서, 없는 칸 null) */
  reference: (string | null)[];
}) {
  const [ids, setIds] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const human = useHumanGate(cardRef);
  const namesRef = useRef<Record<string, string>>({});
  const abortRef = useRef<Record<string, AbortController>>({});
  const initRef = useRef(false);

  /* 선택이 바뀌면 URL(replaceState)·localStorage 에 같이 적는다 */
  const persist = useCallback((next: string[]) => {
    try {
      localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 사파리 비공개 등 — 저장 실패는 조용히 */
    }
    try {
      const search = withCompareParam(window.location.search, next);
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
    } catch {
      /* URL 을 못 바꿔도 화면은 그대로 */
    }
  }, []);

  /* 처음 한 번 — URL ?cmp= 가 있으면 그것, 없으면 localStorage. 봇은 아무것도 하지 않는다 */
  useEffect(() => {
    if (initRef.current || isBotBrowser()) return;
    initRef.current = true;
    let fromUrl: string[] = [];
    let stored: string[] = [];
    try {
      fromUrl = parseCompareParam(window.location.search);
      stored = parseStoredIds(localStorage.getItem(COMPARE_STORAGE_KEY));
    } catch {
      /* 저장소를 못 읽으면 빈 목록 */
    }
    const next = fromUrl.length ? fromUrl : stored;
    if (next.length) {
      setIds(next);
      /* URL 로 온 선택은 저장소에도, 저장소에서 온 선택은 URL 에도 — 둘을 같게 */
      persist(next);
    }
  }, [persist]);

  const load = useCallback(async (id: string) => {
    abortRef.current[id]?.abort();
    const ac = new AbortController();
    abortRef.current[id] = ac;
    const name = namesRef.current[id] ?? "";
    setRows((prev) => ({ ...prev, [id]: { id, status: "loading", name } }));
    try {
      const res = await fetch(`/api/complex/${encodeURIComponent(id)}/detail`, { signal: ac.signal });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as DetailLike;
      if (ac.signal.aborted) return;
      const row = compareRowFromDetail(id, json, name);
      setRows((prev) => ({
        ...prev,
        [id]: row ? { id, status: "ok", row } : { id, status: "error", name, reason: "not_found" },
      }));
    } catch {
      if (ac.signal.aborted) return;
      setRows((prev) => ({ ...prev, [id]: { id, status: "error", name, reason: "fail" } }));
    }
  }, []);

  /* 사람이 보고 있고 아직 안 읽은 id 만 읽는다 */
  useEffect(() => {
    if (!human) return;
    for (const id of ids) if (!rows[id]) void load(id);
  }, [human, ids, rows, load]);

  /* 지금 목록의 거울 — 갱신 함수 안에서 부수효과(저장·안내)를 내지 않으려고 밖에서 계산한다 */
  const idsRef = useRef(ids);
  idsRef.current = ids;

  const add = useCallback(
    (c: PickedComplex) => {
      /* ComplexPicker 는 고른 직후 한 번, 상세 보강 뒤 한 번 더 부른다 — 같은 id 는 한 번만 */
      namesRef.current[c.id] = c.name;
      const prev = idsRef.current;
      if (prev.includes(c.id)) return;
      if (prev.length >= COMPARE_MAX) {
        setNotice(`최대 ${COMPARE_MAX}곳`);
        return;
      }
      const next = addCompareId(prev, c.id);
      idsRef.current = next;
      setNotice(null);
      setIds(next);
      persist(next);
    },
    [persist],
  );

  const remove = useCallback(
    (id: string) => {
      abortRef.current[id]?.abort();
      const next = removeCompareId(idsRef.current, id);
      idsRef.current = next;
      setNotice(null);
      setIds(next);
      persist(next);
      setRows((prev) => {
        const rest = { ...prev };
        delete rest[id];
        return rest;
      });
    },
    [persist],
  );

  const full = ids.length >= COMPARE_MAX;
  const hasReference = reference.some(Boolean);

  return (
    <div ref={cardRef} className="chart-card" data-reveal="">
      <div className="chart-head">
        <span className="t-section text-ink">타 단지 비교</span>
        <span className="t-caption ml-auto t-num text-text-3">
          {ids.length}/{COMPARE_MAX}곳 · 면적대별 최근 실거래가
        </span>
      </div>

      {/* 단지 추가 — 기존 선택기(검색 → 서제스트). 4곳이면 입력을 막는다 */}
      {full ? (
        <p className="t-sub text-text-3">최대 {COMPARE_MAX}곳 — 한 곳을 지우면 더 담을 수 있음</p>
      ) : (
        <ComplexPicker
          label=""
          placeholder="비교할 단지 추가"
          clearOnSelect
          showChip={false}
          initialComplexId={null}
          initialApt={null}
          onMapClick={null}
          onSelect={add}
        />
      )}
      {notice && (
        <p role="status" className="t-caption text-text-3">
          {notice}
        </p>
      )}

      {ids.length === 0 ? (
        <p className="t-sub text-text-3">담은 단지 없음</p>
      ) : (
        <div className="pxc-scroll">
          <table className="pxc-table t-sub">
            <thead>
              <tr className="t-caption text-text-3">
                <th scope="col" className="pxc-th pxc-th-name">
                  단지
                </th>
                {COMPARE_BAND_LABELS.map((l) => (
                  <th key={l} scope="col" className="pxc-th text-right">
                    {l}
                  </th>
                ))}
                <th scope="col" className="pxc-th text-right">
                  최근 거래월
                </th>
                <th scope="col" className="pxc-th">
                  <span className="sr-only">보기·삭제</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {hasReference && (
                <tr className="pxc-ref">
                  <th scope="row" className="pxc-td pxc-td-name text-left">
                    <span className="t-sub text-ink">{regionName}</span>
                    <span className="t-caption block text-text-3">지역 중앙값</span>
                  </th>
                  {reference.map((v, i) => (
                    <td key={i} className="pxc-td t-num text-right text-text-2">
                      {v ?? "—"}
                    </td>
                  ))}
                  <td className="pxc-td text-right text-text-3">—</td>
                  <td className="pxc-td" />
                </tr>
              )}
              {ids.map((id) => {
                const st = rows[id];
                const name = st?.status === "ok" ? st.row.name : (st?.name || namesRef.current[id] || "단지");
                return (
                  <tr key={id} className="row-hl">
                    <th scope="row" className="pxc-td pxc-td-name text-left">
                      <span className="t-sub font-bold text-ink">{name}</span>
                      {st?.status === "ok" && st.row.region && (
                        <span className="t-caption block text-text-3">{st.row.region}</span>
                      )}
                    </th>
                    {!st || st.status === "loading" ? (
                      <td colSpan={COMPARE_BAND_LABELS.length + 1} className="pxc-td text-text-3">
                        <span role="status">읽는 중…</span>
                      </td>
                    ) : st.status === "error" ? (
                      <td colSpan={COMPARE_BAND_LABELS.length + 1} className="pxc-td">
                        <span role="status" className="text-text-3">
                          {st.reason === "not_found" ? "단지를 찾지 못함" : "실거래를 읽지 못함"}
                        </span>
                        {st.reason === "fail" && (
                          <button
                            type="button"
                            onClick={() => void load(id)}
                            className="press ml-2 inline-flex min-h-10 items-center rounded-lg border border-line px-2.5 t-caption font-bold text-primary"
                          >
                            다시 읽기
                          </button>
                        )}
                      </td>
                    ) : (
                      <>
                        {st.row.cells.map((cell, i) => (
                          <td key={i} className="pxc-td t-num text-right">
                            {cell ? (
                              <>
                                <span className="font-bold text-ink">{cell.latestText}</span>
                                <span className="t-caption block text-text-3">
                                  {cell.count.toLocaleString("ko-KR")}건{cell.avgText ? ` · 평균 ${cell.avgText}` : ""}
                                </span>
                              </>
                            ) : (
                              <span className="text-text-3">—</span>
                            )}
                          </td>
                        ))}
                        <td className="pxc-td t-num text-right text-text-2">{st.row.latestLabel ?? "—"}</td>
                      </>
                    )}
                    <td className="pxc-td pxc-td-act">
                      <span className="flex items-center justify-end gap-1">
                        <Link
                          href={complexHrefFromId(id)}
                          className="inline-flex min-h-10 items-center rounded-lg border border-line px-2.5 t-caption font-bold text-primary no-underline"
                        >
                          단지 보기
                        </Link>
                        <button
                          type="button"
                          onClick={() => remove(id)}
                          aria-label={`${name} 비교에서 삭제`}
                          className="icon-btn press inline-flex items-center justify-center rounded-lg border border-line text-text-3"
                        >
                          <Icon name="x" size={14} />
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
