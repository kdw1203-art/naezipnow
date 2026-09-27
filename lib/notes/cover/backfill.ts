/**
 * 기존 공개 Lab 노트 썸네일 백필 — SQL 을 **만들기만** 한다(DB 에 쓰지 않는다). 순수 모듈.
 * CLI: scripts/notes-cover-backfill.mjs (입력 JSON → SQL 을 표준 출력으로). 적용은 통합자가 검토 뒤 한다.
 *
 * 규칙: 규칙 기반 문구만(LLM 없음) — 단지명 + 제목의 주장/이름이 분명한 지표. 변형은 목록 격자 순서
 * (최신순)대로 navy·hanji·light 를 대각선으로 돌린다 — 3열 격자에서 가로·세로로 같은 면이 붙지 않게.
 *   0행: navy hanji light / 1행: hanji light navy / 2행: light navy hanji …
 */
import { toCoverSpec, type CoverSpec, type CoverVariant } from "./spec";
import { buildSub, isLabCoverNote, ruleTexts } from "./rules";
import { buildNumberCorpus, verifyCoverText, type CoverNote } from "./verify";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROTATION: CoverVariant[] = ["navy", "hanji", "light"];

/** 입력 행 — DB 컬럼(snake_case) 그대로거나, 앱 모델(camelCase) 그대로 */
export type BackfillRow = Record<string, unknown>;

export type BackfillNote = CoverNote & { id: string; createdAt: string; isPublic: boolean | null };

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);

export function rowToCoverNote(row: BackfillRow): BackfillNote {
  const scores =
    row.scores && typeof row.scores === "object"
      ? (row.scores as CoverNote["scores"])
      : {
          location: num(row.score_location),
          school: num(row.score_school),
          transport: num(row.score_transport),
          facility: num(row.score_facility),
          future: num(row.score_future),
        };
  const isPublic = row.is_public ?? row.isPublic;
  return {
    id: String(row.id ?? ""),
    title: str(row.title),
    aptName: str(row.apt_name) ?? str(row.aptName),
    region: str(row.region),
    summary: str(row.summary),
    sections: row.sections,
    checklist: row.checklist,
    transportation: str(row.transportation),
    weather: str(row.weather),
    scores,
    metadata: row.metadata,
    photos: row.photos,
    authorLabel: str(row.author_label) ?? str(row.authorLabel),
    createdAt: String(row.created_at ?? row.createdAt ?? ""),
    isPublic: typeof isPublic === "boolean" ? isPublic : null,
  };
}

/** 격자 순서 i 번째 노트의 변형 — 대각선 회전 */
export function backfillVariantAt(i: number): CoverVariant {
  return ROTATION[(Math.floor(i / 3) + i) % 3];
}

export type BackfillItem = { id: string; noteNo: string | null; spec: CoverSpec };
export type BackfillPlan = { items: BackfillItem[]; skipped: { id: string; reason: string }[] };

function hasCover(meta: unknown): boolean {
  return Boolean(meta && typeof meta === "object" && (meta as Record<string, unknown>).cover);
}

export function planBackfill(
  rows: BackfillRow[],
  opts: { chosenAt: string; includeNonLab?: boolean; overwrite?: boolean },
): BackfillPlan {
  const notes = rows.map(rowToCoverNote);
  /* 목록 격자 순서 = 최신순. 시각이 없으면 입력 순서 */
  const ordered = [...notes].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  const items: BackfillItem[] = [];
  const skipped: BackfillPlan["skipped"] = [];
  const seen = new Set<string>();
  for (const n of ordered) {
    if (!UUID_RE.test(n.id)) {
      skipped.push({ id: n.id, reason: "id 가 uuid 가 아님" });
      continue;
    }
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    if (n.isPublic === false) {
      skipped.push({ id: n.id, reason: "비공개" });
      continue;
    }
    if (!opts.includeNonLab && !isLabCoverNote(n)) {
      skipped.push({ id: n.id, reason: "Lab 노트가 아님(사람 노트는 작성자가 고른다)" });
      continue;
    }
    if (!opts.overwrite && hasCover(n.metadata)) {
      skipped.push({ id: n.id, reason: "이미 커버가 있음" });
      continue;
    }
    const corpus = buildNumberCorpus(n);
    const text = ruleTexts(n, corpus, 1)[0];
    if (!text) {
      skipped.push({ id: n.id, reason: "검증을 통과한 문구가 없음" });
      continue;
    }
    const variant = backfillVariantAt(items.length);
    const sub = buildSub(n, text.headline);
    /* 두 번 확인 — 조립한 그대로 다시 검증(백필은 사람이 한 장씩 고르지 않으므로) */
    if (!verifyCoverText({ headline: text.headline, fact: text.fact, sub }, corpus).ok) {
      skipped.push({ id: n.id, reason: "재검증 실패" });
      continue;
    }
    const meta = n.metadata && typeof n.metadata === "object" ? (n.metadata as Record<string, unknown>) : {};
    const noteNo = meta.note_no != null ? String(meta.note_no) : null;
    items.push({
      id: n.id,
      noteNo,
      spec: toCoverSpec({ variant, headline: text.headline, fact: text.fact, sub, source: "rule" }, opts.chosenAt),
    });
  }
  return { items, skipped };
}

const sqlLiteral = (s: string) => `'${s.replace(/'/g, "''")}'`;
/* 주석 줄에 들어갈 사용자 글 — 줄바꿈·주석 끝 기호를 걷는다 */
const commentSafe = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/\*\//g, "* /");

/** 계획 → 검토용 SQL(트랜잭션 하나). updated_at 은 건드리지 않는다(내용 수정이 아니다) */
export function backfillSql(plan: BackfillPlan, opts: { overwrite?: boolean; generatedAt?: string } = {}): string {
  const lines: string[] = [];
  const counts = plan.items.reduce<Record<string, number>>((acc, it) => {
    acc[it.spec.variant] = (acc[it.spec.variant] ?? 0) + 1;
    return acc;
  }, {});
  lines.push("-- 임장노트 썸네일 백필 (metadata.cover) — scripts/notes-cover-backfill.mjs 가 만든 SQL. 검토 뒤 적용.");
  if (opts.generatedAt) lines.push(`-- 생성: ${opts.generatedAt}`);
  lines.push(`-- 대상 ${plan.items.length}건 · 변형 ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")} · 건너뜀 ${plan.skipped.length}건`);
  lines.push("-- 규칙 기반 문구(LLM 없음) · 숫자는 전부 노트 원문(제목·요약·본문·key_metrics)에 있는 값 · updated_at 은 그대로");
  lines.push("--");
  for (const it of plan.items) {
    lines.push(
      `-- #${it.noteNo ?? "-"} ${it.spec.variant.padEnd(5)} | ${commentSafe(it.spec.headline)} | ${commentSafe(it.spec.fact ?? "(사실 없음)")} | ${commentSafe(it.spec.sub)}`,
    );
  }
  for (const s of plan.skipped) lines.push(`-- 건너뜀 ${commentSafe(s.id)}: ${commentSafe(s.reason)}`);
  lines.push("");
  lines.push("begin;");
  for (const it of plan.items) {
    lines.push(
      [
        "update public.inspection_notes",
        `   set metadata = jsonb_set(case when jsonb_typeof(metadata) = 'object' then metadata else '{}'::jsonb end, '{cover}', ${sqlLiteral(JSON.stringify(it.spec))}::jsonb, true)`,
        ` where id = ${sqlLiteral(it.id)}`,
        "   and is_public = true",
        opts.overwrite ? null : "   and (metadata -> 'cover') is null",
      ]
        .filter(Boolean)
        .join("\n") + ";",
    );
  }
  lines.push("commit;");
  lines.push("");
  const ids = plan.items.map((it) => sqlLiteral(it.id)).join(", ");
  if (ids) {
    lines.push("-- 확인:");
    lines.push(
      `-- select id, metadata->'cover'->>'variant' as variant, metadata->'cover'->>'headline' as headline, metadata->'cover'->>'fact' as fact from public.inspection_notes where id in (${ids}) order by created_at desc;`,
    );
    lines.push("-- 되돌리기(커버만 지운다):");
    lines.push(`-- update public.inspection_notes set metadata = metadata - 'cover' where id in (${ids});`);
  }
  return lines.join("\n") + "\n";
}

/** 입력 JSON 을 뽑는 **읽기 전용** SELECT — 결과(JSON 배열 한 칸)를 파일로 저장해 --input 으로 넘긴다 */
export const BACKFILL_SELECT_SQL = [
  "select coalesce(json_agg(t order by t.created_at desc), '[]'::json)",
  "from (",
  "  select id, title, apt_name, region, summary, sections, checklist, transportation, weather,",
  "         score_location, score_school, score_transport, score_facility, score_future,",
  "         author_label, is_public, created_at,",
  "         jsonb_build_object('key_metrics', metadata->'key_metrics', 'decision', metadata->'decision',",
  "                            'note_no', metadata->'note_no', 'cover', metadata->'cover') as metadata",
  "    from public.inspection_notes",
  "   where is_public = true",
  ") t;",
].join("\n");
