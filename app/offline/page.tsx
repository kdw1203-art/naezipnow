import type { Metadata } from "next";
import Link from "next/link";
import { RetryButton } from "./RetryButton";

/**
 * G9 — 오프라인 폴백.
 *
 * 서비스워커가 install 시점에 이 문서를 미리 받아 두었다가, 네트워크가 끊긴 상태의
 * 페이지 이동에서 크롬 공룡 화면 대신 이 화면을 돌려준다.
 *
 * 여기에 시세·매물·노트 같은 **데이터는 절대 넣지 않는다**. 캐시된 부동산 숫자는
 * 언제 찍힌 값인지 알 수 없고, 오래된 시세를 지금 값처럼 보여주는 건 이 서비스에서
 * 가장 하면 안 되는 일이다. 그래서 이 페이지는 데이터 조회가 하나도 없는 정적
 * 문서이며, 캐시하는 것도 이 문서 하나뿐이다.
 */
export const metadata: Metadata = {
  title: "오프라인 — 내집나우",
  description: "인터넷 연결이 끊겼습니다.",
  robots: { index: false, follow: false },
};

/* 데이터가 없으니 재검증할 것도 없다 — 빌드 시 한 번 만들고 정적으로 서빙 */
export const dynamic = "force-static";

/* [968 · 42] 이 문서는 서비스워커가 캐시한 HTML 한 장으로 뜬다. 예전엔 레이아웃이 Tailwind
   유틸(mx-auto·rounded-2xl·bg-primary…)에 기대고 있어서 `/_next/static/css/*.css` 가 캐시에
   없으면(첫 설치 직후·배포로 해시가 바뀐 뒤) 흰 화면에 맨 글자만 남았다. 화면에 필요한
   규칙 전부를 여기 인라인으로 넣어 CSS 번들 없이도 같은 모양이 나오게 한다.
   색은 globals.css 토큰을 var() 로 참조하되 폴백값을 박아 둔다 — 번들이 있으면 다크
   모드까지 토큰을 따라가고, 없으면 라이트 폴백으로 뜬다. 글자 크기는 타입 램프
   (28·19·13·12) 안에서만 쓴다. `>` 같은 문자가 엔티티로 바뀌지 않게 dangerouslySetInnerHTML
   로 넣는다(사용자 입력이 아닌 상수 문자열이다). */
const OFFLINE_CSS = `
.nz-off{box-sizing:border-box;margin:0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;width:100%;max-width:420px;min-height:70vh;padding:24px;text-align:center;color:var(--ink,#191f28);font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.nz-off *{box-sizing:border-box}
.nz-off-glyph{display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:16px;background:var(--bg,#f7f9fc);font-size:28px;line-height:1}
.nz-off-copy{display:flex;flex-direction:column;gap:8px}
.nz-off-title{margin:0;font-size:19px;line-height:1.3;font-weight:800;color:var(--ink,#191f28)}
.nz-off-desc{margin:0;font-size:13px;line-height:1.6;color:var(--text-3,#606a77)}
.nz-off-retry{display:flex;flex-direction:column;align-items:center;gap:8px}
.nz-off-btn{-webkit-appearance:none;appearance:none;display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 24px;border:0;border-radius:16px;background:var(--primary,#1d4fd8);color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:transform .12s ease}
.nz-off-btn:active{transform:scale(.97)}
.nz-off-status{margin:0;min-height:18px;font-size:12px;color:var(--text-3,#606a77)}
.nz-off-home{font-size:13px;font-weight:600;color:var(--primary,#1d4fd8);text-decoration:underline;text-underline-offset:4px}
/* 루트 레이아웃의 "본문 바로가기"는 sr-only 유틸에 기대는데, 번들 없이는 맨 글자로 노출된다 */
a[href="#main-content"]:not(:focus){position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media (prefers-reduced-motion:reduce){.nz-off-btn{transition:none}.nz-off-btn:active{transform:none}}
`;

export default function OfflinePage() {
  return (
    <main id="main-content" className="nz-off">
      <style dangerouslySetInnerHTML={{ __html: OFFLINE_CSS }} />
      <div aria-hidden="true" className="nz-off-glyph">
        📡
      </div>

      <div className="nz-off-copy">
        <h1 className="nz-off-title">인터넷에 연결되어 있지 않아요</h1>
        <p className="nz-off-desc">
          내집나우는 시세·실거래를 항상 최신으로 보여주기 위해 오프라인에서는 데이터를
          저장해 두지 않습니다. 연결이 돌아오면 그대로 이어서 볼 수 있어요.
        </p>
      </div>

      <RetryButton />

      <Link href="/" className="nz-off-home">
        홈으로 가기
      </Link>
    </main>
  );
}
