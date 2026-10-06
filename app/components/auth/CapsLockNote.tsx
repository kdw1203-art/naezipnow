/* [1040 · 로그인] Caps Lock 켜짐 — 비밀번호 칸 아래 한 줄. 대문자로 들어가는 줄 모르고 "비밀번호가 맞지 않아요"를 보던 자리.
   켜졌을 때만 그린다(role="status" — 화면 낭독기가 읽는다). 판정은 lib/auth/auth-ux capsLockOn. */
export function CapsLockNote({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <p role="status" className="w-fit rounded-lg bg-warning-soft px-2.5 py-1 t-caption font-bold text-warning">
      Caps Lock 켜짐
    </p>
  );
}
