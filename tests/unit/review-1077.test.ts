/* [1077] 소유자 2026-10-18 "추가로 더 검토해서 제안해줘" → 운영 50쪽 실측(PC·폰) → 선택 "전부".
 *  R1 헤더 회원가입 — 채움 파랑(1076)이 화면마다의 주 행동 단추와 파랑 둘이 됐다(50쪽 전부) → 브랜드 네이비 채움(.btn-navy).
 *  R2 시장 온도 — 도구 색 앰버(주황 채움 · 1025 금지) → 사이트 파랑 · 지도 16칸 중 13칸 "기록 없음" 글자 → 이름만 옅게 + 아래 한 줄.
 *  R3 빈 상태 벽 — 노트 쓰기 5축 "자료 없음"×5 → 사실 한 줄(2단계로) · 리포트 진열대 카드마다 죽은 단추 12개 → 삭제 ·
 *     크리에이터 "정산 없음" 5회 → 고지 한 줄 + FAQ 하나.
 *  R4 해요체 → 사실 낱말: 설정 비회원 카드 · 쪽지함 · 전문가 빈 상태 · 모임 빈 상태 · Q&A 빈 상태(요금제 문장은 심사 고정 — 손대지 않음).
 *  R5 홈 "베타 · 확인 안 된 값은 —" 띠 삭제(BetaNoticeModal 파일 삭제) — 비워 두는 규칙(—)은 그대로.
 *  R6 가입 화면 "건너뛰기" → 로그인 화면과 같은 닫기 ✕.
 *  R7 말투 — 소유자(2026-10-18) "'있는 그대로의 고지' 이런 말투는 안 써 · '고지사항' 이런 식 · 다른 곳도 정리": 문학 투 제목·라벨 24곳 → 표준 이름
 *     ("○○에 산다는 것" → "○○ 아파트 실거래 · 지역 분석" · "지켜보는 것" → "관심 항목" · "꼭 볼 것" → "필수 조건" …). 브랜드 문장("오래 머물 집을, 지금")은 그대로. */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

test("R1 헤더 회원가입 — 네이비 채움 · 화면의 채움 파랑은 그 화면 것 하나", () => {
  const h = read("app/components/HeaderAuth.tsx");
  assert.match(h, /href="\/signup"\s+prefetch=\{false\}\s+className="btn-navy press inline-flex min-h-10 shrink-0/);
  assert.doesNotMatch(h, /btn-primary/);
  const css = read("app/globals.css");
  const at = css.indexOf("[1077 · 헤더 회원가입 네이비]");
  assert.ok(at > 0);
  const block = css.slice(at);
  assert.match(block, /\.btn-navy \{\s*background: var\(--brand-navy\);\s*color: var\(--on-dark\);\s*font-weight: 700;/);
  assert.match(block, /\.dark \.btn-navy \{\s*background: var\(--on-dark\);\s*color: var\(--brand-navy\);/);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,6}\b/, "토큰만(뒤 블록 hex 금지 검사와 같은 규칙)");
});

test("R2 시장 온도 — 파랑 · 기록 없는 칸은 이름만 · 세는 말은 한 줄", () => {
  const persona = read("lib/ai/tool-persona.ts");
  assert.match(persona, /id: "market:temperature",[\s\S]{0,400}palette: p\("#1D4FD8", "#88AAFF", "#EEF4FF", "rgba\(136,170,255,\.14\)"\)/);
  assert.doesNotMatch(persona, /palette: p\("#B45309"/);
  const c = read("app/analysis/temperature/TempMapClient.tsx");
  assert.match(c, /const nationHas = nation\.filter\(\(t\) => t\.count > 0 && t\.avg !== null\)\.length;/);
  assert.match(c, /<span className="tmp-tile tm-sido" data-empty="" aria-disabled="true" title=\{`\$\{t\.label\} 기록 없음`\}>\s*<span className="tmp-tile-k">\{t\.label\}<\/span>\s*<span className="sr-only">기록 없음<\/span>/);
  assert.doesNotMatch(c, /<span className="tmp-tile-d">기록 없음<\/span>/);
  assert.match(c, /기록 있는 시·도 \{nationHas\}곳 · 기록 없는 시·도 \{nation\.length - nationHas\}곳\(점선 칸\)/);
  assert.match(read("app/globals.css"), /\[1077 · 시장 온도\][\s\S]*\.tm-sido\[data-empty\] \{\s*justify-content: center;\s*opacity: 0\.72;/);
});

test("R3 빈 상태 벽 — 노트 쓰기 한 줄 · 진열대 죽은 단추 없음 · 크리에이터 사실 한 번", () => {
  const rail = read("app/notes/new/NotePreviewRail.tsx");
  assert.match(rail, /\{total != null \? \(\s*<ScoreRadar items=\{previewRadarItems\(p\.scores\)\} \/>\s*\) : \(/);
  assert.match(rail, /현장 체크\(2단계\)를 표시하면 5축 점수가 채워짐 ›/);
  assert.match(rail, /onClick=\{\(\) => p\.onGoStep\(2\)\}/);
  const m = read("app/notes/market/page.tsx");
  assert.doesNotMatch(m, /disabled\s*title="결제 기능 오픈 후/);
  assert.doesNotMatch(m, /<Icon name="lock"/);
  assert.doesNotMatch(m, /import \{ Icon \}/);
  assert.equal((m.match(/>\s*판매 오픈 준비 중\s*</g) ?? []).length, 1, "화면에는 머리 칩 한 곳(제목·주석 제외)");
  assert.match(m, /className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-line-strong bg-bg px-3\.5 py-2 t-body font-bold text-text-1 no-underline"\s*>\s*노트 전문 읽기/);
  const cr = read("app/creators/page.tsx");
  assert.doesNotMatch(cr, /title: "요율은 한 곳에서"/);
  assert.match(cr, /<div className="mb-8 grid gap-3 sm:grid-cols-2">/);
  assert.match(cr, /수익을 약속하지 않습니다 · 구조와 보상 방식은 아래 고지에 그대로\./);
  assert.match(cr, /<li>· 현재 크리에이터 정산·포인트 적립·현금 전환 없음\(흐름은 아래 FAQ\)\.<\/li>/);
  assert.equal((cr.match(/현금 전환/g) ?? []).length, 2, "고지 한 줄 + FAQ 하나");
});

test("R4 해요체 → 사실 낱말", () => {
  assert.match(read("app/my/settings/SettingsClient.tsx"), /<div className="t-body font-bold text-ink">설정 저장 · 로그인 필요<\/div>/);
  const msg = read("app/messages/page.tsx");
  assert.match(msg, /1:1 쪽지 아직 없음\s*<br \/>\s*이웃과의 이야기는 공개 임장노트 댓글/);
  assert.doesNotMatch(msg, /않았어요|있어요|대상입니다/);
  assert.match(msg, /쪽지는 닉네임으로만 · 연락처 요구는 신고 대상/);
  assert.match(read("app/town/experts/ExpertsClient.tsx"), /\? "인증 심사 통과 순으로 공개"\s*: "견적 요청을 남기면 인증 전문가가 먼저 제안"/);
  assert.match(read("app/town/groups/GroupsClient.tsx"), /\? "필터를 풀면 전체 모임 · 모임을 만들면 채팅방이 함께 열림"\s*: "첫 모임은 이 목록 맨 앞 · 만들면 채팅방이 함께 열림"/);
  const q = read("app/qna/QnaListClient.tsx");
  assert.match(q, /"위 질문하기로 등록한 첫 질문이 목록 맨 앞"/);
  assert.doesNotMatch(q, /실려요|보여요/);
});

test("R5 홈 베타 띠 삭제 — 파일·호출 모두 없음", () => {
  assert.equal(existsSync("app/components/BetaNoticeModal.tsx"), false);
  const home = read("app/page.tsx");
  assert.doesNotMatch(home, /<BetaNoticeModal|import \{ BetaNoticeModal/);
  assert.doesNotMatch(home, />[^<]*확인 안 된 값은/);
});

test("R6 가입 화면 — 건너뛰기 → 닫기 ✕(로그인 화면과 같은 40px 칸)", () => {
  const s = read("app/signup/SignupClient.tsx");
  assert.doesNotMatch(s, />\s*건너뛰기\s*</);
  assert.match(s, /<Link href="\/" className="-mr-\[12px\] inline-flex h-10 w-10 items-center justify-center text-\[15px\] text-text-3" aria-label="닫기">\s*✕/);
});

test("R7 말투 — 문학 투 제목·라벨 → 표준 이름", () => {
  const cr = read("app/creators/page.tsx");
  assert.match(cr, />고지사항</);
  assert.match(cr, />자주 묻는 질문</);
  assert.doesNotMatch(cr, /있는 그대로의 고지|자주 묻는 것/);
  assert.match(read("app/region/[id]/page.tsx"), /title=\{`\$\{name\} 아파트 실거래 · 지역 분석`\}/);
  assert.match(read("app/region/[id]/page.tsx"), /\{name\} 시장 흐름 요약/);
  assert.match(read("app/region/[id]/RegionHero.tsx"), /`\$\{name\} 실거래·가격지수 요약`/);
  const checks: Array<[string, string, string]> = [
    ["app/data-sources/page.tsx", "보유 데이터", "지금 실제로 가지고 있는 것"],
    ["app/my/assistant/page.tsx", "관심 항목", "지켜보는 것\n"],
    ["app/pro/page.tsx", "브리핑 구성 항목", "브리핑에 들어가는 것"],
    ["app/town/experts/join/page.tsx", "인증 후 이용 범위", "인증되면 열리는 것"],
    ["app/town/experts/join/page.tsx", "준수 사항", "지켜야 할 것"],
    ["app/redevelopment/(index)/page.tsx", "단계별 상세 · 확인 사항", "이 단계에서 확인할 것"],
    ["app/redevelopment/(index)/page.tsx", "설명 · 유의점 · 확인 사항", "유의점 · 확인할 것"],
    ["app/analysis/ai/[tool]/ResultView.tsx", "계약 전 확인 사항", "계약 전에 확인할 것"],
    ["app/about/page.tsx", "없는 데이터는 없음으로 표시합니다", "없다고 말합니다"],
    ["app/components/home/HomeTodayLine.tsx", "오늘의 시장", "오늘의 한 줄\n"],
    ["app/components/talk/TalkPanel.tsx", 'aria-label="토론 의견"', "토론 한 줄"],
    ["app/decide/DecideClient.tsx", 'placeholder="메모"', "메모 한 줄"],
    ["app/map/ComplexInfoPanel.tsx", 'title="단지 공개 글"', "단지 이야기"],
    ["lib/ads/house-ads.ts", 'title: "임장노트 기록"', "다녀온 집 기록"],
    ["lib/inspection/note-deck.ts", 'title: "기타 메모"', "그밖에 적어둔 것"],
    ["lib/inspection/deep-dive.ts", 'eyebrow: "이 매물의 문제점"', "걸리는 것"],
    ["lib/inspection/deep-dive.ts", 'eyebrow: "다음 방문 전 확인 사항"', "방문 전에 확인할 것"],
    ["lib/ai/tool-tuning-fields.ts", 'label: "비교 기준"', "비교에서 중요한 것"],
    ["lib/ai/tool-tuning-fields.ts", 'label: "필수 조건"', "꼭 볼 것"],
    ["lib/ai/tool-tuning-fields.ts", 'label: "중점 항목"', "중점적으로 볼 것"],
    ["lib/guides/catalog.ts", 'heading: "출발 전 — 사전 확인 사항"', "예습으로 끝낼 것"],
    ["lib/guides/catalog.ts", 'heading: "단지 안 — 관리 상태 확인"', "말해주는 것"],
    ["lib/guides/catalog.ts", 'heading: "물건 정보 확인 사항"', "꼭 볼 것"],
    ["lib/notes/card-presets.ts", 'label: "현장 기록"', 'label: "현장 그대로"'],
  ];
  for (const [f, now, old] of checks) {
    const src = read(f);
    assert.ok(src.includes(now), `${f}: ${now}`);
    assert.ok(!src.includes(old), `${f}: 옛 말투 "${old.trim()}" 남음`);
  }
  /* 브랜드 문장은 그대로 */
  assert.match(read("app/components/BrandSignature.tsx"), /오래 머물 집을, 지금/);
});
