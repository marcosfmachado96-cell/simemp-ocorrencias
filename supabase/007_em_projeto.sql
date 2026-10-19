-- ============================================================
-- 007 — nova situação: em elaboração de projeto
-- ============================================================
alter table public.ocorrencias drop constraint if exists ocorrencias_status_check;
alter table public.ocorrencias add constraint ocorrencias_status_check
  check (status in ('aberta','aguardando_atendimento','em_monitoramento','em_projeto','em_obras','resolvida'));
