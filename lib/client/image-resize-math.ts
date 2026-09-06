/**
 * [968 · 18] 사진 리사이즈의 순수 계산 — 메인 스레드 경로와 워커 경로가 같은 수를 쓴다.
 *
 * 왜 따로 뺐나: 크기 계산이 image-resize.ts 안에 묻혀 있으면 워커 파일이 같은 식을
 * 베껴 가고, 상한을 바꿀 때 한쪽만 바뀐다(한쪽은 1600, 한쪽은 1200 같은 어긋남).
 * DOM 이 없어 단위테스트로 직접 검증한다(tests/unit/forms-mobile-968.test.ts).
 */

/** 긴 변 상한 — 상세 원본 보기까지 감안한 여유값 */
export const MAX_DIMENSION = 1600;

/** 이 크기 이하 + 상한 이내면 재인코딩하지 않는다(화질 보존) */
export const SKIP_BYTES = 1_200_000;

export const JPEG_QUALITY = 0.82;

/** 캔버스로 다시 구워도 되는 형식 */
export const RESIZABLE_TYPES: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isResizableType(mime: string): boolean {
  return RESIZABLE_TYPES.has(mime);
}

/**
 * 긴 변이 `max` 이하가 되도록 비율을 지켜 줄인 크기. 이미 작으면 그대로(확대 안 함).
 * 반올림 뒤에도 최소 1px 은 남긴다(1×4000 같은 극단 비율에서 0 이 되면 캔버스가 죽는다).
 */
export function targetDimensions(
  width: number,
  height: number,
  max: number = MAX_DIMENSION,
): { width: number; height: number; scale: number } {
  const longest = Math.max(width, height);
  if (!(longest > 0) || !(max > 0)) return { width: Math.max(1, width | 0), height: Math.max(1, height | 0), scale: 1 };
  const scale = Math.min(1, max / longest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/**
 * 재인코딩할 가치가 있는가 — 긴 변이 상한 이내이고 파일도 작으면 손대지 않는다.
 * (작은 이미지를 다시 구우면 화질만 잃고 크기는 안 줄기 일쑤다.)
 */
export function needsReencode(
  width: number,
  height: number,
  bytes: number,
  opts?: { max?: number; skipBytes?: number },
): boolean {
  const max = opts?.max ?? MAX_DIMENSION;
  const skipBytes = opts?.skipBytes ?? SKIP_BYTES;
  const longest = Math.max(width, height);
  return !(longest <= max && bytes <= skipBytes);
}

/** 결과 형식 — PNG 이면서 알파가 남아 있을 때만 PNG 를 유지한다 */
export function outputMime(inputType: string, keepAlpha: boolean): "image/png" | "image/jpeg" {
  return inputType === "image/png" && keepAlpha ? "image/png" : "image/jpeg";
}

/** 출력 형식에 맞춰 확장자를 바꾼 파일 이름 */
export function renamedForMime(name: string, mime: string): string {
  const ext = mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
  const base = name.replace(/\.[^./\\]+$/, "") || "photo";
  return `${base}${ext}`;
}

/** 워커 ↔ 메인 스레드 메시지 */
export type ResizeRequest = {
  id: number;
  file: File;
  max: number;
  skipBytes: number;
  quality: number;
};

export type ResizeResponse =
  | {
      id: number;
      ok: true;
      /** null = 줄일 이유가 없거나 이득이 없어 원본을 그대로 쓰라는 뜻 */
      blob: Blob | null;
      mime: string;
    }
  | { id: number; ok: false; error: string };
