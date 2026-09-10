/**
 * [987] 적재 시각 표기 — 순수 함수만. `server-only` 를 import 하지 않는다.
 *
 * data-freshness.ts 에 같이 두었더니 단위 테스트가 그 파일을 읽을 수 없었다
 * (server-only 가 러너에서 던진다). 판정이 들어가는 부분만 여기로 내린다 —
 * 이 저장소에서 여러 번 쓴 방법이다(form-steps·field-brief·exif-datetime).
 */

/**
 * "3시간 전" / "2일 전" — 며칠씩 밀린 것을 "최근"으로 뭉개지 않는다.
 * 30일이 넘으면 날짜를 그대로 적는다(그쯤 되면 "며칠 전"이 위로가 안 된다).
 */
export function freshnessLabel(iso: string, now: number): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diff = now - t;
  if (diff < 0) return null; /* 미래 시각은 믿지 않는다 */
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours < 1) return "1시간 이내";
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days <= 30) return `${days}일 전`;
  const d = new Date(t);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

/** 며칠 이상 밀렸으면 화면이 그렇다고 말해야 한다 */
export const STALE_AFTER_HOURS = 48;

export function isStale(iso: string, now: number): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return now - t > STALE_AFTER_HOURS * 60 * 60 * 1000;
}
