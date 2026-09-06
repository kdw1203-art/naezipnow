"use client";

/**
 * 업로드 전 클라이언트 리사이즈 (최적화 50선 #23).
 *
 * 왜 필요한가 — 현장에서 찍은 폰 사진은 4000×3000·3~8MB 가 기본이다.
 * 화면에서 실제로 쓰이는 최대 폭은 카드/상세 모두 1000px 미만인데,
 * 임장 현장(지하주차장·엘리베이터 앞)의 느린 상행 회선으로 원본을 그대로
 * 올리다 실패하면 사용자는 "사진이 안 올라간다"만 겪는다.
 * 서버 상한(UPLOAD_MAX_BYTES = 10MB)에 걸려 413 이 나던 경로도 같은 원인이다.
 *
 * 원칙(사실 우선):
 * - 실패하면 원본을 그대로 돌려준다. 리사이즈는 최적화지 관문이 아니다.
 *   여기서 예외를 던져 업로드를 막으면 "사진을 잃는" 쪽이 된다.
 * - 결과가 원본보다 크면 원본을 쓴다(작은 이미지 재인코딩 방지).
 * - GIF(애니메이션)·비이미지는 손대지 않는다. 캔버스로 그리면 첫 프레임만 남는다.
 * - 투명도가 있으면 PNG 로 유지한다. JPEG 로 바꾸면 투명 영역이 검게 탄다.
 * - EXIF 회전은 imageOrientation:"from-image" 로 반영해 굽는다(서버는 sharp 로
 *   메타데이터를 제거하므로, 여기서 방향을 굽지 않으면 눕는 사진이 생긴다).
 *
 * [968 · 18] 워커 경로 — OffscreenCanvas 와 Worker 가 있으면 디코드·드로잉·인코딩을
 * 워커(image-resize.worker.ts)에서 한다. 예전엔 전부 메인 스레드 캔버스라 10장을
 * 고르는 순간 저가 안드로이드에서 화면이 얼었다(INP). 워커가 없거나(구형 Safari),
 * 만들다 죽거나, 한 장이라도 실패·지연(20초)하면 그 장부터 종전 메인 스레드 경로로
 * 내려간다 — 결과 형식·이름 규칙·"이득 없으면 원본" 은 두 경로가 같다
 * (계산은 image-resize-math 한 곳). 워커는 호출 한 번(배치)마다 만들고 끝나면
 * 종료한다 — 모듈 전역에 살려 두지 않는다.
 */

import {
  JPEG_QUALITY,
  MAX_DIMENSION,
  SKIP_BYTES,
  isResizableType,
  needsReencode,
  outputMime,
  renamedForMime,
  targetDimensions,
  type ResizeRequest,
  type ResizeResponse,
} from "./image-resize-math";

export { MAX_DIMENSION };

/** 워커가 한 장에 이보다 오래 걸리면 포기하고 메인 스레드로 */
const WORKER_TIMEOUT_MS = 20_000;

type Decoded = { width: number; height: number; draw: CanvasImageSource; close: () => void };

async function decode(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { width: bmp.width, height: bmp.height, draw: bmp, close: () => bmp.close() };
    } catch {
      /* HEIC 등 디코딩 불가 — 아래 <img> 경로로 한 번 더 시도 */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: img,
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/** 다운스케일된 캔버스에 알파가 남아 있는지 — 있으면 JPEG 로 바꾸면 안 된다 */
function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const { data } = ctx.getImageData(0, 0, w, h);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
    return false;
  } catch {
    return true; // 확인 못 하면 안전한 쪽(PNG 유지)
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/** 결과 Blob → File (이름·형식·수정시각 규칙은 두 경로가 같다) */
function toFile(file: File, blob: Blob, mime: string): File {
  return new File([blob], renamedForMime(file.name, mime), {
    type: mime,
    lastModified: file.lastModified,
  });
}

/* ── 메인 스레드 경로(종전) ────────────────────────────────────────────── */

async function resizeOnMainThread(file: File): Promise<File> {
  const decoded = await decode(file);
  if (!decoded) return file;

  try {
    const { width, height } = decoded;
    if (!width || !height) return file;
    if (!needsReencode(width, height, file.size)) return file;

    const { width: w, height: h } = targetDimensions(width, height, MAX_DIMENSION);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: file.type === "image/png" });
    if (!ctx) return file;
    ctx.drawImage(decoded.draw, 0, 0, w, h);

    const keepAlpha = file.type === "image/png" && hasAlpha(ctx, w, h);
    const outType = outputMime(file.type, keepAlpha);
    const blob = await toBlob(canvas, outType, keepAlpha ? undefined : JPEG_QUALITY);

    // 이득이 없으면(또는 인코딩 실패) 원본 유지
    if (!blob || blob.size >= file.size) return file;

    return toFile(file, blob, outType);
  } catch {
    return file;
  } finally {
    decoded.close();
  }
}

/* ── 워커 경로 ([968 · 18]) ─────────────────────────────────────────────── */

/** 한 배치가 공유하는 워커 — 실패하면 null 로 내려 남은 장은 메인 스레드로 간다 */
type ResizeSession = { worker: Worker | null; seq: number };

function workerAvailable(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap === "function"
  );
}

function openSession(): ResizeSession {
  if (!workerAvailable()) return { worker: null, seq: 0 };
  try {
    /* 번들러(webpack·turbopack)가 이 패턴을 보고 워커 청크를 따로 만든다 */
    const worker = new Worker(new URL("./image-resize.worker.ts", import.meta.url));
    return { worker, seq: 0 };
  } catch {
    return { worker: null, seq: 0 };
  }
}

function closeSession(s: ResizeSession) {
  try {
    s.worker?.terminate();
  } catch {
    /* 이미 죽은 워커 — 무시 */
  }
  s.worker = null;
}

/**
 * 워커에 한 장을 맡긴다. 결과:
 *  - File          : 워커가 줄인 파일(또는 이득 없음 → 원본 그대로)
 *  - null          : 워커 경로 실패 → 호출부가 메인 스레드로 다시 시도
 */
function resizeInWorker(s: ResizeSession, file: File): Promise<File | null> {
  const worker = s.worker;
  if (!worker) return Promise.resolve(null);
  const id = ++s.seq;
  return new Promise<File | null>((resolve) => {
    let settled = false;
    const finish = (result: File | null, kill: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      if (kill) closeSession(s);
      resolve(result);
    };
    const onMessage = (ev: MessageEvent<ResizeResponse>) => {
      const res = ev.data;
      if (!res || res.id !== id) return;
      if (!res.ok) {
        /* 워커가 못 굽는 파일(디코딩 실패 등) — 이 장만 메인 스레드로, 워커는 살려 둔다 */
        finish(null, false);
        return;
      }
      if (!res.blob) {
        finish(file, false);
        return;
      }
      finish(toFile(file, res.blob, res.mime), false);
    };
    const onError = () => finish(null, true);
    /* 스크립트 404·워커 크래시·무응답 모두 "이 배치는 워커 없이" 로 처리한다 */
    const timer = window.setTimeout(() => finish(null, true), WORKER_TIMEOUT_MS);
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    const req: ResizeRequest = {
      id,
      file,
      max: MAX_DIMENSION,
      skipBytes: SKIP_BYTES,
      quality: JPEG_QUALITY,
    };
    try {
      worker.postMessage(req);
    } catch {
      finish(null, true);
    }
  });
}

async function resizeOne(file: File, s: ResizeSession): Promise<File> {
  if (typeof document === "undefined") return file;
  if (!isResizableType(file.type)) return file;
  if (s.worker) {
    const viaWorker = await resizeInWorker(s, file).catch(() => null);
    if (viaWorker) return viaWorker;
  }
  return resizeOnMainThread(file);
}

/* ── 공개 API — 시그니처는 종전과 같다 ─────────────────────────────────── */

/**
 * 이미지 한 장을 긴 변 {@link MAX_DIMENSION}px 이하로 줄인다.
 * 줄일 수 없거나 이득이 없으면 **원본 File 을 그대로** 반환한다.
 */
export async function resizeImageFile(file: File): Promise<File> {
  if (typeof document === "undefined") return file;
  if (!isResizableType(file.type)) return file;
  const s = openSession();
  try {
    return await resizeOne(file, s);
  } catch {
    return file;
  } finally {
    closeSession(s);
  }
}

/** 여러 장 — 한 장이 실패해도 나머지는 계속 진행(각각 원본으로 대체) */
export async function resizeImageFiles(files: File[]): Promise<File[]> {
  if (typeof document === "undefined") return files;
  const out: File[] = [];
  /* 한 배치에 워커 하나 — 장마다 만들면 생성 비용이 열 번, 전역에 두면 안 죽는다.
     장은 순서대로 굽는다: 병렬로 열 장을 디코드하면 비트맵만 수백 MB 다. */
  const s = openSession();
  try {
    for (const f of files) {
      out.push(await resizeOne(f, s).catch(() => f));
    }
  } finally {
    closeSession(s);
  }
  return out;
}
