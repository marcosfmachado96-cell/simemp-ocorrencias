// Sincronização com o Supabase (MODO 'supabase').
// - enviarFila(): sobe a fila (outbox) do IndexedDB — ocorrências novas, eventos e fotos
// - trazer():     baixa o que mudou no servidor desde a última vez
// - tempo real:   o painel/app recebe mudanças assim que acontecem
// - autenticação: e-mail e senha (Supabase Auth) + perfil (tecnico / gestor / der)
window.REMOTE = (() => {
  let sb = null, canalRT = null;

  function cliente() {
    if (sb) return sb;
    if (!window.supabase || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) throw new Error('Supabase não configurado (js/config.js)');
    sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    return sb;
  }

  // ---------- autenticação ----------
  async function sessao() {
    const { data } = await cliente().auth.getSession();
    return data.session || null;
  }
  async function carregarPerfil(user) {
    const { data, error } = await cliente().from('perfis').select('id, nome, perfil, ativo').eq('id', user.id).single();
    if (error || !data) throw new Error('Perfil não encontrado — peça ao gestor para cadastrar seu usuário.');
    if (!data.ativo) throw new Error('Usuário desativado.');
    const u = { id: data.id, nome: data.nome, perfil: data.perfil, email: user.email };
    STORE.login(u);
    return u;
  }
  async function entrar(email, senha) {
    const { data, error } = await cliente().auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha inválidos' : error.message);
    return carregarPerfil(data.user);
  }
  async function sair() {
    try { await cliente().auth.signOut(); } catch (e) { /* offline: só limpa local */ }
    STORE.logout();
  }
  // restaura a sessão salva (funciona offline com o token guardado)
  async function restaurar() {
    const s = await sessao();
    if (!s) { STORE.logout(); return null; }
    const u = STORE.usuarioAtual();
    if (u && u.id === s.user.id) return u;
    try { return await carregarPerfil(s.user); } catch (e) { return u; }
  }

  // ---------- fotos ----------
  function urlPublica(caminho) { return cliente().storage.from('fotos').getPublicUrl(caminho).data.publicUrl; }
  async function subirFoto(f) {
    const caminho = `${f.oc_id}/${f.id}.jpg`;
    const { error } = await cliente().storage.from('fotos').upload(caminho, f.blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    const { error: e2 } = await cliente().from('fotos').upsert({ id: f.id, oc_id: f.oc_id, fase: f.fase, caminho, em: f.em });
    if (e2) throw e2;
    f.enviada = true; f.url = urlPublica(caminho);
    await STORE._put('fotos', f);
  }
  async function subirFotosDe(ids) {
    for (const id of ids || []) {
      const f = await STORE.foto(id);
      if (f && f.blob && !f.enviada) await subirFoto(f);
    }
  }

  // ---------- envio da fila ----------
  function linha(oc) {
    const { sync, ...r } = oc;
    return r;
  }
  async function enviarFila() {
    if (!(await sessao())) return;
    const itens = await STORE.fila();
    for (const item of itens) {
      const op = item.op;
      const oc = await STORE.obter(op.oc_id);
      if (!oc) { await STORE.concluirItem(item.seq); continue; }
      if (op.tipo === 'criar') {
        // a ocorrência precisa existir antes das fotos (chave estrangeira)
        const inicial = op.linha || linha(oc);
        const { error } = await cliente().from('ocorrencias').upsert(inicial);
        if (error) throw error;
        await subirFotosDe(inicial.historico[0] && inicial.historico[0].fotos);
      } else if (op.tipo === 'atualizar') {
        await subirFotosDe(op.evento.fotos);
        const { error } = await cliente().rpc('registrar_evento', {
          p_oc_id: op.oc_id, p_evento: op.evento, p_status: op.status, p_atendimento: op.atendimento, p_resolvida_em: op.resolvida_em,
        });
        if (error) throw error;
      }
      await STORE.concluirItem(item.seq);
    }
    // sem mais itens pendentes para essas ocorrências -> marca como enviadas
    const restantes = new Set((await STORE.fila()).map(i => i.op.oc_id));
    for (const item of itens) if (!restantes.has(item.op.oc_id)) await STORE.marcarEnviada(item.op.oc_id);
    if (itens.length) STORE.notificar();
  }

  // ---------- trazer do servidor ----------
  async function trazer(completo = false) {
    if (!(await sessao())) return;
    const desde = completo ? null : await STORE.meta('ultima_sync');
    let q = cliente().from('ocorrencias').select('*').order('atualizado_em', { ascending: true }).limit(1000);
    if (desde) q = q.gt('atualizado_em', desde);
    else if (!completo) {
      // primeira carga no celular: só as abertas + últimos 120 dias (o painel traz tudo)
      const limite = new Date(Date.now() - 120 * 864e5).toISOString();
      q = q.or(`status.neq.resolvida,criado_em.gte.${limite}`);
    }
    const { data, error } = await q;
    if (error) throw error;
    if (!data || !data.length) return;
    const ids = data.map(o => o.id);
    const fotos = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data: fs } = await cliente().from('fotos').select('id, oc_id, fase, caminho, em').in('oc_id', ids.slice(i, i + 100));
      (fs || []).forEach(f => fotos.push({ ...f, url: urlPublica(f.caminho) }));
    }
    let mudou = false;
    for (const o of data) {
      if (await STORE.receber(o, fotos.filter(f => f.oc_id === o.id))) mudou = true;
    }
    await STORE.meta('ultima_sync', data[data.length - 1].atualizado_em);
    if (mudou) STORE.notificar();
  }

  // ---------- tempo real ----------
  function assinar() {
    if (canalRT) return;
    canalRT = cliente().channel('ocorrencias-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ocorrencias' }, () => { trazer().catch(() => {}); })
      .subscribe();
  }

  let timer = null;
  async function iniciar() {
    const u = await restaurar();
    if (!u) return null;
    assinar();
    STORE.sincronizar();
    if (!timer) timer = setInterval(() => STORE.sincronizar(), 60000); // reforço a cada minuto
    return u;
  }

  return { cliente, entrar, sair, restaurar, iniciar, enviarFila, trazer, assinar };
})();
