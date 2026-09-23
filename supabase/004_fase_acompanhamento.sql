-- ============================================================
-- 004 — fotos de acompanhamento (nova fase)
-- ============================================================
alter table public.fotos drop constraint if exists fotos_fase_check;
alter table public.fotos add constraint fotos_fase_check
  check (fase in ('abertura', 'acompanhamento', 'atendimento', 'comprovacao'));
