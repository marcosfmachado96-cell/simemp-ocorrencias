-- ============================================================
-- 006 — novas situações da ocorrência
-- Aberta → Aguardando atendimento / Em monitoramento / Em obras → Resolvida
-- ("Em obras" assume o lugar de "Em atendimento")
-- ============================================================

alter table public.ocorrencias drop constraint if exists ocorrencias_status_check;
alter table public.ocorrencias add constraint ocorrencias_status_check
  check (status in ('aberta','aguardando_atendimento','em_monitoramento','em_obras','resolvida'));

update public.ocorrencias set status = 'em_obras' where status = 'em_atendimento';

-- o histórico também guarda o status de cada evento
update public.ocorrencias o
   set historico = (
     select jsonb_agg(case when e->>'status' = 'em_atendimento'
                           then jsonb_set(e, array['status'], to_jsonb('em_obras'::text))
                           else e end order by ord)
     from jsonb_array_elements(o.historico) with ordinality as t(e, ord)
   )
 where exists (select 1 from jsonb_array_elements(o.historico) x where x->>'status' = 'em_atendimento');
