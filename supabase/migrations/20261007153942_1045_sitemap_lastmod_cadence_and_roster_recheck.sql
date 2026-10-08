/* [1045] 정비사업 사이트맵의 lastmod 주기 + 미제출 명부 재확인
 *
 * 배경(2026-10-07 운영 경보):
 *   seo.sitemap_source · dead_source    /sitemap-redevelopment.xml 이 갱신이 멈춘 구역 40행에만 물려 있다
 *   seo.sitemap_source · lastmod_vanish  1040 이 <lastmod> 를 빼서 신선도 감시가 수리 없이 꺼졌다
 * 앱(1045)이 고치는 것: 매일 적재되는 서울시 결정 조서를 자치구 화면 25곳 + 목차로 색인에 싣고, <lastmod> 를 다시 적는다
 *   (자치구 = 그 구의 가장 최근 결정일 · 구역 40곳 = 행을 정리한 시점). 적재 시각은 적지 않는다 — 매일 전량을 다시 읽으므로
 *   그 값은 원천이 조용해도 "오늘 바뀌었다"가 된다.
 * 여기서 고치는 것:
 *   (1) ops.seo_asset_check 는 lastmod 값이 월 경계가 아니면 전부 "일 주기 자산"으로 읽는다(임계 48h/96h, 관측 이력이 있어도
 *       상한 14일/21일). 이 사이트맵의 원천(서울시 결정 고시)은 월 단위로 몰려 공개된다 — 2026-03~09 월별 결정 113·22·81·14·44·27·1건,
 *       최신 2026-09-09. 사실대로 적은 lastmod 는 원천이 조용한 달마다 상시 critical 이 된다. 그래서 사이트맵별 주기를 표로 둔다
 *       (ops.sitemap_lastmod_cadence). 이 표에 없는 사이트맵은 예전 판정 그대로다. 임계는 함수의 월 주기 값과 같다(45일 warn · 75일 critical)
 *       — 원천이 두 달 반 넘게 조용하면 그때는 적재 정지나 원천 폐기를 의심할 일이다.
 *   (2) ops.indexable_unsubmitted_roster 의 여섯 경로는 2026-10-04 에 확인한 robots 값(index 또는 없음)으로 남아 있다.
 *       1040(2026-10-06 배포)부터 여섯 곳 모두 noindex 다 — 2026-10-07 운영 응답의 robots 메타를 직접 읽어 확인했다.
 *       확인 시각과 값을 고쳐 적는다(행은 그대로 둔다).
 */
create table if not exists ops.sitemap_lastmod_cadence (
  sitemap_path text primary key,
  warn_hours numeric not null check (warn_hours > 0),
  crit_hours numeric not null check (crit_hours >= warn_hours),
  label text not null,
  reason text not null,
  set_at timestamptz not null default now()
);
comment on table ops.sitemap_lastmod_cadence is
  '사이트맵별 lastmod 신선도 임계(시간). ops.seo_asset_check 가 읽는다 — 행이 없으면 값의 모양·관측 이력에서 파생하던 예전 판정 그대로. 행을 넣을 때는 원천의 실제 공개 주기를 reason 에 적는다.';
revoke all on ops.sitemap_lastmod_cadence from public, anon, authenticated;

insert into ops.sitemap_lastmod_cadence (sitemap_path, warn_hours, crit_hours, label, reason)
values (
  '/sitemap-redevelopment.xml', 1080, 1800, '원천 고시 주기 자산',
  '원천 = 서울 열린데이터광장 도시계획 결정 조서(seoul_upis_records). lastmod = 자치구별 가장 최근 결정일. 결정 고시는 월 단위로 몰려 공개된다(2026-03~09 월별 113·22·81·14·44·27·1건 · 2026-10-07 기준 최신 2026-09-09). 적재 자체의 정지는 적재 신선도 점검이 따로 본다.'
)
on conflict (sitemap_path) do nothing;

do $mig$
declare
  v text;
  v_anchor text := 'lm_crit := case when lm_monthly then 1800 else least(lm_warn * 2, 504) end;';
begin
  select pg_get_functiondef(p.oid) into v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'ops' and p.proname = 'seo_asset_check';
  if v is null then
    raise exception '1045: ops.seo_asset_check 를 찾지 못했다';
  end if;
  if position('sitemap_lastmod_cadence' in v) > 0 then
    return;
  end if;
  if position(v_anchor in v) = 0 then
    raise exception '1045: 끼워 넣을 자리(lm_crit 줄)를 찾지 못했다 — 함수 본문이 바뀌었다';
  end if;
  execute replace(v, v_anchor, v_anchor || $ins$
      /* [1045] 사이트맵별 주기 — 원천이 일 단위로 움직이지 않는 사이트맵(ops.sitemap_lastmod_cadence). 행이 없으면 위 값 그대로. */
      lm_warn := coalesce((select c.warn_hours from ops.sitemap_lastmod_cadence c
                            where c.sitemap_path = regexp_replace(a.url, '^https?://[^/]+', '')), lm_warn);
      lm_crit := coalesce((select c.crit_hours from ops.sitemap_lastmod_cadence c
                            where c.sitemap_path = regexp_replace(a.url, '^https?://[^/]+', '')), lm_crit);
      lm_cadence := coalesce((select c.label from ops.sitemap_lastmod_cadence c
                               where c.sitemap_path = regexp_replace(a.url, '^https?://[^/]+', '')), lm_cadence);$ins$);
end
$mig$;

update ops.indexable_unsubmitted_roster r
   set robots_meta = v.robots,
       checked_at = now(),
       note = concat_ws(' · ', nullif(r.note, ''), '1045: 운영 응답의 robots 메타 재확인(2026-10-07) — 1040 부터 noindex')
  from (values
          ('/decide', 'noindex, nofollow'),
          ('/qna', 'noindex, follow'),
          ('/town/experts', 'noindex, follow'),
          ('/notes/templates', 'noindex, follow'),
          ('/notes/templates/official-redev', 'noindex, follow'),
          ('/notes/templates/official-remodel', 'noindex, follow')
       ) as v(path, robots)
 where r.url_path = v.path
   and r.submitted_at is null;