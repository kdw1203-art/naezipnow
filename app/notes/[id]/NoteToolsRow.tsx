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
 */
import Link from "next/link";
import { workbenchCardData } from "@/app/analysis/workbench-cards";

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
    <div className="rise-in-1 card flex flex-col gap-3 rounded-[18px] p-6">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[15px] font-extrabold text-ink">이 노트로 이어서</div>
        <span className="shrink-0 t-caption text-text-3">
          {apt || reg} 기준으로 열려요
        </span>
      </div>
      <p className="t-sub text-text-3">
        현장에서 본 것 옆에 실데이터를 놓고 봅니다 — 도구는 이 노트의 단지로 바로 열려요.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {core.map((c) => (
          <Link
            key={c.id}
            href={`${c.href}?${query}`}
            className="tile card tool-scope tool-rail flex flex-col gap-1 rounded-[14px] p-3 no-underline"
            style={c.vars}
            data-tool={c.id}
          >
            <span className="tool-soft-bg tool-ink t-caption w-fit whitespace-nowrap rounded px-1.5 py-px font-extrabold">
              {c.character}
            </span>
            <span className="t-sub font-extrabold text-ink">{c.title}</span>
            {c.result && (
              <span className="t-caption text-text-3">결과: {c.result}</span>
            )}
          </Link>
        ))}
      </div>
      {/* 나머지는 허브로 — 노트 화면에 12칸을 다 펼치면 노트가 안 읽힌다.
          noteId 를 실어 보내면 허브가 이 노트를 컨텍스트로 잡는다. */}
      <Link
        href={`/analysis?noteId=${encodeURIComponent(noteId)}`}
        className="tap-line w-fit t-sub font-bold text-primary"
      >
        나머지 {more.length}개 도구 보기 ›
      </Link>

      {/* [986 · 24] 이 노트에 묻기 — 도구는 정해진 한 가지를 계산하고, 에이전트는
          내 노트와 실거래를 조회해 **아무 질문에나** 답한다. 에이전트 화면은 이미
          있는데 노트에서 넘어가는 길이 없어서, 질문을 처음부터 타이핑해야 했다.
          질문은 이 노트의 사실로 채워 보내되 **자동 전송하지 않는다**(AgentChat) —
          누르지도 않은 질문에 한도가 깎이면 안 된다. */}
      <div className="mt-1 flex flex-col gap-2 rounded-xl bg-bg px-3.5 py-3">
        <span className="t-caption font-bold text-text-3">
          정해진 계산 말고 그냥 물어보고 싶다면
        </span>
        <Link
          href={`/agent?q=${encodeURIComponent(agentQuestion)}`}
          className="tap-line w-fit t-sub font-extrabold text-ai-accent"
        >
          “{agentQuestion}” 에이전트에게 묻기 ›
        </Link>
      </div>
    </div>
  );
}
