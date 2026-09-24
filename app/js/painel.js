// Painel (computador): mapa, filtros, lista, detalhe e relatório
(async () => {
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtData = iso => { const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const fmtKm = km => 'km ' + Number(km).toFixed(2).replace('.', ',');
  const horas = (a, b) => (new Date(b) - new Date(a)) / 36e5;
  const I = ICONS;

  $('#btn-pdf').innerHTML = I.file + 'Relatório PDF';

  await STORE.init();
  await GEO.carregar('data/malha_leste.geojson');
  if (CONFIG.MODO === 'local' && !(await STORE.meta('seed'))) await SEED.gerar(28);

  // ---------- usuário ----------
  const SUPA = CONFIG.MODO === 'supabase';
  const selU = $('#sel-usuario');
  if (SUPA) {
    selU.classList.add('oculto');
    $('#btn-sair').innerHTML = I.logout; $('#btn-sair').classList.remove('oculto');
    $('#btn-sair').onclick = async () => { await REMOTE.sair(); location.reload(); };
    let u = null;
    try { u = await REMOTE.iniciar(); } catch (ex) { console.warn(ex); }
    if (!u) {
      $('#tela-login').classList.remove('oculto');
      await new Promise(resolve => {
        $('#login-real').onsubmit = async e => {
          e.preventDefault();
          const b = $('#btn-entrar-real'), erro = $('#login-erro'); b.disabled = true; erro.classList.add('oculto');
          try { u = await REMOTE.entrar($('#login-email').value.trim(), $('#login-senha').value); await REMOTE.iniciar(); resolve(); }
          catch (ex) { erro.textContent = ex.message; erro.classList.remove('oculto'); }
          finally { b.disabled = false; }
        };
      });
      $('#tela-login').classList.add('oculto');
    }
    $('#usuario-topo').textContent = u.nome; $('#usuario-topo').classList.remove('oculto');
    $('#btn-senha').innerHTML = I.key; $('#btn-senha').classList.remove('oculto'); $('#btn-senha').onclick = () => modalSenha();
    if (u.perfil === 'gestor') { $('#btn-usuarios').innerHTML = I.users + 'Usuários'; $('#btn-usuarios').classList.remove('oculto'); $('#btn-usuarios').onclick = () => modalUsuarios(); }
    await REMOTE.trazer(true).catch(() => {});
  } else {
    // protótipo: troca de usuário direto no topo
    CONFIG.USUARIOS_DEMO.forEach(u => selU.appendChild(el('option', null, `${esc(u.nome)} (${u.perfil})`)).value = u.id);
    const uAtual = STORE.usuarioAtual() || CONFIG.USUARIOS_DEMO[0];
    selU.value = uAtual.id; STORE.login(uAtual);
    selU.onchange = () => { STORE.login(CONFIG.USUARIOS_DEMO.find(u => u.id === selU.value)); render(); };
  }

  // rede
  async function atualizarRede() { const c = $('#chip-rede'); c.classList.toggle('off', !navigator.onLine); c.textContent = navigator.onLine ? 'online' : 'offline'; }
  window.addEventListener('online', atualizarRede); window.addEventListener('offline', atualizarRede); atualizarRede();

  // ---------- filtros ----------
  const filtro = { escopo: 'abertas', de: '', ate: '', rod: '', status: '', sev: '', tipo: '', colapso: false };
  const hoje = new Date(); const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  $('#f-de').value = ini.toISOString().slice(0, 10); $('#f-ate').value = hoje.toISOString().slice(0, 10);
  filtro.de = $('#f-de').value; filtro.ate = $('#f-ate').value;
  document.querySelectorAll('.escopo button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.escopo button').forEach(x => x.classList.remove('ativo')); b.classList.add('ativo');
    filtro.escopo = b.dataset.escopo; $('#periodo').classList.toggle('oculto', filtro.escopo !== 'todas'); render();
  });
  GEO.rodovias().forEach(r => $('#f-rod').appendChild(el('option', null, r)).value = r);
  CONFIG.STATUS.forEach(s => $('#f-status').appendChild(el('option', null, s.nome)).value = s.id);
  CONFIG.SEVERIDADES.forEach(s => $('#f-sev').appendChild(el('option', null, s.nome)).value = s.id);
  CONFIG.TIPOS.forEach(s => $('#f-tipo').appendChild(el('option', null, s.nome)).value = s.id);
  [['f-de', 'de'], ['f-ate', 'ate'], ['f-rod', 'rod'], ['f-status', 'status'], ['f-sev', 'sev'], ['f-tipo', 'tipo']].forEach(([id, k]) => $('#' + id).onchange = e => { filtro[k] = e.target.value; render(); });
  $('#f-colapso').onchange = e => { filtro.colapso = e.target.checked; render(); };

  function aplicarFiltro(lista) {
    return lista.filter(o => {
      if (filtro.escopo === 'abertas' && o.status === 'resolvida') return false;
      if (filtro.escopo === 'todas') {
        const d = o.criado_em.slice(0, 10);
        if (filtro.de && d < filtro.de) return false;
        if (filtro.ate && d > filtro.ate) return false;
      }
      if (filtro.rod && o.rodovia !== filtro.rod) return false;
      if (filtro.status && o.status !== filtro.status) return false;
      if (filtro.sev && o.severidade !== filtro.sev) return false;
      if (filtro.tipo && o.tipo !== filtro.tipo) return false;
      if (filtro.colapso && !o.risco_colapso) return false;
      return true;
    });
  }

  // ---------- mapa ----------
  const mapa = L.map('mapa', { zoomControl: true }).setView([-25.45, -49.0], 9);
  L.tileLayer(CONFIG.TILES, { maxZoom: 19, attribution: CONFIG.TILES_ATTR }).addTo(mapa);
  const camadaMalha = L.geoJSON(GEO.getMalha(), { style: f => ({ color: '#2a63b0', weight: f.properties.sentido === 'ambos' ? 2.4 : 1.8, opacity: .55 }),
    onEachFeature: (f, l) => l.bindTooltip(`<b>${f.properties.rod}</b> · km ${f.properties.km_ini}–${f.properties.km_fim}`, { sticky: true, className: 'marker-tip' }) }).addTo(mapa);
  let visiveis = [];
  const enquadrar = () => {
    mapa.invalidateSize();
    const pts = visiveis.filter(o => o.lat).map(o => [o.lat, o.lng]);
    mapa.fitBounds(pts.length >= 2 ? L.latLngBounds(pts) : camadaMalha.getBounds(), { padding: [28, 28], maxZoom: 13 });
  };
  enquadrar(); setTimeout(enquadrar, 400);
  window.addEventListener('resize', () => mapa.invalidateSize());
  fetch('data/malha_pr.geojson').then(r => r.json()).then(g => L.geoJSON(g, { style: { color: '#9aa4b2', weight: 1, opacity: .3 }, interactive: false }).addTo(mapa).bringToBack()).catch(() => {});
  const camadaPts = L.layerGroup().addTo(mapa);
  const marcadores = new Map();

  // ---------- abas Lista / Mapa (telas estreitas) ----------
  let mapaJaAberto = false;
  function irAba(nome) {
    document.body.dataset.aba = nome;
    document.querySelectorAll('#abas button').forEach(b => b.classList.toggle('ativo', b.dataset.aba === nome));
    if (nome !== 'mapa') return;
    // o mapa foi criado com o container oculto: recalcula tamanho e enquadramento
    setTimeout(() => {
      mapa.invalidateSize();
      if (!mapaJaAberto) { mapaJaAberto = true; enquadrar(); }
    }, 80);
  }
  document.querySelectorAll('#abas button').forEach(b => {
    b.innerHTML = (b.dataset.aba === 'mapa' ? I.pin : I.inbox) + b.textContent;
    b.onclick = () => irAba(b.dataset.aba);
  });
  irAba('lista');

  // legenda
  $('#leg-sev').innerHTML = CONFIG.SEVERIDADES.map(s => `<div class="it"><span class="pt" style="background:${s.cor}"></span>${s.nome}</div>`).join('');
  $('#leg-status').innerHTML = CONFIG.STATUS.map(s => `<div class="it"><span class="pt borda" style="--c:${s.cor}"></span>${s.nome}</div>`).join('');

  // ---------- render ----------
  let todas = [], selecionada = null;
  async function render() {
    todas = await STORE.listar();
    visiveis = aplicarFiltro(todas);
    renderKpis(); renderLista(); renderMapa();
    if (selecionada) renderDetalhe(selecionada);
  }
  STORE.onChange(render);

  function renderKpis() {
    const abertas = todas.filter(o => o.status === 'aberta').length;
    const emAt = todas.filter(o => o.status === 'em_atendimento').length;
    const crit = todas.filter(o => o.status !== 'resolvida' && o.severidade === 'critica').length;
    const colapso = todas.filter(o => o.status !== 'resolvida' && o.risco_colapso).length;
    const res = todas.filter(o => o.status === 'resolvida' && o.resolvida_em);
    const tm = res.length ? res.reduce((s, o) => s + horas(o.criado_em, o.resolvida_em), 0) / res.length : 0;
    const kpi = (ic, v, t, cor, alerta) => `<div class="kpi ${alerta ? 'alerta' : ''}" style="--c:${cor}"><div class="ico-wrap">${ic}</div><div><b>${v}</b><span>${t}</span></div></div>`;
    $('#kpis').innerHTML =
      kpi(I.inbox, abertas, 'Abertas', '#dc2626') +
      kpi(I.truck, emAt, 'Em atendimento', '#d97706') +
      kpi(I.zap, crit, 'Críticas em aberto', '#dc2626', crit > 0) +
      kpi(I.alert, colapso, 'Risco de colapso', '#b91c1c', colapso > 0) +
      kpi(I.clock, tm ? tm.toFixed(0) + ' h' : '—', 'Tempo médio de resolução', '#2a63b0');
  }

  function renderLista() {
    const c = $('#lista'); c.innerHTML = '';
    $('#resumo-lista').innerHTML = `${I.filter}${visiveis.length} ocorrência(s) ${filtro.escopo === 'abertas' ? 'em aberto' : 'no período'}`;
    if (!visiveis.length) { c.appendChild(el('div', 'vazio', `${I.search}<div>Nada encontrado com os filtros atuais.</div>`)); c.querySelector('.ico').style.color = 'var(--muted-2)'; return; }
    for (const o of visiveis) {
      const d = el('div', 'card oc' + (selecionada === o.id ? ' sel' : ''));
      d.style.setProperty('--sev', CONFIG.corSev(o.severidade));
      d.innerHTML = `
        <div class="linha1"><span class="titulo">${esc(CONFIG.nomeTipo(o.tipo))}</span>
          <span class="badge soft" style="--cor:${CONFIG.corStatus(o.status)}">${esc(CONFIG.nomeStatus(o.status))}</span></div>
        <div class="local">${esc(o.rodovia)} · ${fmtKm(o.km)} · ${esc(CONFIG.nomeSentido(o.sentido))}</div>
        <div class="meta"><span class="badge" style="--cor:${CONFIG.corSev(o.severidade)}">${esc(CONFIG.nomeSev(o.severidade))}</span>
          ${o.risco_colapso ? `<span class="aviso-colapso">${I.alert}colapso</span>` : ''}<span>${fmtData(o.criado_em)}</span><span>${esc(o.criado_por)}</span></div>`;
      d.onclick = () => selecionar(o.id, true);
      c.appendChild(d);
    }
  }

  function renderMapa() {
    camadaPts.clearLayers(); marcadores.clear();
    for (const o of visiveis) {
      if (!o.lat) continue;
      const m = L.circleMarker([o.lat, o.lng], { radius: o.severidade === 'critica' ? 10 : 7.5, color: CONFIG.corStatus(o.status), weight: 3, fillColor: CONFIG.corSev(o.severidade), fillOpacity: 1 });
      m.bindTooltip(`<div class="marker-tip"><b>${esc(o.rodovia)} · ${fmtKm(o.km)}</b><br>${esc(CONFIG.nomeTipo(o.tipo))} · ${esc(CONFIG.nomeSev(o.severidade))}<br>${esc(CONFIG.nomeStatus(o.status))}${o.risco_colapso ? ' · risco de colapso' : ''}</div>`);
      m.on('click', () => selecionar(o.id, false));
      m.addTo(camadaPts); marcadores.set(o.id, m);
    }
  }

  function selecionar(id, centrar) {
    selecionada = id; renderLista(); renderDetalhe(id);
    const m = marcadores.get(id);
    if (m && centrar) mapa.flyTo(m.getLatLng(), Math.max(mapa.getZoom(), 13), { duration: .6 });
    if (m) m.openTooltip();
  }
  // botão "ver no mapa" dentro do detalhe, útil no celular
  function verNoMapa(id) {
    irAba('mapa');
    const m = marcadores.get(id);
    if (m) setTimeout(() => { mapa.flyTo(m.getLatLng(), Math.max(mapa.getZoom(), 14), { duration: .6 }); m.openTooltip(); }, 120);
    $('#detalhe').classList.add('oculto');
  }

  function blocoAtendimento(at) {
    if (!at) return '';
    const p = [];
    if (at.equipamento) p.push(`<span>${I.truck}${esc(at.equipamento)}</span>`);
    if (at.executor) p.push(`<span>${I.users}${esc(at.executor)}</span>`);
    if (at.volume_m3) p.push(`<span>${I.box}${esc(at.volume_m3)} m³</span>`);
    return p.length ? `<div class="at">${p.join('')}</div>` : '';
  }

  async function renderDetalhe(id) {
    const o = todas.find(x => x.id === id); const c = $('#detalhe');
    if (!o) { c.classList.add('oculto'); selecionada = null; return; }
    c.classList.remove('oculto'); c.innerHTML = '';
    const cab = el('div', 'detalhe-cab'); cab.style.setProperty('--sev', CONFIG.corSev(o.severidade)); cab.style.paddingLeft = '12px';
    cab.innerHTML = `<button class="fechar" id="btn-fechar" aria-label="Fechar">${I.close}</button>
      <div class="loc">${esc(o.rodovia)} · ${fmtKm(o.km)}</div>
      <div class="tipo">${esc(CONFIG.nomeTipo(o.tipo))}</div>
      <div class="badges">
        <span class="badge soft" style="--cor:${CONFIG.corStatus(o.status)}">${esc(CONFIG.nomeStatus(o.status))}</span>
        <span class="badge" style="--cor:${CONFIG.corSev(o.severidade)}">${esc(CONFIG.nomeSev(o.severidade))}</span>
        ${o.risco_colapso ? `<span class="badge" style="--cor:#dc2626">${I.alert}Risco de colapso</span>` : ''}</div>
      <div class="info-grid">
        <div><span>Sentido</span>${esc(CONFIG.nomeSentido(o.sentido))}</div><div><span>Pista afetada</span>${esc(CONFIG.nomePista(o.pista_afetada))}</div>
        <div><span>Município</span>${esc(o.municipio || '—')}</div><div><span>Trecho SRE</span>${esc(o.trecho || '—')}</div>
        <div><span>Registrado por</span>${esc(o.criado_por)}</div><div><span>Em</span>${fmtData(o.criado_em)}</div>
        <div><span>Coordenadas</span>${o.lat ? o.lat.toFixed(5) + ', ' + o.lng.toFixed(5) : '—'}</div>
        <div><span>Tempo em aberto</span>${horas(o.criado_em, o.resolvida_em || new Date().toISOString()).toFixed(0)} h</div>
        ${o.atendimento ? `<div><span>Equipamento</span>${esc(o.atendimento.equipamento || '—')}</div><div><span>Executor</span>${esc(o.atendimento.executor || '—')}</div>` : ''}
        ${o.atendimento && o.atendimento.volume_m3 ? `<div><span>Volume estimado</span>${esc(o.atendimento.volume_m3)} m³</div>` : ''}
        ${o.resolvida_em ? `<div><span>Resolvida em</span>${fmtData(o.resolvida_em)}</div>` : ''}
      </div>`;
    c.appendChild(cab);
    cab.querySelector('#btn-fechar').onclick = () => { selecionada = null; c.classList.add('oculto'); renderLista(); };
    if (o.lat) { const bm = el('button', 'btn sec bloco', I.pin + 'Ver no mapa'); bm.style.margin = '12px 0 0'; bm.onclick = () => verNoMapa(o.id); cab.appendChild(bm); }
    c.appendChild(el('div', 'secao-titulo', 'Histórico'));
    const t = el('div', 'timeline');
    for (const ev of o.historico) {
      const d = el('div', 'ev'); d.style.setProperty('--cor', CONFIG.corStatus(ev.status));
      d.innerHTML = `<div class="quando">${fmtData(ev.em)} · ${esc(ev.por)}</div><div class="oque">${esc(CONFIG.nomeStatus(ev.status))}</div>${ev.texto ? `<div class="texto">${esc(ev.texto)}</div>` : ''}${blocoAtendimento(ev.atendimento)}`;
      if (ev.fotos && ev.fotos.length) {
        const g = el('div', 'fotos-grid');
        for (const fid of ev.fotos) { const u = await STORE.fotoUrl(fid); if (!u) continue; const img = el('img', 'foto'); img.src = u; img.onclick = () => { const v = el('div', 'visualizador'); v.innerHTML = `<img src="${u}">`; v.onclick = () => v.remove(); document.body.appendChild(v); }; g.appendChild(img); }
        d.appendChild(g);
      }
      t.appendChild(d);
    }
    c.appendChild(t);
  }

  // ---------- modal genérico (centralizado) ----------
  let modalEl = null;
  function modal(titulo, build, largura) {
    fecharModal();
    modalEl = el('div', 'modal-fundo centro'); const m = el('div', 'modal');
    if (largura) m.style.maxWidth = largura;
    m.innerHTML = `<div class="cab"><h3>${esc(titulo)}</h3><button class="fechar-modal" aria-label="Fechar">${I.close}</button></div>`;
    m.querySelector('.fechar-modal').onclick = fecharModal;
    const corpo = el('div'); m.appendChild(corpo); modalEl.appendChild(m);
    modalEl.onclick = e => { if (e.target === modalEl) fecharModal(); };
    document.body.appendChild(modalEl); build(corpo, m);
  }
  function fecharModal() { if (modalEl) { modalEl.remove(); modalEl = null; } }
  function toast(msg, erro) { const t = el('div', 'toast' + (erro ? ' erro' : ''), esc(msg)); document.body.appendChild(t); setTimeout(() => t.remove(), 3500); }

  // ---------- minha senha ----------
  function modalSenha() {
    modal('Alterar minha senha', m => {
      m.innerHTML = `<div class="form-usuario" style="background:transparent;border:0;padding:0">
        <div class="campo"><label>Nova senha</label><input type="password" id="s-nova" autocomplete="new-password" minlength="6"></div>
        <div class="campo"><label>Repita a nova senha</label><input type="password" id="s-nova2" autocomplete="new-password"></div>
        <div class="msg" id="s-msg"></div>
        <button class="btn bloco" id="s-ok" style="margin-top:8px">${I.check}Salvar nova senha</button></div>`;
      m.querySelector('#s-ok').onclick = async () => {
        const a = m.querySelector('#s-nova').value, b = m.querySelector('#s-nova2').value, msg = m.querySelector('#s-msg');
        if (a.length < 6) { msg.className = 'msg erro'; msg.textContent = 'A senha precisa ter ao menos 6 caracteres.'; return; }
        if (a !== b) { msg.className = 'msg erro'; msg.textContent = 'As senhas não conferem.'; return; }
        try { await REMOTE.alterarSenha(a); fecharModal(); toast('Senha alterada'); }
        catch (e) { msg.className = 'msg erro'; msg.textContent = e.message; }
      };
    }, '420px');
  }

  // ---------- cadastro de usuários (gestor) ----------
  const PERFIS = [['tecnico', 'Técnico'], ['gestor', 'Gestor'], ['der', 'DER (leitura)']];
  const nomePerfil = p => (PERFIS.find(x => x[0] === p) || [p, p])[1];
  const corPerfil = p => ({ tecnico: '#2a63b0', gestor: '#10294d', der: '#6b7280' }[p] || '#888');
  function modalUsuarios() {
    modal('Usuários do sistema', async (m) => {
      m.innerHTML = `<div class="usuarios-grid"><div><table class="tabela"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th></th></tr></thead><tbody id="u-lista"><tr><td colspan="5">Carregando…</td></tr></tbody></table></div>
        <div class="form-usuario" id="u-form"></div></div>`;
      const lista = m.querySelector('#u-lista'), form = m.querySelector('#u-form');
      const eu = STORE.usuarioAtual();

      function formNovo() {
        form.innerHTML = `<div class="titulo-form">${I.userPlus} Novo usuário</div>
          <div class="campo"><label>Nome</label><input type="text" id="u-nome" placeholder="Nome completo"></div>
          <div class="campo"><label>E-mail</label><input type="email" id="u-email" autocomplete="off" placeholder="nome@empresa.com"></div>
          <div class="campo"><label>Senha inicial</label><input type="password" id="u-senha" autocomplete="new-password" minlength="6" placeholder="mín. 6 caracteres"></div>
          <div class="campo"><label>Perfil</label><select id="u-perfil">${PERFIS.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select></div>
          <button class="btn bloco" id="u-criar">${I.userPlus}Criar usuário</button>
          <div class="msg" id="u-msg"></div>
          <div style="font-size:12px;color:var(--muted);margin-top:10px">Informe a senha inicial ao usuário; ele pode trocá-la no menu do app.</div>`;
        form.querySelector('#u-criar').onclick = async () => {
          const nome = form.querySelector('#u-nome').value.trim(), email = form.querySelector('#u-email').value.trim().toLowerCase(), senha = form.querySelector('#u-senha').value, perfil = form.querySelector('#u-perfil').value;
          const msg = form.querySelector('#u-msg'); msg.className = 'msg';
          if (!nome || !email || senha.length < 6) { msg.className = 'msg erro'; msg.textContent = 'Preencha nome, e-mail e uma senha com ao menos 6 caracteres.'; return; }
          const b = form.querySelector('#u-criar'); b.disabled = true; msg.textContent = 'Criando…';
          try { await REMOTE.criarUsuario({ email, senha, nome, perfil }); msg.className = 'msg ok'; msg.textContent = `${nome} cadastrado como ${nomePerfil(perfil).toLowerCase()}.`; form.querySelector('#u-nome').value = form.querySelector('#u-email').value = form.querySelector('#u-senha').value = ''; carregar(); }
          catch (e) { msg.className = 'msg erro'; msg.textContent = e.message; }
          finally { b.disabled = false; }
        };
      }
      function formEditar(u) {
        form.innerHTML = `<div class="titulo-form">${I.edit} Editar usuário</div>
          <div class="campo"><label>Nome</label><input type="text" id="e-nome" value="${esc(u.nome)}"></div>
          <div class="campo"><label>E-mail</label><input type="text" value="${esc(u.email || '')}" disabled></div>
          <div class="campo"><label>Perfil</label><select id="e-perfil">${PERFIS.map(([v, n]) => `<option value="${v}" ${v === u.perfil ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <button class="btn bloco" id="e-salvar">${I.check}Salvar</button>
          <button class="btn sec bloco" id="e-cancelar" style="margin-top:8px">Cancelar</button>
          <div class="msg" id="e-msg"></div>`;
        form.querySelector('#e-cancelar').onclick = formNovo;
        form.querySelector('#e-salvar').onclick = async () => {
          const msg = form.querySelector('#e-msg');
          try { await REMOTE.atualizarUsuario(u.id, { nome: form.querySelector('#e-nome').value.trim(), perfil: form.querySelector('#e-perfil').value }); toast('Usuário atualizado'); formNovo(); carregar(); }
          catch (e) { msg.className = 'msg erro'; msg.textContent = e.message; }
        };
      }
      async function carregar() {
        let us = [];
        try { us = await REMOTE.listarUsuarios(); } catch (e) { lista.innerHTML = `<tr><td colspan="5" style="color:var(--red)">${esc(e.message)}</td></tr>`; return; }
        lista.innerHTML = '';
        for (const u of us) {
          const tr = el('tr', u.ativo ? '' : 'inativo');
          tr.innerHTML = `<td><b>${esc(u.nome)}</b>${u.id === eu.id ? ' <span style="color:var(--muted);font-size:11px">(você)</span>' : ''}</td><td>${esc(u.email || '—')}</td>
            <td><span class="badge perfil soft" style="--cor:${corPerfil(u.perfil)}">${esc(nomePerfil(u.perfil))}</span></td>
            <td>${u.ativo ? '<span class="badge soft" style="--cor:#16a34a">Ativo</span>' : '<span class="badge soft" style="--cor:#98a2b3">Inativo</span>'}</td>
            <td><div class="acoes-linha">
              <button title="Editar">${I.edit}</button>
              <button title="Enviar e-mail de redefinição de senha">${I.mail}</button>
              <button title="${u.ativo ? 'Desativar' : 'Ativar'}">${I.power}</button></div></td>`;
          const [bEd, bMail, bPow] = tr.querySelectorAll('button');
          bEd.onclick = () => formEditar(u);
          bMail.onclick = async () => { if (!u.email) return; if (!confirm(`Enviar e-mail de redefinição de senha para ${u.email}?`)) return; try { await REMOTE.enviarRedefinicao(u.email); toast('E-mail enviado'); } catch (e) { toast(e.message, true); } };
          bPow.onclick = async () => { try { await REMOTE.atualizarUsuario(u.id, { ativo: !u.ativo }); toast(u.ativo ? 'Usuário desativado' : 'Usuário ativado'); carregar(); } catch (e) { toast(e.message, true); } };
          lista.appendChild(tr);
        }
      }
      formNovo(); carregar();
    });
  }

  // ---------- relatório ----------
  $('#btn-pdf').onclick = async () => {
    const b = $('#btn-pdf'); b.disabled = true; b.innerHTML = I.file + 'Gerando…';
    try { await RELATORIO.gerar(visiveis, filtro); }
    catch (e) { alert('Erro ao gerar PDF: ' + e.message); }
    finally { b.disabled = false; b.innerHTML = I.file + 'Relatório PDF'; }
  };

  render();
})();
