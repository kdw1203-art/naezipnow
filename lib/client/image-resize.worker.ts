/**
 * [968 · 18] 사진 리사이즈 워커 — createImageBitmap → OffscreenCanvas → convertToBlob.
 *
 * 왜: 4000×3000 사진 10장을 메인 스레드 캔버스에서 굽는 동안 화면이 얼었다(저가 안드로이드
 * 실측 기준 INP 악화, 제안 18). 디코드·드로잉·인코딩을 통째로 워커로 옮기면 메인
 * 스레드는 File 을 건네고 Blob 을 돌려받기만 한다.
 *
 * 규칙
 *  - 실패는 실패라고 돌려준다(throw 하지 않는다). 메인 스레드가 종전 경로로 다시 시도한다.
 *  - 계산(크기·재인코딩 여부·출력 형식)은 image-resize-math 를 쓴다 — 메인 경로와 같은 수.
 *  - 이 파일은 `new Worker(new URL("./image-resize.worker.ts", import.meta.url))` 로만 불린다.
 *    DOM lib 로 타입을 맞추므로 self 는 최소 계약으로만 본다.
 */

import {
  needsReencode,
  outputMime,
  targetDimensions,
  type ResizeRequest,
  type ResizeResponse,
} from "./image-resize-math";

type WorkerScope = {
  onmessage: ((ev: MessageEvent<ResizeRequest>) => void) | null;
  postMessage: (msg: ResizeResponse) => void;
};

const scope = self as unknown as WorkerScope;

/** 다운스케일된 캔버스에 알파가 남아 있는지 — 있으면 JPEG 로 바꾸면 안 된다 */
function hasAlpha(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number): boolean {
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

async function resize(req: ResizeRequest): Promise<ResizeResponse> {
  const { id, file } = req;
  let bmp: ImageBitmap | null = null;
  try {
    /* EXIF 회전을 굽는다 — 서버가 메타데이터를 지우므로 여기서 안 돌리면 눕는 사진이 된다 */
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = bmp;
    if (!width || !height) return { id, ok: false, error: "empty bitmap" };
    if (!needsReencode(width, height, file.size, { max: req.max, skipBytes: req.skipBytes })) {
      return { id, ok: true, blob: null, mime: file.type };
    }
    const { width: w, height: h } = targetDimensions(width, height, req.max);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d", { alpha: file.type === "image/png" });
    if (!ctx) return { id, ok: false, error: "no 2d context" };
    ctx.drawImage(bmp, 0, 0, w, h);
    const keepAlpha = file.type === "image/png" && hasAlpha(ctx, w, h);
    const mime = outputMime(file.type, keepAlpha);
    const blob = await canvas.convertToBlob(
      mime === "image/jpeg" ? { type: mime, quality: req.quality } : { type: mime },
    );
    /* 이득이 없으면 원본 유지 — 메인 스레드가 null 을 원본으로 읽는다 */
    return { id, ok: true, blob: blob.size >= file.size ? null : blob, mime };
  } catch (err) {
    return { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    bmp?.close();
  }
}

scope.onmessage = (ev) => {
  const req = ev.data;
  if (!req || typeof req.id !== "number") return;
  void resize(req).then((res) => scope.postMessage(res));
};
