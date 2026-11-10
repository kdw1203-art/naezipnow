"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { safeInternalPath } from "@/lib/safe-path";
import { BasicInfoFields } from "@/app/components/account/BasicInfoFields";
import { useBasicInfoForm } from "@/app/components/account/useBasicInfoForm";

/* [1138] 완성 화면 — 여섯 칸을 채우고 저장하면 원래 가려던 곳(?next=)으로. next 는 마운트 뒤에 읽는다(하이드레이션). */
export function BasicInfoComplete() {
  const router = useRouter();
  const f = useBasicInfoForm("complete");
  const [next, setNext] = useState("/");

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("next");
    const n = safeInternalPath(raw, "/");
    setNext(n.startsWith("/my/basic-info") ? "/" : n);
  }, []);

  const submit = async () => {
    if (await f.save()) router.replace(next);
  };

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
      <p className="m-0 t-body text-text-2">서비스 이용에 필요한 기본 정보 · 한 번만 입력</p>
      {f.phase === "loading" ? (
        <div className="skeleton h-[360px] rounded-2xl" aria-hidden="true" />
      ) : f.phase === "failed" ? (
        <p className="m-0 t-sub text-text-3">기본 정보 불러오기 실패 · 잠시 후 다시</p>
      ) : (
        <form
          className="card flex flex-col gap-4 rounded-2xl p-[var(--pad-card)]"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <BasicInfoFields prefix="complete" value={f.value} onChange={f.onChange} errors={f.errors} />
          <button type="submit" disabled={f.busy} className="btn-primary btn-lg w-full disabled:opacity-60">
            {f.busy ? "저장 중" : "저장하고 계속"}
          </button>
          {f.msg && !f.msg.ok && (
            <p role="alert" className="m-0 t-sub font-bold text-danger">
              {f.msg.text}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
