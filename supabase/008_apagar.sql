-- ============================================================
-- 008 — exclusão de ocorrência pelo gestor, com registro de auditoria
-- ============================================================

-- Guarda o que foi apagado: sem isso, uma exclusão some sem deixar rastro.
create table if not exists public.exclusoes (
  id            uuid primary key default gen_random_uuid(),
  oc_id         uuid not null,
  ocorrencia    jsonb not null,          -- cópia integral do registro
  qtd_fotos     integer not null default 0,
  motivo        text not null,
  apagada_por   uuid references public.perfis(id),
  apagada_nome  text,
  apagada_em    timestamptz not null default now()
);
create index if not exists exclusoes_em_idx on public.exclusoes (apagada_em desc);

alter table public.exclusoes enable row level security;
drop policy if exists exclusoes_ler on public.exclusoes;
create policy exclusoes_ler on public.exclusoes for select to authenticated
  using (public.meu_perfil() in ('gestor', 'der'));

-- Só o gestor apaga, o motivo é obrigatório e a cópia fica guardada.
create or replace function public.apagar_ocorrencia(p_oc_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_oc    public.ocorrencias%rowtype;
  v_fotos integer;
  v_nome  text;
begin
  if public.meu_perfil() <> 'gestor' then
    raise exception 'Somente o gestor pode apagar ocorrências.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da exclusão.';
  end if;

  select * into v_oc from public.ocorrencias where id = p_oc_id;
  if not found then raise exception 'Ocorrência não encontrada.'; end if;

  select count(*) into v_fotos from public.fotos where oc_id = p_oc_id;
  select nome into v_nome from public.perfis where id = auth.uid();

  insert into public.exclusoes (oc_id, ocorrencia, qtd_fotos, motivo, apagada_por, apagada_nome)
  values (p_oc_id, to_jsonb(v_oc), v_fotos, btrim(p_motivo), auth.uid(), v_nome);

  delete from public.ocorrencias where id = p_oc_id;   -- fotos saem por cascata
end $$;
