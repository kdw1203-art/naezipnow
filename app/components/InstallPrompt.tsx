"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FALLBACK_BOTTOM,
  bottomAboveTabBar,
  cookieConsentDecided,
  dismissedRecently,
  engagedEnoughForInstall,
  isInstalled,
  recordVisitDay,
  rememberDismiss,
  trackPwa,
} from "@/lib/client/pwa-install";
import {
  captureInstallPrompt,
  subscribeInstallPrompt,
  getDeferredInstallPrompt,
  takeDeferredInstallPrompt,
} from "@/lib/client/pwa-install-prompt";

/**
 * G9 — PWA 설치 프롬프트
 *
 * 브라우저가 "이 사이트는 설치 가능하다" 고 **먼저 알려줄 때만** 배너를 띄운다.
 * 그 신호가 `beforeinstallprompt` 다. 이 이벤트는 manifest 가 유효하고, fetch 핸들러가
 * 있는 서비스워커가 등록돼 있고, HTTPS 이고, 브라우저 자체 참여도 기준을 넘겼을 때만
 * 발생한다. 즉 "설치할 수 있다" 는 우리 추측이 아니라 브라우저의 판정이다.
 *
 * 그래서 UA 문자열로 기기를 찍어 맞히지 않는다. UA 스니핑은 (1) 설치 못 하는 환경에
 * 설치 버튼을 띄우고 (2) 새 브라우저가 나올 때마다 틀린다. 이벤트가 안 오면 안 띄운다 —
 * 못 띄우는 게 아니라 띄우면 안 되는 상황이라고 본다.
 *
 * ⚠️ 알려진 미구현: iOS Safari
 *   iOS 사파리는 `beforeinstallprompt` 를 구현하지 않는다(웹 표준이 아니라 Chromium
 *   확장 API 다). 홈 화면 추가는 공유 시트를 직접 여는 수동 경로뿐이고, 웹에서
 *   프로그램적으로 띄울 방법이 없다. 그래서 iOS 에서는 이 배너가 절대 안 뜬다.
 *
 *   2026-08-04 해소: 소유자 실기기(iPhone·Safari) 확인을 전제로 IosInstallHint 를
 *   따로 만들었다. 그쪽은 버튼이 아니라 "공유 → 홈 화면에 추가" **안내**만 하고,
 *   메뉴가 없는 인앱 브라우저·다른 iOS 브라우저는 제외한다. 이 컴포넌트는 여전히
 *   Chromium 의 판정만 따른다 — 두 경로가 서로의 조건을 넘보지 않는다.
 */

/**
 * 닫으면 30일간 다시 안 띄운다.
 * 이벤트는 페이지를 열 때마다 다시 발생하므로, 기억하지 않으면 닫아도 다음 방문에
 * 또 뜬다 — 그건 설치 유도가 아니라 그냥 방해다. (기간·저장 로직은 lib/client/pwa-install)
 */
const DISMISS_KEY = "nuguzip:pwa-install-dismissed-at";

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [bottom, setBottom] = useState(FALLBACK_BOTTOM);
  /* 화면 전체를 덮는 모달(ui/Modal · 소프트 가입 등)이 열려 있는 동안에는 배너를 내린다 —
     보이지만 못 누르는 컨트롤은 없는 것보다 나쁘다. 표식은 ui/Modal 이 body 에 남긴다
     (data-modal-open). [968 · 47] 이 규칙의 계기였던 홈 베타 "모달"은 인라인 배너가 돼
     더는 겹치지 않는다 — 옵저버는 배너가 **떠 있는 동안만** 단다(늘 도는 옵저버 하나 삭감). */
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const read = () => setModalOpen(document.body.dataset.modalOpen != null);
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-modal-open"] });
    return () => observer.disconnect();
  }, [visible]);

  /* 위치는 탭바를 실제로 재서 정한다(lib/client/pwa-install) — 상수를 박으면
     탭바 디자인이 바뀔 때 배너만 조용히 겹친다. */
  const measure = useCallback(() => setBottom(bottomAboveTabBar()), []);

  useEffect(() => {
    if (isInstalled()) return;
    /* [개선 #14] 오늘 방문을 기록 — 3일째 방문부터 권한다(아래 가드) */
    recordVisitDay();

    /* [968 · 47] 이벤트 보관은 lib/client/pwa-install-prompt 가 한다(전체 메뉴의
       "홈 화면에 추가"와 공유). 여기서는 보관된 이벤트가 생기면 배너를 띄울지만 정한다. */
    captureInstallPrompt();
    let shown = false;
    const onChange = () => {
      const ev = getDeferredInstallPrompt();
      if (!ev) {
        /* 이벤트가 사라졌다 = 설치됐거나(appinstalled) 다른 진입점이 prompt() 를 썼다.
           어느 쪽이든 배너는 치운다. */
        if (shown) {
          shown = false;
          setVisible(false);
        }
        return;
      }
      if (shown) return;
      if (dismissedRecently(DISMISS_KEY)) return;
      /* 모바일 실측 29 — 쿠키 동의가 미결정이면 띄우지 않는다. 첫 방문에
         동의 배너 + 설치 배너가 겹치면 화면 하단이 배너로 덮인다. 동의를
         끝낸 다음 방문(이벤트는 페이지마다 다시 발생)에 뜨면 충분하다. */
      if (!cookieConsentDecided()) return;
      /* [개선 #14, 2026-08-22] 첫 방문 즉시 권하지 않는다 — 30일 실측에서
         노출 243회 대비 수락이 극소수였다. 3일째 방문부터. */
      if (!engagedEnoughForInstall()) return;
      shown = true;
      measure();
      setVisible(true);
      trackPwa("pwa_install_prompt_view");
    };

    const onInstalled = () => {
      /* 배너를 거치지 않고 브라우저 메뉴로 설치했을 수도 있다. 어느 쪽이든 즉시 치운다. */
      shown = false;
      setVisible(false);
      trackPwa("pwa_installed");
    };

    onChange();
    const unsubscribe = subscribeInstallPrompt(onChange);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      unsubscribe();
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [measure]);

  useEffect(() => {
    if (!visible) return;
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [visible, measure]);

  const dismiss = useCallback(() => {
    setVisible(false);
    rememberDismiss(DISMISS_KEY);
    trackPwa("pwa_install_prompt_dismiss");
  }, []);

  const install = useCallback(async () => {
    /* [968 · 47] 꺼내면서 비운다 — beforeinstallprompt 이벤트는 1회용이라 전체 메뉴와
       이 배너가 같은 이벤트를 두 번 prompt() 하면 반드시 실패한다 */
    const deferred = takeDeferredInstallPrompt();
    /* 브라우저 설치 다이얼로그가 뜨는 동안 배너가 뒤에 남아 있을 이유가 없다 */
    setVisible(false);
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      trackPwa("pwa_install_prompt_result", { outcome: choice.outcome });
      /* 여기서 취소했다는 건 "지금은 됐다" 는 뜻이므로 닫기와 같이 취급한다 */
      if (choice.outcome === "dismissed") rememberDismiss(DISMISS_KEY);
    } catch {
      /* 이미 소비된 이벤트를 다시 prompt() 하면 예외가 난다. 조용히 넘긴다. */
    }
  }, []);

  if (!visible || modalOpen) return null;

  return (
    <div
      role="region"
      aria-label="앱 설치 안내"
      /* z-50 은 탭바, z-[190] 은 소프트 가입 모달이다. 그 사이에 둔다 —
         탭바는 가려도 되지만 모달을 가리면 안 된다.
       *
       * 가로 정렬을 `left-1/2 -translate-x-1/2` 가 아니라 `inset-x-0 mx-auto` 로 한다.
       * 이 사이트의 진입 애니메이션 `.rise-in` 은 keyframes 에서 transform 을 쓰고
       * fill-mode 가 both 라, 같은 요소에 걸면 Tailwind 의 -translate-x-1/2 을
       * **덮어쓴 채로 끝난다**(애니메이션 종료 후에도 마지막 키프레임 값이 남는다).
       * 처음에 .rise-in 을 붙였다가 실제로 두 가지가 동시에 깨졌다:
       *   - 세로: translateY(18px) 잔상 때문에 탭바와 6px 겹침
       *   - 가로: -translate-x-1/2 이 사라져 왼쪽 끝이 화면 중앙에 박힘
       * transform 을 안 쓰는 정렬로 바꾸면 애니메이션과 충돌할 여지 자체가 없다.
       * 등장 효과는 opacity 만 건드리는 .fade-in 으로 대체했다. */
      className="fade-in fixed inset-x-0 z-[60] mx-auto w-[min(420px,calc(100%-28px))] rounded-[18px] border border-line bg-surface p-4 shadow-[0_16px_40px_rgba(15,23,42,.18)]"
      style={{ bottom }}
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-[19px] leading-none"
        >
          🏠
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-extrabold text-ink">내집나우를 홈 화면에 추가</div>
          <p className="mt-1 text-[12px] leading-relaxed text-text-2">
            앱처럼 바로 열 수 있고, 저장한 임장노트는 오프라인에서도 다시 볼 수 있습니다.
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={dismiss}
          className="min-h-[44px] flex-1 rounded-xl border border-line bg-surface px-4 text-[13px] font-semibold text-text-2"
        >
          나중에
        </button>
        <button
          type="button"
          onClick={install}
          className="btn-primary press min-h-[44px] flex-1 rounded-xl px-4 text-[13px] font-bold"
        >
          추가하기
        </button>
      </div>
    </div>
  );
}
