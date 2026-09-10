/**
 * 현장 기록 AI 처리 고지 (final-test-checklist — Field capture AI consent).
 *
 * 노트 저장 시 기록 내용이 AI 정리를 위해 외부 LLM 으로 전송된다는 사실을
 * 버튼을 누르기 전에 알린다. 몰래 보내지 않는 것이 원칙이다.
 * 사진은 업로드 시점에 EXIF(GPS·기기정보)가 제거된다(lib/storage/upload.ts).
 */
import Link from "next/link";

export function FieldCaptureConsentNotice() {
  return (
    <p className="text-[10px] leading-[1.6] text-text-3">
      기록 완료 시 노트에 적은 내용이 AI 정리를 위해 외부 AI API 전송됩니다.
      사진은 저장 시 위치정보(EXIF)가 자동 제거돼요. 자세한 내용은{" "}
      {/* [989] 문단 속 단독 링크 — 인라인 세로 패딩은 줄 높이를 바꾸지 않으면서
          히트만 24px 로 넓힌다(이 문단에 다른 링크가 없어 겹칠 상대가 없다) */}
      <Link href="/legal/privacy" className="py-1.5 font-bold text-primary underline">
        개인정보처리방침
      </Link>
      을 확인하세요.
    </p>
  );
}
