"use client";

import { useEffect, useState } from "react";
import { BASIC_FIELD_ORDER, validateRequiredBasicInfo, type BasicField, type BasicInfo } from "@/lib/account/basic-info";
import { EMPTY_DRAFT, basicFieldId, type BasicDraft } from "./BasicInfoFields";

/* [1138] 설정 카드 · 완성 화면이 같이 쓰는 불러오기 · 저장. 조회 실패는 실패로(빈 칸으로 위장하지 않는다 — 저장을 막는다).
   저장이 끝나 여섯 칸이 다 찼으면 이 탭에 "완성" 표시를 남긴다(BasicInfoGate 가 다시 묻지 않게). */
export const BASIC_OK_KEY = "nz_basic_ok";

export function markBasicComplete(): void {
  try {
    window.sessionStorage.setItem(BASIC_OK_KEY, "1");
  } catch {
    /* 저장소를 못 쓰면 다음 화면에서 한 번 더 확인할 뿐 */
  }
}

type Phase = "loading" | "ready" | "failed";

export function useBasicInfoForm(prefix: string) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [value, setValue] = useState<BasicDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Partial<Record<BasicField, string>>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fill = (d: Partial<BasicInfo>) => {
    const next = { ...EMPTY_DRAFT };
    for (const f of BASIC_FIELD_ORDER) next[f] = d[f] ?? "";
    setValue(next);
  };

  useEffect(() => {
    let alive = true;
    fetch("/api/me/basic-info", { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (!r.ok) return setPhase("failed");
        fill((await r.json()) as Partial<BasicInfo>);
        setPhase("ready");
      })
      .catch(() => alive && setPhase("failed"));
    return () => {
      alive = false;
    };
  }, []);

  const onChange = (f: BasicField, v: string) => {
    setValue((b) => ({ ...b, [f]: v }));
    if (errors[f]) setErrors((e) => ({ ...e, [f]: undefined }));
    setMsg(null);
  };

  /** 성공하면 true */
  const save = async (): Promise<boolean> => {
    if (busy) return false;
    const v = validateRequiredBasicInfo(value);
    if (!v.ok) {
      setErrors({ [v.field]: v.error });
      document.getElementById(basicFieldId(prefix, v.field))?.focus();
      return false;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/me/basic-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const d = (await r.json().catch(() => null)) as (Partial<BasicInfo> & { error?: string; field?: BasicField; complete?: boolean }) | null;
      if (!r.ok) {
        if (d?.field) setErrors({ [d.field]: d.error ?? "확인 필요" });
        setMsg({ ok: false, text: d?.error ?? "기본 정보 저장 실패 · 잠시 후 다시" });
        return false;
      }
      if (d) fill(d);
      if (d?.complete) markBasicComplete();
      setMsg({ ok: true, text: "저장됨" });
      return true;
    } catch {
      setMsg({ ok: false, text: "기본 정보 저장 실패 · 잠시 후 다시" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { phase, value, errors, busy, msg, onChange, save };
}
