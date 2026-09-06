"use client";

/**
 * 클로즈 베타 안내 (홈 전용) — [968 · 39] 모달 → 본문 상단 한 줄 배너.
 *
 * 왜 필요한가 — 지금 내집나우는 정식 서비스가 아니다. 화면·기능·데이터 범위가
 * 계속 바뀌는데, 처음 들어온 사람은 그걸 알 방법이 없다. "왜 이 지역은 비어
 * 있지?", "왜 이 숫자가 —로 나오지?" 를 서비스 결함으로 읽고 나가는 대신,
 * 지금이 어떤 단계인지를 먼저 말해 준다.
 *
 * 왜 모달을 접었나(2026-09-06 모바일 감사 항목 39) — 첫 방문의 인터럽션이
 * 겹쳤다: 쿠키 배너 → 900ms 뒤 이 모달 → 설치 배너/iOS 힌트. 화면을 덮는 것이
 * 세 개면 사람은 셋 다 안 읽고 닫는다. 안내는 사실이지 허락을 구하는 일이
 * 아니므로 **본문 위 한 줄**로 충분하다 — 검색창은 그대로 눌리고, 읽고 싶으면
 * 읽고, 닫으면 30일 동안 다시 안 뜬다.
 *
 * 문구 원칙(사실 우선):
 *   - 정식 출시 시점은 오너가 말한 범위("하반기") 그대로만 적는다. 월·일을
 *     지어내지 않는다. 날짜가 정해지면 이 파일의 문구와 STORAGE_KEY 의 버전을
 *     함께 올려 다시 안내한다.
 *   - "데이터가 곧 채워집니다" 같은 약속은 하지 않는다. 확인 안 된 값은 — 로
 *     비워 둔다는 사실만 말한다.
 *
 * 표시 규칙:
 *   - 쿠키 동의가 결정되기 전에는 그리지 않는다(동의 배너와 같은 화면에 두 안내가
 *     동시에 뜨지 않게). 결정 직후에는 바로 나타난다 — 사용자 입력 500ms 안의
 *     레이아웃 이동은 CLS 로 세지 않는다.
 *   - `document.body[data-modal-open]`(ui/Modal · useScrollLock 표식)이 붙어 있는
 *     동안은 숨긴다 — 모달 뒤에서 한 줄이 새로 생기면 배경이 움직여 보인다.
 *   - 닫기는 localStorage 에 시각을 남기고 DISMISS_DAYS 동안 다시 띄우지 않는다
 *     (키는 모달 시절 그대로 — 이미 닫은 사람에게 다시 묻지 않는다).
 *   - 서버 HTML 에는 없다(null). 게스트 캐시·LCP 요소는 그대로다. 재방문자에게
 *     하이드레이션 뒤 한 줄(약 36px)이 끼어드는 이동은 감수한다 — 화면 전체를
 *     덮던 모달보다 싸다.
 *
 * 파일명·export 이름(BetaNoticeModal)은 호출부(app/page.tsx)를 위해 유지한다.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCookieConsent } from "@/components/consent/use-cookie-consent";

/** 문구가 바뀌면 뒤 숫자를 올린다 — 이미 닫은 사람에게도 새 안내가 한 번 더 간다. */
const STORAGE_KEY = "nuguzip:beta-notice-v1";

/** 닫은 뒤 다시 띄우지 않는 기간. 베타 기간 내내 매번 뜨면 그건 공지가 아니라 방해다. */
const DISMISS_DAYS = 30;

function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const at = Date.parse(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    /* 저장소를 못 읽으면(사생활 보호 모드 등) 안내를 한 번 보여 주는 쪽을 택한다. */
    return false;
  }
}

/** body 의 data-modal-open 표식을 따라간다 — 모달이 떠 있는 동안은 배너를 숨긴다 */
function useModalOpen(): boolean {
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => {
    const read = () => setModalOpen(document.body.dataset.modalOpen != null);
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-modal-open"] });
    return () => observer.disconnect();
  }, []);
  return modalOpen;
}

export function BetaNoticeModal() {
  const [show, setShow] = useState(false);
  const { state } = useCookieConsent();
  const consentSettled = state.status === "decided";
  const modalOpen = useModalOpen();

  useEffect(() => {
    if (!consentSettled) return;
    if (dismissedRecently()) return;
    setShow(true);
  }, [consentSettled]);

  function close() {
    setShow(false);
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      /* 저장 실패해도 이번 세션 동안은 닫힌 상태가 유지된다. */
    }
  }

  if (!show || modalOpen) return null;

  return (
    <div
      role="status"
      aria-label="클로즈 베타 안내"
      data-noprint
      className="mb-2.5 flex items-center gap-2 rounded-xl border border-line bg-primary-soft px-3 py-2 text-[12px] leading-[1.45] text-text-1"
    >
      <p className="m-0 min-w-0 flex-1">
        <b className="text-primary">클로즈 베타예요.</b> 정식 출시(올해 하반기)까지 화면이 바뀔 수
        있고, 확인 안 된 값은 <b className="text-ink">—</b> 로 비워 둬요.{" "}
        <Link
          href="/support"
          onClick={close}
          className="whitespace-nowrap font-bold text-primary underline"
        >
          의견 보내기
        </Link>
      </p>
      <button
        type="button"
        onClick={close}
        aria-label="베타 안내 닫기"
        className="tap shrink-0 rounded-full px-1.5 py-0.5 t-caption font-extrabold text-text-3 hover:text-ink"
      >
        닫기
      </button>
    </div>
  );
}
