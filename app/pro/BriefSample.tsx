/* [1025c · /pro] 브리핑 견본 미니 문서 — 브리핑 리포트(app/complex/[id]/brief)를 800×620 한 장으로 축소한 **SVG**.
   왜 SVG 인가: HTML 문서를 transform:scale 로 줄이면 높이를 JS 로 다시 재야 한다(시안 proScript). SVG 는 폭에 맞춰 글자·
   선·점이 함께 비례 축소되므로 JS 0 · 폰 320px 안에도 그대로 들어간다. 부품은 브리핑과 같은 것(BriefMiniChart · BriefRatioRing ·
   qrcode SVG 중첩) — 값은 lib/brief/sample.ts(공작아파트 실측 · "견본 · 2026-08 기준" 라벨). 색은 토큰 변수뿐 · 글자 크기는
   램프 값(10·12·13·15·19·24·28)만. 아래는 절취(다음 섹션은 종이 밖) — 시안 .paper .cut. */
import { BriefMiniChart } from "@/app/complex/[id]/brief/BriefMiniChart";
import { BriefRatioRing } from "@/app/complex/[id]/brief/BriefRatioRing";
import { BRIEF_SAMPLE as S } from "@/lib/brief/sample";
import { qrSvgParts } from "@/lib/brief/model";

const W = 800;
const H = 660;
const PX = 36; // 좌우 여백(md 문서 px-9)

const INK = "var(--ink)";
const T2 = "var(--text-2)";
const T3 = "var(--text-3)";
const PRIMARY = "var(--primary)";
const SOFT = "var(--primary-soft)";
const LINE = "var(--border)";
const BG = "var(--bg)";
const SURFACE = "var(--surface)";

function SectionTitle({ y, title, caption }: { y: number; title: string; caption?: string }) {
  return (
    <g>
      <circle cx={PX + 3} cy={y - 5} r={3} fill={PRIMARY} />
      <text x={PX + 12} y={y} fontSize={15} fontWeight={700} fill={INK}>
        {title}
      </text>
      {caption && (
        <text x={W - PX} y={y} fontSize={11} fill={T3} textAnchor="end">
          {caption}
        </text>
      )}
    </g>
  );
}

export function BriefSample({ qrRaw }: { qrRaw: string | null }) {
  const qr = qrSvgParts(qrRaw);
  const inner = W - PX * 2;
  const miniW = (inner - 16) / 3;
  const miniMax = Math.max(0, ...S.minis.map((m) => m.count));
  const ovwW = inner / 4;
  const cols = [PX, PX + 190, PX + 300, PX + 520, W - PX]; // 타입 · 최근가(오른끝) · 계약일 · 중앙값(오른끝) · 건수(오른끝)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`브리핑 리포트 견본 — ${S.label}`} className="font-sans">
      <rect width={W} height={H} fill={SURFACE} />
      {/* 발행자 띠 */}
      <rect width={W} height={30} fill={SOFT} />
      <text x={PX} y={19} fontSize={11} fontWeight={700} fill={PRIMARY}>
        {S.publisher}
      </text>
      <text x={W - PX} y={19} fontSize={11} fontWeight={700} fill={PRIMARY} textAnchor="end">
        {S.issued}
      </text>
      {/* 단지명 · 주소 */}
      <text x={PX} y={70} fontSize={24} fontWeight={700} fill={INK}>
        {S.name}
      </text>
      <text x={PX} y={90} fontSize={12} fill={T2}>
        {S.address}
      </text>
      {/* 요약 띠 */}
      <rect x={PX} y={104} width={inner} height={92} rx={12} fill={BG} stroke={LINE} />
      <text x={PX + 14} y={124} fontSize={11} fill={T3}>
        {S.latestCaption}
      </text>
      <text x={PX + 14} y={154} fontSize={28} fontWeight={700} fill={INK}>
        {S.latestPrice}
      </text>
      <text x={PX + 14} y={178} fontSize={12} fontWeight={700} fill={INK}>
        {S.conclusion}
      </text>
      <BriefRatioRing pct={S.jeonsePct} x={W - PX - 78} y={112} size={64} />
      <text x={W - PX - 46} y={190} fontSize={11} fill={T3} textAnchor="middle">
        전세가율
      </text>
      {/* 타입별 12개월 미니 3 */}
      <SectionTitle y={228} title="타입별 12개월 · 매매" caption={S.minisCaption} />
      {S.minis.map((m, i) => {
        const x = PX + i * (miniW + 8);
        const on = i === S.highlightRow;
        return (
          <g key={m.areaM2}>
            <rect x={x} y={238} width={miniW} height={98} rx={12} fill={on ? SOFT : SURFACE} stroke={on ? PRIMARY : LINE} />
            <text x={x + 12} y={256} fontSize={11} fill={T3}>
              {m.areaM2}㎡ · {m.countLabel}
            </text>
            <text x={x + 12} y={276} fontSize={13} fontWeight={700} fill={INK}>
              {m.price}
            </text>
            <g color={PRIMARY}>
              <BriefMiniChart series={m} maxCount={miniMax} x={x + 12} y={282} width={miniW - 24} height={36} />
            </g>
            <text x={x + 12} y={330} fontSize={11} fill={T3}>
              {m.sub}
            </text>
          </g>
        );
      })}
      {/* 개요 8칸 */}
      <SectionTitle y={368} title="개요" caption={S.overviewCaption} />
      <rect x={PX} y={378} width={inner} height={92} rx={12} fill={SURFACE} stroke={LINE} />
      {S.overview.map(([k, v], i) => {
        const x = PX + 12 + (i % 4) * ovwW;
        const y = 378 + (i < 4 ? 0 : 46);
        return (
          <g key={k}>
            <text x={x} y={y + 18} fontSize={11} fill={T3}>
              {k}
            </text>
            <text x={x} y={y + 36} fontSize={13} fontWeight={700} fill={INK}>
              {v}
            </text>
          </g>
        );
      })}
      {/* 타입별 최근 실거래 표 */}
      <SectionTitle y={502} title="타입별 최근 실거래 · 매매" caption={S.tableCaption} />
      <line x1={PX} y1={524} x2={W - PX} y2={524} stroke={LINE} />
      {S.tableHead.map((h, i) => (
        <text key={h} x={cols[i]} y={517} fontSize={11} fontWeight={600} fill={T3} textAnchor={i === 1 || i >= 3 ? "end" : "start"}>
          {h}
        </text>
      ))}
      {S.table.map((r, ri) => {
        const y = 526 + ri * 28;
        const on = ri === S.highlightRow;
        return (
          <g key={r[0]}>
            {on && <rect x={PX} y={y} width={inner} height={28} fill={SOFT} />}
            <line x1={PX} y1={y + 28} x2={W - PX} y2={y + 28} stroke="var(--divider)" />
            {r.map((c, ci) => (
              <text
                key={ci}
                x={cols[ci]}
                y={y + 18}
                fontSize={12}
                fontWeight={ci <= 1 ? 700 : 400}
                fill={c === "—" ? T3 : INK}
                textAnchor={ci === 1 || ci >= 3 ? "end" : "start"}
              >
                {c}
              </text>
            ))}
          </g>
        );
      })}
      {/* 견본 QR — 이 화면(/pro) 주소. 실제 브리핑은 단지 상세 주소. qrcode 가 흰 바탕을 제 안에 그린다 */}
      {qr && <svg x={W - PX - 40} y={H - 46} width={40} height={40} viewBox={qr.viewBox} dangerouslySetInnerHTML={{ __html: qr.inner }} />}
      <text x={PX} y={H - 14} fontSize={11} fill={T3}>
        {S.footer} · {S.label}
      </text>
    </svg>
  );
}

export default BriefSample;
