"use client";

/**
 * S22 — 쿠키 동의 재설정 링크 (푸터).
 *
 * 배너는 결정 전에만 뜨므로, 한 번 "필수만 허용"을 누른 사용자가 마음을
 * 바꿀 경로가 없었다 — 동의 철회·변경 경로가 없으면 동의 제도 자체가
 * 반쪽이다. 저장된 결정을 지우고 새로고침해 배너를 다시 띄운다.
 */
export function CookieSettingsLink() {
  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.removeItem("nz_cookie_consent");
        } catch {
          /* 접근 불가 시에도 새로고침은 진행 */
        }
        window.location.reload();
      }}
      /* [989] 약관 줄에 함께 서는 텍스트 링크다 — 44px 를 주면 위아래 약관 링크의
         탭을 가져간다. WCAG 2.5.8 기준인 24px 을 세로 패딩으로 맞춘다. */
      className="inline-block py-[3px] text-text-3 underline-offset-2 hover:underline"
    >
      쿠키 설정
    </button>
  );
}
