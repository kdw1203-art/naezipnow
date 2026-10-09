import Link from "next/link";
import { Icon } from "@/app/components/Icon";

/* [1047] 인증 전문가 마크 — 이름(아이디) 옆 · 글 머리 · 댓글 · 노트 작성자 줄에 같은 모양으로 붙는다.
   관리자 승인을 거친 전문가만(lib/experts/badges). 누르면 그 전문가 프로필로 — 글이 곧 전문가 홍보가 된다.
   훅이 없는 컴포넌트라 서버 화면 · 클라이언트 목록 어디서든 쓴다. 문구는 lib/experts/taxonomy expertBadgeText.
   [1052] 접근성 · 누르는 자리
     · 링크 마크는 aria-label 로 인증 상태를 말한다("인증 세무사 · 서류 심사 승인 완료 · 검증 정보 보기").
       링크가 아닌 마크는 sr-only 꼬리로 같은 사실을 읽힌다(이름 없는 span 에 aria-label 은 읽히지 않는다).
     · 누르면 프로필의 검증 정보 칸(#verification)으로 바로 간다 — 마크가 무엇을 확인했는지가 거기 있다.
     · 히트 영역: 폰 40px · 데스크톱 24px. 보이는 마크(18px)는 그대로 두고 바깥 링크만 키운 뒤 같은 크기의
       음수 마진으로 되돌려(-my-2) 줄 높이는 예전(24px)과 같다. */
export type ExpertBadgeData = { expertId: string; text: string };

const VERIFIED_NOTE = "서류 심사 승인 완료";

export function ExpertBadge({ badge, link = true }: { badge: ExpertBadgeData | null | undefined; link?: boolean }) {
  if (!badge) return null;
  const chip =
    "inline-flex shrink-0 items-center gap-0.5 rounded-md bg-primary-soft chip-pad-tight t-caption font-bold text-primary no-underline align-middle";
  const body = (
    <>
      <Icon name="shield" size={10} />
      {badge.text}
    </>
  );
  return link ? (
    <Link
      href={`/town/experts/${badge.expertId}#verification`}
      aria-label={`${badge.text} · ${VERIFIED_NOTE} · 검증 정보 보기`}
      title="면허·사업자 서류 심사를 거쳐 내집나우가 승인한 전문가 · 검증 정보 보기"
      className="-my-2 inline-flex min-h-[40px] shrink-0 items-center align-middle no-underline md:my-0 md:min-h-6"
    >
      <span className={chip}>{body}</span>
    </Link>
  ) : (
    <span className={chip} title="면허·사업자 서류 심사를 거쳐 내집나우가 승인한 전문가">
      {body}
      <span className="sr-only"> · {VERIFIED_NOTE}</span>
    </span>
  );
}
