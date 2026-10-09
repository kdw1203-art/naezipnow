import { createHash } from "node:crypto";
import { DOC_KINDS, type DocKind } from "@/lib/experts/taxonomy";
import {
  EXPERT_DOC_MAX_BYTES,
  EXPERT_DOC_MAX_FILES,
  EXPERT_DOC_MIME,
  cleanDocName,
  type ExpertDocFile,
} from "@/lib/experts/doc-limits";

export type { ExpertDocFile } from "@/lib/experts/doc-limits";

/**
 * [1047] 전문가 신청 첨부 서류 규칙 — 순수(단위 시험 대상). 저장·서명 주소는 lib/experts/documents.ts.
 *
 * 왜 따로 두나: 면허증 · 사업자등록증은 신분 정보가 실린 서류다. 공용 업로드 버킷(woodong-uploads)이 아니라
 * 전용 비공개 버킷(expert-docs)에, 신청자 폴더(이메일 해시)로만 쌓는다. 신청서에는 **경로만** 남기고
 * 주소(서명 URL)는 저장하지 않는다 — 관리자가 심사 화면에서 열 때마다 5분짜리 주소를 새로 만든다.
 * 신청서가 들고 온 경로가 남의 폴더를 가리키면 거절한다(다른 사람 서류를 내 신청에 붙이는 길을 막는다).
 */

export const EXPERT_DOC_BUCKET = "expert-docs";
/** 관리자 열람 주소 수명(초) */
export const EXPERT_DOC_VIEW_TTL_SECONDS = 300;

/** 신청자 폴더 — 이메일을 그대로 경로에 쓰지 않는다(버킷 목록에 주소가 드러나지 않게) */
export function expertDocFolder(email: string): string {
  const h = createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24);
  return `applications/${h}`;
}

export function isDocKind(v: unknown): v is DocKind {
  return typeof v === "string" && DOC_KINDS.some((d) => d.id === v);
}

/**
 * 신청서가 들고 온 첨부 목록 검증. 이 사람 폴더 아래 경로 · 알려진 종류 · 허용 형식 · 크기 · 개수.
 * 같은 경로는 한 번만.
 */
export function parseDocFiles(
  input: unknown,
  email: string,
): { ok: true; files: ExpertDocFile[] } | { ok: false; error: string } {
  if (input == null) return { ok: true, files: [] };
  if (!Array.isArray(input)) return { ok: false, error: "첨부 목록 형식이 아닙니다." };
  if (input.length > EXPERT_DOC_MAX_FILES) return { ok: false, error: `첨부는 ${EXPERT_DOC_MAX_FILES}개까지예요.` };
  const folder = `${expertDocFolder(email)}/`;
  const seen = new Set<string>();
  const files: ExpertDocFile[] = [];
  for (const raw of input) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const path = String(r.path ?? "");
    if (!path.startsWith(folder) || path.includes("..") || !/^[A-Za-z0-9/_.-]+$/.test(path)) {
      return { ok: false, error: "첨부 파일 경로가 이 계정의 것이 아닙니다. 다시 올려 주세요." };
    }
    if (!isDocKind(r.kind)) return { ok: false, error: "첨부 종류를 골라 주세요." };
    const mime = String(r.mime ?? "");
    if (!(EXPERT_DOC_MIME as readonly string[]).includes(mime)) {
      return { ok: false, error: "첨부는 사진(JPG·PNG·WEBP) 또는 PDF 만 받아요." };
    }
    const size = Number(r.size ?? 0);
    if (!Number.isFinite(size) || size <= 0 || size > EXPERT_DOC_MAX_BYTES) {
      return { ok: false, error: "첨부 하나는 10MB 이하여야 해요." };
    }
    if (seen.has(path)) continue;
    seen.add(path);
    files.push({
      path,
      kind: r.kind,
      name: cleanDocName(r.name),
      size: Math.floor(size),
      mime,
      uploadedAt: typeof r.uploadedAt === "string" ? r.uploadedAt.slice(0, 40) : new Date().toISOString(),
    });
  }
  return { ok: true, files };
}
