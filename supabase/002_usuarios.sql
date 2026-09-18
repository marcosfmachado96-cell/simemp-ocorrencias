-- ============================================================
-- 002 — cadastro de usuários pelo painel (gestor)
-- Executar no SQL Editor depois do schema.sql.
-- ============================================================

-- e-mail no perfil (para listar no painel)
alter table public.perfis add column if not exists email text;
update public.perfis p set email = u.email from auth.users u where u.id = p.id and p.email is null;

-- Novo usuário nasce INATIVO e como técnico, ignorando o que vier no cadastro.
-- O painel (gestor) ativa e define nome/perfil logo em seguida.
-- Quem se cadastrar por conta própria fica sem acesso.
create or replace function public.criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, perfil, ativo, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    'tecnico',
    false,
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- gestor pode editar perfis (nome, perfil, ativo)
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
