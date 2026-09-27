/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 5곳을 font-bold(700)로 바꿨다. */
import Link from "next/link";
import { buildMissionBoard, type MissionBoard } from "@/lib/missions/missions";
import { logger } from "@/lib/log";

/* [#119·#120] 미션 센터 — 시작 3미션 + 주간 미션.
   진행도는 실데이터 파생(lib/missions), 적립은 서버 재검증 청구(claim API).
   실측 0(글·구독·적립) 상태에 대한 처방: 첫 행동을 계단 3개로 쪼개고 보상을 명시. */

import { MissionClaim } from "./MissionClaim";

/* [994] /my/points?tab=missions 의 한 탭(옛 /my/missions). */
export async function MissionsSection({ email }: { email: string }) {
  let board: MissionBoard | null = null;
  try {
    board = await buildMissionBoard(email);
  } catch (e) {
    logger.error("[missions] 보드 계산 실패", e);
  }

  /* [v4 · 한 화면 한 가지] 카드 쌓기 → 섹션 제목 + 1px 선 행(왼쪽 미션 + 보조 한 줄 / 오른쪽 상태·받기).
     설명 문장("~채워지고 ~받아갈 수 있어요") → 사실 캡션. 진행 막대는 주간 미션의 숫자(N/M)로 충분해 뺐다.
     완료 알약(연초록 면) → 글자. h1 은 부모 탭 머리("포인트"). */
  return (
    <div className="flex flex-col gap-8">
      <p className="rise-in -mt-3 t-sub text-text-3">실제 활동으로 진행도 자동 반영 · 달성하면 포인트 받기</p>

      {!board ? (
        <p className="border-y border-line py-3 t-body text-text-2">진행도 조회 실패 · 잠시 후 다시 열기</p>
      ) : (
        <>
          {/* 시작 3미션 */}
          <section aria-labelledby="ms-start-h" className="rise-in-1 flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <h2 id="ms-start-h" className="t-section text-ink">
                시작 3미션
              </h2>
              <MissionClaim kind="start" points={200} disabled={!board.startAllDone} claimed={board.startClaimed} />
            </div>
            <ul data-tone="mint" className="mt-1 divide-y divide-line">
              {board.start
                .filter((m) => m.key !== "first_ai")
                .map((m) => (
                  <li key={m.key}>
                    <Link href={m.href} className="press flex min-h-14 items-center justify-between gap-3 py-3 no-underline">
                      <span className="min-w-0 flex-1">
                        <span className="block t-body font-bold text-ink">
                          {m.done ? "✓ " : ""}
                          {m.label}
                        </span>
                        <span className="mt-0.5 block truncate t-sub text-text-3">{m.desc}</span>
                      </span>
                      <span className={`shrink-0 t-sub font-bold ${m.done ? "text-success" : "text-text-3"}`}>
                        {m.done ? "완료" : "하러 가기 ›"}
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
            <p className="t-caption text-text-3">3가지 모두 마치면 온보딩 완주 보너스 200P(1회)</p>
          </section>

          {/* [AI-39] 첫 AI 분석 — 시작 3미션과 별도 100P */}
          {(() => {
            const ai = board.start.find((m) => m.key === "first_ai");
            if (!ai) return null;
            return (
              <section aria-labelledby="ms-ai-h" className="rise-in-1 flex flex-col">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="ms-ai-h" className="t-section text-ink">
                    보너스 · 첫 AI 분석
                  </h2>
                  <MissionClaim kind="ai" points={100} disabled={!ai.done} claimed={ai.claimed} />
                </div>
                <ul data-tone="blue" className="mt-1 divide-y divide-line border-b border-line">
                  <li>
                    <Link href={ai.href} className="press flex min-h-14 items-center justify-between gap-3 py-3 no-underline">
                      <span className="min-w-0 flex-1">
                        <span className="block t-body font-bold text-ink">
                          {ai.done ? "✓ " : ""}
                          {ai.label}
                        </span>
                        <span className="mt-0.5 block truncate t-sub text-text-3">{ai.desc}</span>
                      </span>
                      <span className="shrink-0 t-sub font-bold text-primary">+{ai.points}P ›</span>
                    </Link>
                  </li>
                </ul>
              </section>
            );
          })()}

          {/* 주간 미션 */}
          <section aria-labelledby="ms-week-h" className="rise-in-2 flex flex-col">
            <h2 id="ms-week-h" className="t-section text-ink">
              이번 주 미션 <span className="t-sub font-medium text-text-3">{board.weekKey} · 월요일마다 리셋</span>
            </h2>
            <ul data-tone="sand" className="mt-1 divide-y divide-line">
              {board.weekly.map((m) => (
                <li key={m.key} className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block t-body font-bold text-ink">{m.label}</span>
                    <span className="mt-0.5 block truncate t-sub text-text-3">
                      {m.desc} · {Math.min(m.progress, m.target)}/{m.target}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {!m.done && (
                      <Link href={m.href} className="inline-flex min-h-10 items-center t-sub font-bold text-primary no-underline">
                        하러 가기 ›
                      </Link>
                    )}
                    <MissionClaim
                      kind="weekly"
                      missionKey={m.key}
                      points={m.points}
                      disabled={!m.done}
                      claimed={m.claimed}
                    />
                  </span>
                </li>
              ))}
            </ul>
            <p className="t-caption text-text-3">
              적립은 일·월 상한 안에서 지급 · 규칙은{" "}
              <Link href="/my/points" className="font-bold text-primary">
                포인트 내역
              </Link>
            </p>
          </section>
        </>
      )}
    </div>
  );
}
