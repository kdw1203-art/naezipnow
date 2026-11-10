"use client";

import { BasicInfoFields } from "@/app/components/account/BasicInfoFields";
import { useBasicInfoForm } from "@/app/components/account/useBasicInfoForm";

/* [1135 · 기본 정보] 마이 › 설정 — 가입 때 적은 값이 여기에 나온다.
   [1138] 필수 여섯 칸(생년월일 · 주소 · 휴대전화 · 직업 · 보유 주택 · 이용 목적) — 고칠 수는 있어도 비울 수는 없다(지우려면 탈퇴). */
export function BasicInfoCard() {
  const f = useBasicInfoForm("basic");

  return (
    <section aria-labelledby="basic-info-h" className="card mb-4 rounded-2xl p-[var(--pad-card)]">
      <h2 id="basic-info-h" className="m-0 t-section text-ink">
        기본 정보 <span className="t-sub font-medium text-text-3">필수 · 수정 가능</span>
      </h2>
      {f.phase === "loading" ? (
        <div className="skeleton mt-3 h-[320px] rounded-lg" aria-hidden="true" />
      ) : f.phase === "failed" ? (
        <p className="m-0 mt-2 t-sub text-text-3">기본 정보 불러오기 실패 · 잠시 후 다시</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <BasicInfoFields prefix="basic" value={f.value} onChange={f.onChange} errors={f.errors} />
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void f.save()} disabled={f.busy} className="btn-outline btn-md disabled:opacity-60">
              {f.busy ? "저장 중" : "기본 정보 저장"}
            </button>
            {f.msg && (
              <span role="status" className={`t-sub font-bold ${f.msg.ok ? "text-primary" : "text-danger"}`}>
                {f.msg.text}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default BasicInfoCard;
