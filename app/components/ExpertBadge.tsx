import Link from "next/link";
import { Icon } from "@/app/components/Icon";

/* [1047] 인증 전문가 마크 — 이름(아이디) 옆 · 글 머리 · 댓글 · 노트 작성자 줄에 같은 모양으로 붙는다.
   관리자 승인을 거친 전문가만(lib/experts/badges). 누르면 그 전문가 프로필로 — 글이 곧 전문가 홍보가 된다.
   훅이 없는 컴포넌트라 서버 화면 · 클라이언트 목록 어디서든 쓴다. 문구는 lib/experts/taxonomy expertBadgeText. */
export type ExpertBadgeData = { expertId: string; text: string };

export function ExpertBadge({ badge, link = true }: { badge: ExpertBadgeData | null | undefined; link?: boolean }) {
  if (!badge) return null;
  const cls =
    "inline-flex shrink-0 items-center gap-0.5 rounded-md bg-primary-soft chip-pad-tight t-caption font-bold text-primary no-underline align-middle";
  const body = (
    <>
      <Icon name="shield" size={10} />
      {badge.text}
    </>
  );
  return link ? (
    <Link
      href={`/town/experts/${badge.expertId}`}
      className={`${cls} min-h-6`}
      title="면허·사업자 서류 심사를 거쳐 내집나우가 승인한 전문가 · 프로필 보기"
    >
      {body}
    </Link>
  ) : (
    <span className={cls} title="면허·사업자 서류 심사를 거쳐 내집나우가 승인한 전문가">
      {body}
    </span>
  );
}
