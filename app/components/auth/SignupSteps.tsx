import { SIGNUP_STEPS, type SignupStepIndex } from "@/lib/auth/auth-ux";

/* [1040 · 가입] 가입 3단계 — 계정 → 메일 인증 → 관심 지역. 가입 폼·인증 메일 안내·환영 화면이 같은 띠를 쓴다.
   "지금 어디이고 몇 단계가 남았나"를 글 대신 막대로(지난 단계 = 채움 · 지금 = 굵은 글자). 서버·클라이언트 공용(JS 0). */
export function SignupSteps({ current, className = "" }: { current: SignupStepIndex; className?: string }) {
  return (
    <ol className={`flex items-start gap-2 ${className}`} aria-label={`가입 ${SIGNUP_STEPS.length}단계 중 ${current + 1}단계`}>
      {SIGNUP_STEPS.map((label, i) => (
        <li key={label} aria-current={i === current ? "step" : undefined} className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={`h-1 rounded-full ${i <= current ? "bg-primary" : "bg-divider"}`} aria-hidden="true" />
          <span className={`t-caption t-num ${i === current ? "font-bold text-ink" : "text-text-3"}`}>
            {i + 1} {label}
          </span>
        </li>
      ))}
    </ol>
  );
}
