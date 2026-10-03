"use client";

import { useEffect, useState } from "react";
import { readBuildMark, reportClientError } from "@/lib/client/error-report";

/**
 * G10: 루트 레이아웃까지 깨졌을 때의 최후 바운더리.
 * 이 시점엔 전역 CSS·폰트가 적용되지 않을 수 있어 인라인 스타일만 쓴다
 * (여기서 클래스에 의존하면 에러 화면이 또 깨진다).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  /* [1026g] app/error.tsx 와 같은 한 번 새로고침 — 루트 레이아웃이 쓰는 청크를 못 받아도 여기로 온다
     (2026-10-01 운영 결제 화면 캡처 1회 관측, 같은 조건 6회 재시도는 정상). 같은 세션 두 번째면 이 화면을 그대로 둔다. */
  useEffect(() => {
    try {
      const msg = String(error?.message ?? "");
      const chunkFail = /Loading chunk [\w-]+ failed|ChunkLoadError|Failed to fetch dynamically imported module/i.test(msg);
      if (!chunkFail) return;
      const key = "nz:chunk-reload:" + window.location.pathname;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    } catch {
      /* noop */
    }
  }, [error]);

  /* [1027 · 제안 28] 빌드 표식은 **그리기 전에** 읽어 둔다 — 이 화면은 문서(<html>)를 통째로 갈아 끼우므로,
     effect 가 돌 때는 루트 레이아웃이 심은 <meta name="nz-build"> 가 이미 없을 수 있다. */
  useState(() => readBuildMark());
  useEffect(() => {
    /* [1027 · 제안 28] 브라우저 스택·오류 이름·빌드 표식을 같이 싣는다(lib/client/error-report — 스타일 의존 없음) */
    reportClientError(error, "global", "unknown global error");
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f8fa",
          color: "#191f28",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Malgun Gothic', sans-serif",
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: 420,
            padding: "32px 24px",
            textAlign: "center",
          }}
        >
          {/* [1028 · 제안 3·12] 제목은 해요체인데 아래 설명은 합니다체("로드되지 않았습니다")였다 —
              오류 문구 표준 한 벌("불러오기 실패" + "잠시 후 다시 시도해 주세요.")로 맞춘다 */}
          <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.5 }}>
페이지 불러오기 실패
          </div>
          {/* global-error 는 루트 레이아웃을 대체하므로 globals.css 도 토큰도 없다.
              색을 직접 적을 수밖에 없는데, 그러면 토큰을 고쳐도 여기만 남는다.
              #8b95a1 → #656f7c 는 --text-3 과 같은 값(흰 배경 5.10:1). */}
          <p
            style={{
              marginTop: 8,
              fontSize: 13,
              lineHeight: 1.7,
              color: "#656f7c",
            }}
          >
            잠시 후 다시 시도해 주세요.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: 10,
                fontSize: 11,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: "#656f7c",
              }}
            >
              오류 코드 {error.digest}
            </p>
          )}
          <div
            style={{
              marginTop: 18,
              display: "flex",
              gap: 8,
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                border: 0,
                borderRadius: 12,
                padding: "10px 20px",
                fontSize: 13,
                fontWeight: 700,
                color: "#fff",
                background: "#1d4fd8",
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
            {/* global-error 는 루트 레이아웃까지 대체하는 최후의 경계다.
                이 안에서는 라우터가 이미 깨져 있을 수 있어 <Link> 를 쓰면
                안 된다 — 전체 새로고침이 되는 <a> 가 맞다. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                borderRadius: 12,
                border: "1px solid #e2e7ee",
                background: "#fff",
                padding: "10px 20px",
                fontSize: 13,
                fontWeight: 700,
                color: "#333d4b",
                textDecoration: "none",
              }}
            >
              홈으로
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
