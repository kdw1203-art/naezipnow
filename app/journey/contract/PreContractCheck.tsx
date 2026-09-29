"use client";

/* [1025 · 담당 S] 계약 전 자동 확인 — /journey/contract 일정표 아래 카드 하나(ContractPlanner 는 손대지 않는다).
   단지를 고르면 /api/building/registry(건축HUB 건축물대장 기본개요 · 실제 파라미터 district·bjdongCd·numOfRows)를 부르고,
   응답에 **있는 칸만** 적는다(주용도·사용승인일·세대수·층수·연면적 …). 위반건축물 여부는 기본개요 응답에 없는 항목이라
   응답에 그 키가 있을 때만 적고, 없으면 사실 문장으로 정부24 열람을 가리킨다. 등기부는 자동 조회가 없다 — 인터넷등기소 링크.
   실패·미설정은 사실 문장으로. 채움 파랑은 이 화면에 이미 하나(일정표 캘린더 버튼) — 여기는 없다.
   인쇄(jr-noprint)에서는 숨긴다 — 일정표 종이에 조회 폼이 찍히지 않게.

   [1025b · 담당 S] 카드 하나 안: 단지 검색 → 결과(있는 칸만) → 링크 3개 한 줄. 법정동 코드 칸은 <details> 안(닫힌 채).
   빈 상태는 한 문장 + 단지 검색뿐. 화면 글에서 "건축HUB·기본개요·키 미설정" 같은 내부 말을 걷었다 — "건축물대장" 하나로.
   섹션 온점은 파랑 하나(lq-dot-blue · 일정표 카드들 뒤 몇 번째 section 이든 같은 색). */

import { useEffect, useState } from "react";
import { StepLine } from "@/app/components/StepLine";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { ComplexPicker, type PickedComplex } from "@/app/analysis/ComplexPicker";

type Building = {
  bldNm?: string;
  platPlc?: string;
  newPlatPlc?: string;
  mainPurpsCdNm?: string;
  etcPurps?: string;
  totArea?: string;
  hhldCnt?: string;
  grndFlrCnt?: string;
  ugrndFlrCnt?: string;
  useAprDay?: string;
  raw?: Record<string, string>;
};
type RegistryResponse = { buildings?: Building[]; totalCount?: number; mode?: "live" | "mock" };

type Fetch =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "fail"; note: string }
  | { state: "ok"; mode: "live" | "mock"; total: number; matched: Building[]; district: string };

const IROS = { label: "인터넷등기소", href: "https://www.iros.go.kr" };
const GOV24 = { label: "정부24 건축물대장", href: "https://www.gov.kr" };

const LINK_CLS =
  "inline-flex min-h-[24px] items-center gap-1 t-sub font-bold text-primary no-underline underline-offset-2 hover:underline";

function norm(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}
function dayLabel(v: string | undefined): string | null {
  if (!v) return null;
  return /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}` : v;
}
function areaLabel(v: string | undefined): string | null {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? `${n.toLocaleString("ko-KR")}㎡` : null;
}
function intLabel(v: string | undefined, unit: string): string | null {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? `${n.toLocaleString("ko-KR")}${unit}` : null;
}

function floorsLabel(b: Building): string | null {
  const g = intLabel(b.grndFlrCnt, "층");
  const u = intLabel(b.ugrndFlrCnt, "층");
  if (!g && !u) return null;
  return [g ? `지상 ${g}` : null, u ? `지하 ${u}` : null].filter(Boolean).join(" · ");
}

/** 응답 raw 에 위반건축물 키가 있을 때만 값 — 없으면 null(모른다) */
function violationOf(b: Building): string | null {
  const raw = b.raw ?? {};
  const key = Object.keys(raw).find((k) => /vio/i.test(k) || k.includes("위반"));
  if (!key || !raw[key]) return null;
  return raw[key];
}

/** 있는 칸만 — 값이 없는 줄은 만들지 않는다 */
function rowsOf(b: Building): { k: string; v: string }[] {
  const rows: { k: string; v: string | null }[] = [
    { k: "건물명", v: b.bldNm?.trim() || null },
    { k: "주소", v: b.newPlatPlc?.trim() || b.platPlc?.trim() || null },
    { k: "주용도", v: b.mainPurpsCdNm?.trim() || null },
    { k: "기타 용도", v: b.etcPurps?.trim() || null },
    { k: "사용승인일", v: dayLabel(b.useAprDay) },
    { k: "세대수", v: intLabel(b.hhldCnt, "세대") },
    { k: "층수", v: floorsLabel(b) },
    { k: "연면적", v: areaLabel(b.totArea) },
    { k: "위반건축물", v: violationOf(b) },
  ];
  return rows.filter((r): r is { k: string; v: string } => r.v !== null);
}

export function PreContractCheck() {
  const [picked, setPicked] = useState<PickedComplex | null>(null);
  const [bjdong, setBjdong] = useState("");
  const [res, setRes] = useState<Fetch>({ state: "idle" });

  const id = picked?.id ?? null;
  const region = picked?.region?.trim() ?? "";
  const name = picked?.name ?? "";
  const bjdongCd = /^\d{5}$/.test(bjdong) ? bjdong : null;

  useEffect(() => {
    if (!id) return;
    if (!region) {
      setRes({ state: "fail", note: "단지의 시군구 정보 없음 · 건축물대장 자동 조회 불가 · 정부24에서 열람" });
      return;
    }
    const ac = new AbortController();
    setRes({ state: "loading" });
    (async () => {
      try {
        const qs = new URLSearchParams({ district: region, numOfRows: "100" });
        if (bjdongCd) qs.set("bjdongCd", bjdongCd);
        const r = await fetch(`/api/building/registry?${qs.toString()}`, { signal: ac.signal });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as RegistryResponse;
        if (ac.signal.aborted) return;
        const list = Array.isArray(data.buildings) ? data.buildings : [];
        const n = norm(name);
        const matched = n ? list.filter((b) => b.bldNm && norm(b.bldNm).includes(n)).slice(0, 3) : [];
        setRes({ state: "ok", mode: data.mode === "live" ? "live" : "mock", total: data.totalCount ?? list.length, matched, district: region });
      } catch {
        if (ac.signal.aborted) return;
        setRes({ state: "fail", note: "건축물대장 조회 실패 · 정부24에서 열람" });
      }
    })();
    return () => ac.abort();
  }, [id, region, name, bjdongCd]);

  const hasRows = res.state === "ok" && res.mode === "live" && res.matched.length > 0;

  return (
    <section className="jr-noprint lq-dot-blue card rounded-2xl p-4 max-md:p-3.5" aria-labelledby="jr-precheck">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="jr-precheck" className="m-0 t-section text-ink">
          계약 전 자동 확인
        </h2>
        <span className="t-caption text-text-3">건축물대장 자동 조회 · 등기부는 직접 확인</span>
      </div>

      {/* [1025b] 절차 한 줄 — 단지 → 조회 → 확인 */}
      <StepLine
        className="mt-2"
        current={hasRows || res.state === "fail" ? 2 : picked ? 1 : 0}
        steps={[
          { label: "단지 고르기", note: picked?.name },
          { label: "건축물대장 조회", note: res.state === "loading" ? "조회 중" : undefined },
          { label: "등기부·자가진단 확인" },
        ]}
      />

      {res.state === "idle" && (
        <p className="m-0 mt-2 t-body text-text-1">단지를 고르면 건축물대장의 주용도·사용승인일·세대수·층수를 조회합니다</p>
      )}

      <div className="mt-2">
        <ComplexPicker label="단지" onSelect={setPicked} onMapClick={null} />
      </div>

      <details className="group mt-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="t-sub font-bold text-ink">법정동 코드 · 선택</span>
            <span className="ml-1.5 t-caption text-text-3">{bjdongCd ? bjdongCd : "없으면 시군구 단위 조회"}</span>
          </span>
          <span className="shrink-0 text-text-3 transition-transform group-open:rotate-45" aria-hidden="true">
            +
          </span>
        </summary>
        <div className="flex min-w-0 flex-col gap-1 pb-1 md:max-w-[220px]">
          <label htmlFor="jr-bjdong" className="t-caption font-semibold text-text-3">
            법정동 코드 · 5자리
          </label>
          <input
            id="jr-bjdong"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={5}
            placeholder=""
            value={bjdong}
            onChange={(e) => setBjdong(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
            className="h-10 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 t-body font-semibold text-ink outline-none focus:border-primary"
          />
        </div>
      </details>

      {res.state !== "idle" && (
        <div className="mt-2 flex flex-col gap-2 border-t border-divider pt-2">
          {res.state === "loading" && <LoadingHint text="건축물대장 조회 중" />}
          {res.state === "fail" && <p className="m-0 t-sub text-text-2">{res.note}</p>}
          {res.state === "ok" && res.mode === "mock" && (
            <p className="m-0 t-sub text-text-2">건축물대장 응답 없음 · {res.district} · 정부24에서 열람</p>
          )}
          {res.state === "ok" && res.mode === "live" && res.matched.length === 0 && (
            <p className="m-0 t-sub text-text-2">
              {res.district} 건축물대장 {res.total.toLocaleString("ko-KR")}건 중 &lsquo;{name}&rsquo; 이름 일치 없음
              {bjdongCd ? "" : " · 법정동 코드를 넣으면 그 동만 조회"}
            </p>
          )}
          {res.state === "ok" &&
            res.mode === "live" &&
            res.matched.map((b, i) => {
              const rows = rowsOf(b);
              const vio = violationOf(b);
              return (
                <dl key={`${b.bldNm ?? "b"}-${i}`} className="m-0 divide-y" data-tone="plain">
                  {rows.map((r) => (
                    <div key={r.k} className="flex items-baseline justify-between gap-3 py-1.5">
                      <dt className="shrink-0 t-sub text-text-3">{r.k}</dt>
                      <dd className="m-0 break-words text-right t-body font-bold text-ink">{r.v}</dd>
                    </div>
                  ))}
                  {vio === null && (
                    <div className="flex items-baseline justify-between gap-3 py-1.5">
                      <dt className="shrink-0 t-sub text-text-3">위반건축물</dt>
                      <dd className="m-0 text-right t-sub text-text-3">자동 조회 항목 아님 · 정부24 표제부에서 확인</dd>
                    </div>
                  )}
                </dl>
              );
            })}
          {hasRows && (
            <p className="m-0 t-caption text-text-3">
              국토교통부 건축물대장 · {res.district} {res.total.toLocaleString("ko-KR")}건 중 이름 일치 {res.matched.length}건 · 원본은 정부24
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-divider pt-3">
        <a href={IROS.href} target="_blank" rel="noopener noreferrer" className={LINK_CLS}>
          <Icon name="scroll" size={14} className="shrink-0" />
          {IROS.label}
        </a>
        <a href={GOV24.href} target="_blank" rel="noopener noreferrer" className={LINK_CLS}>
          <Icon name="file-text" size={14} className="shrink-0" />
          {GOV24.label}
        </a>
        <Link href="/safety" className={LINK_CLS}>
          <Icon name="shield" size={14} className="shrink-0" />
          전세 안전 자가진단
        </Link>
      </div>
    </section>
  );
}
