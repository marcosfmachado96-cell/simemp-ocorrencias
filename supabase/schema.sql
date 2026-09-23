-- ============================================================
-- SIMEMP Ocorrências — banco de dados (Supabase / Postgres)
-- Colar inteiro no SQL Editor do projeto Supabase e executar.
-- Pode ser executado mais de uma vez (idempotente).
-- ============================================================

-- ---------- perfis de usuário ----------
create table if not exists public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  perfil     text not null default 'tecnico' check (perfil in ('tecnico', 'gestor', 'der')),
  ativo      boolean not null default true,
  email      text,
  criado_em  timestamptz not null default now()
);
alter table public.perfis add column if not exists email text;

-- cria o perfil automaticamente quando um usuário é cadastrado (painel ou Authentication > Users).
-- Nasce INATIVO e como técnico: o gestor ativa e define nome/perfil pelo painel.
-- Quem se cadastrar por conta própria fica sem acesso.
create or replace function public.criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, perfil, ativo, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), 'tecnico', false, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.criar_perfil();

-- perfil do usuário logado (usado nas políticas)
create or replace function public.meu_perfil()
returns text language sql stable security definer set search_path = public as $$
  select perfil from public.perfis where id = auth.uid() and ativo;
$$;

-- ---------- ocorrências ----------
create table if not exists public.ocorrencias (
  id             uuid primary key,
  criado_em      timestamptz not null,
  criado_por_id  uuid references public.perfis(id),
  criado_por     text,
  status         text not null check (status in ('aberta', 'em_atendimento', 'resolvida')),
  lat            double precision,
  lng            double precision,
  precisao       integer,
  rodovia        text not null,
  km             numeric(8,2) not null,
  sentido        text,   -- direita | esquerda | ambos (padrão SRE)
  trecho         text,
  municipio      text,
  tipo           text not null,
  severidade     text not null,
  pista_afetada  text,
  risco_colapso  boolean not null default false,
  observacao     text,
  atendimento    jsonb,
  historico      jsonb not null default '[]'::jsonb,
  resolvida_em   timestamptz,
  atualizado_em  timestamptz not null default now()
);
create index if not exists ocorrencias_status_idx on public.ocorrencias (status);
create index if not exists ocorrencias_atualizado_idx on public.ocorrencias (atualizado_em);
create index if not exists ocorrencias_criado_idx on public.ocorrencias (criado_em desc);

-- ---------- fotos (arquivo fica no Storage, aqui só o índice) ----------
create table if not exists public.fotos (
  id       uuid primary key,
  oc_id    uuid not null references public.ocorrencias(id) on delete cascade,
  fase     text not null check (fase in ('abertura', 'acompanhamento', 'atendimento', 'comprovacao')),
  caminho  text not null,          -- caminho dentro do bucket "fotos"
  em       timestamptz not null default now()
);
create index if not exists fotos_oc_idx on public.fotos (oc_id);

-- ---------- atualização atômica (acrescenta evento ao histórico) ----------
-- Chamado pelo app ao iniciar atendimento / registrar avanço / resolver.
create or replace function public.registrar_evento(
  p_oc_id uuid, p_evento jsonb, p_status text, p_atendimento jsonb, p_resolvida_em timestamptz
) returns void language plpgsql security definer set search_path = public as $$
begin
  if public.meu_perfil() not in ('tecnico', 'gestor') then
    raise exception 'sem permissão';
  end if;
  update public.ocorrencias set
    historico     = historico || jsonb_build_array(p_evento),
    status        = coalesce(p_status, status),
    atendimento   = coalesce(p_atendimento, atendimento),
    resolvida_em  = coalesce(p_resolvida_em, resolvida_em),
    atualizado_em = now()
  where id = p_oc_id;
end $$;

-- ---------- segurança (RLS) ----------
alter table public.perfis      enable row level security;
alter table public.ocorrencias enable row level security;
alter table public.fotos       enable row level security;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated using (true);
drop policy if exists perfis_atualizar on public.perfis;
create policy perfis_atualizar on public.perfis for update to authenticated
  using (public.meu_perfil() = 'gestor') with check (public.meu_perfil() = 'gestor');

-- gestor não pode se desativar nem rebaixar o próprio perfil por engano
create or replace function public.proteger_gestor()
returns trigger language plpgsql as $$
begin
  if old.id = auth.uid() and (new.ativo = false or new.perfil <> 'gestor') then
    raise exception 'Você não pode desativar ou rebaixar o seu próprio usuário.';
  end if;
  return new;
end $$;
drop trigger if exists ao_atualizar_perfil on public.perfis;
create trigger ao_atualizar_perfil before update on public.perfis
  for each row execute function public.proteger_gestor();

drop policy if exists oc_ler on public.ocorrencias;
create policy oc_ler on public.ocorrencias for select to authenticated using (public.meu_perfil() is not null);
drop policy if exists oc_inserir on public.ocorrencias;
create policy oc_inserir on public.ocorrencias for insert to authenticated with check (public.meu_perfil() in ('tecnico', 'gestor'));
drop policy if exists oc_atualizar on public.ocorrencias;
create policy oc_atualizar on public.ocorrencias for update to authenticated using (public.meu_perfil() in ('tecnico', 'gestor'));
drop policy if exists oc_apagar on public.ocorrencias;
create policy oc_apagar on public.ocorrencias for delete to authenticated using (public.meu_perfil() = 'gestor');

drop policy if exists fotos_ler on public.fotos;
create policy fotos_ler on public.fotos for select to authenticated using (public.meu_perfil() is not null);
drop policy if exists fotos_inserir on public.fotos;
create policy fotos_inserir on public.fotos for insert to authenticated with check (public.meu_perfil() in ('tecnico', 'gestor'));
drop policy if exists fotos_atualizar on public.fotos;
create policy fotos_atualizar on public.fotos for update to authenticated using (public.meu_perfil() in ('tecnico', 'gestor'));

-- tempo real: o painel recebe as mudanças na hora
do $$ begin
  alter publication supabase_realtime add table public.ocorrencias;
exception when duplicate_object then null; end $$;

-- ---------- storage (bucket de fotos) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152;

drop policy if exists "fotos: leitura publica" on storage.objects;
create policy "fotos: leitura publica" on storage.objects for select using (bucket_id = 'fotos');
drop policy if exists "fotos: envio por tecnicos" on storage.objects;
create policy "fotos: envio por tecnicos" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.meu_perfil() in ('tecnico', 'gestor'));
drop policy if exists "fotos: exclusao pelo gestor" on storage.objects;
create policy "fotos: exclusao pelo gestor" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.meu_perfil() = 'gestor');
drop policy if exists "fotos: reenvio por tecnicos" on storage.objects;
create policy "fotos: reenvio por tecnicos" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and public.meu_perfil() in ('tecnico', 'gestor'));
