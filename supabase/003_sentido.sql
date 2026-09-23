-- ============================================================
-- 003 — sentido passa de crescente/decrescente para direita/esquerda
-- (segue o padrão do SRE: "Direita - sentido crescente da rodovia")
-- ============================================================
update public.ocorrencias set sentido = 'direita'  where sentido = 'crescente';
update public.ocorrencias set sentido = 'esquerda' where sentido = 'decrescente';
