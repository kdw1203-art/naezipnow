/**
 * [986 · 19] 이 노트로 이어서 — 노트 하나에서 그 단지의 AI 도구를 바로 연다.
 *
 * 무엇이 문제였나: 노트 상세에서 도구로 가는 길이 **한 개**뿐이었다. 저장 직후
 * 배너의 "AI 진단 1분"(`[AI-40]`) 하나가 12종 중 유일한 딥링크였고, 그 배너는
 * 저장 직후에만 뜬다. 며칠 뒤 노트를 다시 열면 도구로 가는 길이 사라진다.
 * 노트를 쓴 사람이 다음에 할 일이 없으면 노트는 거기서 끝난다.
 *
 * 서버에서 조립한다: 도구 제목·성격·색은 tool-identity/tool-persona 에 있는데
 * 둘 다 큰 모듈이라 클라이언트에서 import 하면 번들에 통째로 실린다(980에서
 * /analysis 가 502KB 로 예산을 넘긴 경로가 정확히 그것이었다). 이 화면은 서버
 * 컴포넌트라 조립해서 문자열만 내려 준다.
 *
 * 딥링크 모양은 워크벤치가 이미 읽는 것을 그대로 쓴다(`?apt=&region=`,
 * WorkbenchClient `[OPT-48]`). 새 규약을 만들지 않는다.
 *
 * [v4 · 규칙 5·7] 카드(2열 도구 타일 + 성격 배지 + "결과:" 줄 + 설명 문단 + 회색 상자 속 에이전트 링크) →
 * **구분선 목록 행**(단지 허브 SummaryRow). 부르는 쪽(page.tsx "이어서" 목록)의 `<ul className="divide-y">` 안에
 * `<li>` 행만 넣는다. 행 = 도구 이름 + 결과 한 줄(허브 행과 같은 `sub`) / `›`.
 */
import { workbenchCardData } from "@/app/analysis/workbench-cards";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";

export function NoteToolsRow({
  aptName,
  region,
  noteId,
}: {
  aptName: string;
  region: string;
  noteId: string;
}) {
  const apt = aptName.trim();
  const reg = region.trim();
  /* 단지명도 지역도 없으면 도구가 무엇을 대상으로 도는지 말할 수 없다 —
     빈 도구 화면으로 보내느니 아무것도 안 그린다. */
  if (!apt && !reg) return null;

  const { core, more } = workbenchCardData();
  /* 질문은 이 노트의 사실로만 만든다 — 없는 단지명을 넣어 "그럴듯한" 질문을
     지어내지 않는다. 단지명이 없으면 지역으로 묻는다. */
  const subject = apt || reg;
  const agentQuestion = `${subject} 임장노트에 적은 내용과 지금 실거래를 비교해 줘`;
  const query = new URLSearchParams({
    ...(apt ? { apt } : {}),
    ...(reg ? { region: reg } : {}),
  }).toString();

  return (
    <>
      {core.map((c) => (
        <SummaryRow key={c.id} label={c.title} sub={`${subject} · ${c.sub}`} href={`${c.href}?${query}`} />
      ))}
      {/* 나머지는 허브로 — noteId 를 실어 보내면 허브가 이 노트를 컨텍스트로 잡는다 */}
      <SummaryRow
        label={`AI 분석 도구 ${more.length}개 더`}
        sub={more
          .slice(0, 3)
          .map((m) => m.title)
          .join(" · ")}
        href={`/analysis?noteId=${encodeURIComponent(noteId)}`}
      />
      {/* [986 · 24] 이 노트에 묻기 — 질문은 이 노트의 사실로 채워 보내되 **자동 전송하지 않는다**(AgentChat) —
          누르지도 않은 질문에 한도가 깎이면 안 된다. */}
      <SummaryRow label="에이전트에게 묻기" sub={agentQuestion} href={`/agent?q=${encodeURIComponent(agentQuestion)}`} />
    </>
  );
}
