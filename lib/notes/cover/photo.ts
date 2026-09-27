import "server-only";
import { COVER_SIZE, isAllowedCoverPhoto } from "./spec";

/**
 * photo 변형의 배경 사진을 받아 정사각 JPEG data URI 로 — 서버 전용.
 *
 * · 우리 스토리지 주소만(isAllowedCoverPhoto) · 리다이렉트 거부 · 5초 · 12MB 상한 — 사진 주소가 사용자
 *   입력(노트 photos)이라 서버가 남의 주소를 대신 받아 오는 통로가 되지 않게.
 * · sharp 로 720×720 cover-crop JPEG 로 줄여 satori 에 넘긴다(원본 수 MB 를 그대로 넘기면 느리고, WebP 는
 *   satori 가 못 읽는다). sharp 를 못 쓰면 JPEG·PNG 원본만 그대로, 그 밖에는 null(→ navy 로 그린다).
 * · fetch 는 데이터 캐시에 싣지 않는다(no-store) — 큰 이미지가 ISR 쓰기 비용이 되지 않게.
 */
const MAX_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 5_000;

export async function loadCoverPhotoDataUri(url: string): Promise<string | null> {
  if (!isAllowedCoverPhoto(url)) return null;
  let res: Response;
  try {
    res = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith("image/")) return null;
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
  if (buf.length === 0 || buf.length > MAX_BYTES) return null;
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(buf)
      .rotate()
      .resize(COVER_SIZE, COVER_SIZE, { fit: "cover" })
      .jpeg({ quality: 78 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    if (type === "image/jpeg" || type === "image/png") return `data:${type};base64,${buf.toString("base64")}`;
    return null;
  }
}
