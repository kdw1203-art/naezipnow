import "server-only";

import sharp from "sharp";
import { getServiceSupabase } from "@/lib/supabase/service";
import { sniffMimeFromBytes } from "@/lib/storage/upload";
import { EXPERT_DOC_MAX_BYTES, EXPERT_DOC_MIME, cleanDocName, docExtForMime, type ExpertDocFile } from "@/lib/experts/doc-limits";
import { EXPERT_DOC_BUCKET, EXPERT_DOC_VIEW_TTL_SECONDS, expertDocFolder } from "@/lib/experts/document-rules";
import type { DocKind } from "@/lib/experts/taxonomy";

/**
 * [1047] 전문가 신청 첨부(면허증 · 사업자등록증 등) 저장 — 전용 비공개 버킷(expert-docs).
 * 규칙(폴더 · 형식 · 크기)은 lib/experts/doc-limits.ts · document-rules.ts.
 *
 *  · 사진은 저장 전에 메타데이터(촬영 위치·기기)를 벗긴다 — 실패하면 올리지 않는다(lib/storage/upload 와 같은 원칙).
 *  · 형식은 파일 앞머리(매직 바이트)로 확인한다 — 이름·Content-Type 만 믿지 않는다.
 *  · 돌려주는 것은 경로뿐. 열람 주소는 관리자 심사 화면이 열 때마다 5분짜리로 만든다(docViewUrl).
 */

export class ExpertDocError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpertDocError";
  }
}

async function stripMeta(raw: Buffer, mime: string): Promise<Buffer> {
  const img = sharp(raw).rotate();
  if (mime === "image/jpeg") return img.jpeg({ quality: 90 }).toBuffer();
  if (mime === "image/png") return img.png().toBuffer();
  return img.webp({ quality: 92 }).toBuffer();
}

export async function uploadExpertDocument(file: File, email: string, kind: DocKind): Promise<ExpertDocFile> {
  if (file.size <= 0) throw new ExpertDocError("빈 파일은 올릴 수 없어요.");
  if (file.size > EXPERT_DOC_MAX_BYTES) throw new ExpertDocError("파일 하나는 10MB 이하여야 해요.");
  const raw = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffMimeFromBytes(raw);
  if (!sniffed || !(EXPERT_DOC_MIME as readonly string[]).includes(sniffed)) {
    throw new ExpertDocError("사진(JPG·PNG·WEBP) 또는 PDF 만 받아요.");
  }
  let body: Buffer = raw;
  if (sniffed !== "application/pdf") {
    try {
      body = await stripMeta(raw, sniffed);
    } catch {
      throw new ExpertDocError("사진을 읽지 못했어요. 다른 파일로 다시 올려 주세요.");
    }
  }
  const sb = getServiceSupabase();
  if (!sb) throw new ExpertDocError("파일 저장소 준비 안 됨 · 잠시 후 다시");
  const ext = docExtForMime(sniffed) ?? "bin";
  const path = `${expertDocFolder(email)}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error } = await sb.storage.from(EXPERT_DOC_BUCKET).upload(path, body, { contentType: sniffed, upsert: false });
  if (error) throw new ExpertDocError(`파일 저장 실패 · 잠시 후 다시 (${error.message})`);
  return { path, kind, name: cleanDocName(file.name), size: body.length, mime: sniffed, uploadedAt: new Date().toISOString() };
}

/** 신청 전에 목록에서 뺀 파일 — 이 사람 폴더 안의 것만 지운다 */
export async function removeExpertDocument(path: string, email: string): Promise<void> {
  const folder = `${expertDocFolder(email)}/`;
  if (!path.startsWith(folder) || path.includes("..")) throw new ExpertDocError("이 계정의 파일이 아닙니다.");
  const sb = getServiceSupabase();
  if (!sb) return;
  await sb.storage.from(EXPERT_DOC_BUCKET).remove([path]);
}

/** 관리자 열람용 5분 주소 */
export async function docViewUrl(path: string): Promise<string> {
  const sb = getServiceSupabase();
  if (!sb) throw new ExpertDocError("파일 저장소 준비 안 됨");
  const { data, error } = await sb.storage.from(EXPERT_DOC_BUCKET).createSignedUrl(path, EXPERT_DOC_VIEW_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new ExpertDocError(`열람 주소를 만들지 못했어요 (${error?.message ?? "원인 불명"})`);
  return data.signedUrl;
}
