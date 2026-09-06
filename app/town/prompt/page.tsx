import { redirect } from "next/navigation";
import { todayPromptIndex } from "@/lib/town/prompts";

/* [970 · C-46] /town/prompt 인덱스 — 예전엔 404 였다. 글감 카드·글쓰기 링크가
   /town/prompt/[idx] 만 가리키지만, 주소창에서 상위 경로를 자르거나 공유 링크가
   깨졌을 때 오늘의 질문으로 떨어지게 한다. 오늘 인덱스는 KST 날짜에 따라 바뀌므로
   요청 시점에 계산한다(정적으로 굳히면 어제 질문으로 보낸다). */

export const dynamic = "force-dynamic";

export default function TownPromptIndexPage() {
  redirect(`/town/prompt/${todayPromptIndex()}`);
}
