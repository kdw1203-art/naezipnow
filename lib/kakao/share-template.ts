/**
 * Kakao.Share.sendDefault feed 템플릿 — 순수(테스트 가능).
 *
 * [995] 첫 호출자는 임장노트 카드 스튜디오(app/notes/[id]/card). 그 전까지 이 함수는
 * 호출자가 0이었다. 버튼 문구를 받게 했다 — "앱에서 보기"는 초대 링크용이고, 노트
 * 카드는 "임장노트 보기"가 맞다. 기본값은 예전 그대로.
 */
export function buildKakaoFeedShare(input: {
  title: string;
  description: string;
  shareUrl: string;
  imageUrl?: string;
  /** 하단 버튼 문구 — 기본 "앱에서 보기" */
  buttonTitle?: string;
}): Record<string, unknown> {
  const imageUrl =
    input.imageUrl?.trim() ||
    `${typeof window !== "undefined" ? window.location.origin : ""}/og-image`;
  const link = { mobileWebUrl: input.shareUrl, webUrl: input.shareUrl };

  return {
    objectType: "feed",
    content: {
      title: input.title.slice(0, 200),
      description: input.description.slice(0, 200),
      imageUrl,
      link,
    },
    buttons: [
      {
        title: (input.buttonTitle?.trim() || "앱에서 보기").slice(0, 20),
        link,
      },
    ],
  };
}
