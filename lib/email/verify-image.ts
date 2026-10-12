import "server-only";

/* [1061] 메일에 싣기 전 원문 사진 확인 — 메일은 스크립트가 없어 깨진 사진을 숨길 수 없다(화면은 DigestThumb 가 숨긴다).
 * 언론사 사진 호스트는 제각각이라(HEAD 는 400 인데 GET 은 200 · Range 는 404 · 핫링크 차단 · 응답 없음)
 * 보통의 GET 으로 머리만 보고 본문은 끊는다. 4초 안에 2xx + image/* 가 아니면 싣지 않는다. 실패는 "사진 없음"으로 조용히. */
export async function verifyImageUrl(url: string, timeoutMs = 4000): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      cache: "no-store",
      headers: { Accept: "image/*,*/*;q=0.5", "User-Agent": "Mozilla/5.0 (compatible; naezipnow-digest/1.0)" },
    });
    const type = res.headers.get("content-type") ?? "";
    const ok = res.ok && /^image\//i.test(type);
    await res.body?.cancel().catch(() => undefined);
    return ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 목록의 imageUrl 을 확인해 못 받는 것은 null 로. 앞 `limit` 개만(메일에 실리는 수) · 동시에. */
export async function dropUnreachableImages<T extends { imageUrl: string | null }>(items: T[], limit = 5): Promise<T[]> {
  const head = items.slice(0, limit);
  const checked = await Promise.all(
    head.map(async (it) => (it.imageUrl && (await verifyImageUrl(it.imageUrl)) ? it : { ...it, imageUrl: null })),
  );
  return [...checked, ...items.slice(limit)];
}
