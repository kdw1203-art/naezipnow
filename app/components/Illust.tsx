/* [1012 · 규칙 10] 직접 그린 선 일러스트 8종 — public/illust/*.svg (브랜드 3색 · 선 1.8px · viewBox 120×90 · 각 ≤2KB).
 *
 * 왜: 빈 화면·오프라인·설치 안내가 이모지(📡 🏠 📝…)로 그림 자리를 채우고 있었다. 기준 사이트 4곳은 플랫폼 UI 에
 * 이모지를 쓰지 않는다(docs/design-system.md v3 신호표). 스톡·AI 생성 이미지는 금지라, 얼굴·사람·마스코트 없는
 * 사물 선화만 직접 그렸다(docs/licenses.md "직접 그린 일러스트" — 자체 저작).
 *
 * next/image 를 쓰지 않는다 — SVG 는 최적화 대상이 아니고, 오프라인 문서처럼 번들 없이 뜨는 자리도 있다.
 * 장식이라 alt="" + aria-hidden. 크기는 가로 기준(세로 = 3/4). */
import { illustSrc, type IllustName } from "./illust-names";

export { ILLUST_NAMES, illustSrc, type IllustName } from "./illust-names";

export function Illust({
  name,
  size = 96,
  className = "",
}: {
  name: IllustName;
  /** 가로 px — 세로는 viewBox 비율(120:90)대로 3/4 */
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 정적 SVG 장식, next/image 불필요(파일 머리 주석)
    <img
      src={illustSrc(name)}
      alt=""
      aria-hidden="true"
      width={size}
      height={Math.round((size * 3) / 4)}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`block select-none ${className}`.trim()}
    />
  );
}
