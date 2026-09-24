-- ============================================================
-- 005 — edição de ocorrências pelo gestor (com registro no histórico)
-- Executar no SQL Editor depois dos anteriores.
-- ============================================================

-- Só o gestor edita, só ocorrências não resolvidas, e apenas os campos permitidos.
-- A alteração fica registrada no histórico (quem, quando, o que mudou).
create or replace function public.editar_ocorrencia(
  p_oc_id uuid, p_campos jsonb, p_evento jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if public.meu_perfil() <> 'gestor' then
    raise exception 'Somente o gestor pode editar ocorrências.';
  end if;

  select status into v_status from public.ocorrencias where id = p_oc_id;
  if v_status is null then raise exception 'Ocorrência não encontrada.'; end if;
  if v_status = 'resolvida' then raise exception 'Ocorrência resolvida não pode ser editada.'; end if;

  update public.ocorrencias set
    rodovia       = coalesce(p_campos->>'rodovia', rodovia),
    km            = coalesce((p_campos->>'km')::numeric, km),
    sentido       = coalesce(p_campos->>'sentido', sentido),
    municipio     = coalesce(p_campos->>'municipio', municipio),
    tipo          = coalesce(p_campos->>'tipo', tipo),
    severidade    = coalesce(p_campos->>'severidade', severidade),
    pista_afetada = coalesce(p_campos->>'pista_afetada', pista_afetada),
    risco_colapso = coalesce((p_campos->>'risco_colapso')::boolean, risco_colapso),
    observacao    = coalesce(p_campos->>'observacao', observacao),
    historico     = historico || jsonb_build_array(p_evento),
    atualizado_em = now()
  where id = p_oc_id;
end $$;
