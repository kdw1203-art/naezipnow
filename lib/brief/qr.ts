import "server-only";
/**
 * [1025c · 브리핑] 실제 QR — `qrcode` 패키지(서버 전용). 브리핑 문서 오른쪽 아래에 **단지 상세 주소**를 QR 로 앉힌다.
 *
 * 규칙: 이 파일은 서버 컴포넌트(page.tsx)·route 에서만 import 한다 — `server-only` 가 클라이언트 번들 유입을 빌드에서 막는다.
 * 출력은 SVG 문자열(파일·이미지 요청 없음 · 인라인) — qrcode 의 svg 렌더러는 width/height 없이 viewBox 만 적어 CSS 로 크기를
 * 정한다. 실패(패키지 없음·인코딩 오류)는 null — 화면은 주소 텍스트만 남긴다(1025 원래 상태).
 * 색은 흑백 그대로 둔다(스캔 신뢰성 — 토큰 색으로 바꾸지 않는다).
 */
import QRCode from "qrcode";
import { qrSvgMarkup } from "./model";

export async function briefQrSvg(url: string, label = "QR · 단지 화면"): Promise<string | null> {
  try {
    const raw = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
    return qrSvgMarkup(raw, label);
  } catch {
    return null;
  }
}

/** 견본(/pro) 용 — 정리 없이 원문(qrSvgParts 가 viewBox·안쪽만 뽑는다). 실패는 null */
export async function rawQrSvg(url: string): Promise<string | null> {
  try {
    return await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  } catch {
    return null;
  }
}
