import type { DocKind } from "@/lib/experts/taxonomy";

/* [1047] 전문가 신청 첨부의 한도와 표시 — 화면(클라이언트)과 서버가 같이 읽는 순수 모듈(node 내장 모듈을 쓰지 않는다).
   경로 검증 · 폴더 해시는 lib/experts/document-rules.ts(서버). */

export const EXPERT_DOC_MAX_BYTES = 10 * 1024 * 1024;
export const EXPERT_DOC_MAX_FILES = 8;
export const EXPERT_DOC_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

export type ExpertDocFile = {
  path: string;
  kind: DocKind;
  name: string;
  size: number;
  mime: string;
  uploadedAt: string;
};

/** 화면에 보일 파일 이름 — 경로 문자·제어 문자를 빼고 80자 */
export function cleanDocName(raw: unknown): string {
  const s = String(raw ?? "")
    .replace(/[\\/\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (s || "첨부").slice(0, 80);
}

/** 저장 파일명 — 확장자는 형식에서 정한다(사용자가 붙인 확장자를 믿지 않는다) */
export function docExtForMime(mime: string): string | null {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      return null;
  }
}

export function formatDocSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}
