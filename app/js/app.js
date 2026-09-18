// Interface do técnico (celular)
(async () => {
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtData = iso => { const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const fmtKm = km => 'km ' + Number(km).toFixed(2).replace('.', ',');
  const tempoAtras = iso => {
    const m = Math.round((Date.now() - new Date(iso)) / 6e4);
    if (m < 60) return `há ${m} min`; const h = Math.round(m / 60);
    if (h < 48) return `há ${h} h`; return `há ${Math.round(h / 24)} dias`;
  };
  function toast(msg, erro) {
    const t = el('div', 'toast' + (erro ? ' erro' : ''), esc(msg)); document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }
  const I = ICONS;

  // ícones estáticos
  $('#btn-voltar').innerHTML = I.back; $('#btn-menu').innerHTML = I.menu; $('#fab').innerHTML = I.plus;
  $('#gps-ico').outerHTML = I.pin; $('#colapso-ico').outerHTML = I.alert;
  $('#banner-instalar').innerHTML = `${I.zap}<div><b>Instale o app na tela inicial</b>Para funcionar sem sinal, use "Adicionar à Tela de Início" no menu do navegador.</div>`;
  $('#banner-demo').innerHTML = `${I.inbox}<div>Protótipo com dados fictícios. Os registros ficam apenas neste aparelho.</div>`;
  $('#login-versao').textContent = CONFIG.VERSAO;

  await STORE.init();
  try { await GEO.carregar('data/malha_leste.geojson'); } catch (e) { toast('Malha rodoviária não carregada', true); }

  // dados de demonstração
  if (CONFIG.MODO === 'local' && !(await STORE.meta('seed'))) {
    try { await SEED.gerar(28); } catch (e) { console.error(e); }
  }
  $('#banner-demo').classList.toggle('oculto', CONFIG.MODO !== 'local');

  // ---------- service worker ----------
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!standalone && /iPhone|iPad|Android/i.test(navigator.userAgent)) $('#banner-instalar').classList.remove('oculto');

  // ---------- rede ----------
  async function atualizarRede() {
    const chip = $('#chip-rede'); const pend = await STORE.pendentes();
    chip.classList.toggle('off', !navigator.onLine);
    chip.innerHTML = (navigator.onLine ? 'online' : 'offline') + (pend ? ` <span class="pend">${pend}</span>` : '');
  }
  window.addEventListener('online', atualizarRede); window.addEventListener('offline', atualizarRede);
  STORE.onChange(() => { atualizarRede(); if (telaAtual === 'lista') renderLista(); if (telaAtual === 'detalhe' && detalheId && !modalEl) renderDetalhe(detalheId); });

  // ---------- login ----------
  const SUPA = CONFIG.MODO === 'supabase';
  function usuario() { return STORE.usuarioAtual(); }
  function mostrarLogin() {
    $('#login-demo').classList.toggle('oculto', SUPA); $('#login-real').classList.toggle('oculto', !SUPA);
    if (!SUPA) {
      const sel = $('#login-usuario'); sel.innerHTML = '';
      CONFIG.USUARIOS_DEMO.forEach(u => sel.appendChild(el('option', null, `${esc(u.nome)} — ${u.perfil}`)).value = u.id);
    }
    $('#tela-login').classList.remove('oculto'); $('#app').classList.add('oculto');
  }
  $('#btn-entrar').onclick = () => {
    const u = CONFIG.USUARIOS_DEMO.find(x => x.id === $('#login-usuario').value);
    STORE.login(u); iniciar();
  };
  $('#login-real').onsubmit = async e => {
    e.preventDefault();
    const b = $('#btn-entrar-real'), erro = $('#login-erro'); b.disabled = true; erro.classList.add('oculto');
    try {
      await REMOTE.entrar($('#login-email').value.trim(), $('#login-senha').value);
      await REMOTE.iniciar(); iniciar();
    } catch (ex) { erro.textContent = ex.message; erro.classList.remove('oculto'); }
    finally { b.disabled = false; }
  };
  async function sair() { if (SUPA) await REMOTE.sair(); else STORE.logout(); mostrarLogin(); }
  function iniciar() {
    $('#tela-login').classList.add('oculto'); $('#app').classList.remove('oculto');
    $('#subtitulo').textContent = usuario().nome;
    ir('lista');
  }

  // ---------- menu ----------
  $('#btn-menu').onclick = () => {
    const itens = [
      [I.sync, 'Sincronizar agora', async () => { await STORE.sincronizar(); toast('Sincronização concluída'); }],
      [I.monitor, 'Abrir painel (computador)', () => window.open('painel.html', '_blank')],
    ];
    if (CONFIG.MODO === 'local') itens.push([I.refresh, 'Recriar dados fictícios', async () => { await STORE.limparTudo(); await SEED.gerar(28); toast('Dados recriados'); renderLista(); }]);
    itens.push([I.logout, 'Sair', sair]);
    modal('Menu', m => {
      itens.forEach(([ic, t, fn]) => { const b = el('button', 'btn sec bloco', ic + esc(t)); b.style.marginBottom = '8px'; b.onclick = () => { fecharModal(); fn(); }; m.appendChild(b); });
      m.appendChild(el('div', null, `<div style="text-align:center;font-size:12px;color:var(--muted-2);margin-top:6px">${esc(usuario().nome)} · v${CONFIG.VERSAO} · modo ${CONFIG.MODO}</div>`));
    });
  };

  // ---------- navegação ----------
  let telaAtual = 'lista', detalheId = null;
  function ir(tela, id) {
    telaAtual = tela; detalheId = id || null;
    ['lista', 'nova', 'detalhe'].forEach(t => $('#tela-' + t).classList.toggle('oculto', t !== tela));
    $('#btn-voltar').classList.toggle('oculto', tela === 'lista');
    $('#logo-topo').classList.toggle('oculto', tela !== 'lista');
    $('#fab').classList.toggle('oculto', tela !== 'lista' || usuario().perfil === 'der');
    $('#titulo').firstChild.textContent = tela === 'lista' ? 'SIMEMP Ocorrências' : tela === 'nova' ? 'Nova ocorrência' : 'Ocorrência';
    window.scrollTo(0, 0);
    if (tela === 'lista') renderLista();
    if (tela === 'nova') prepararNova();
    if (tela === 'detalhe') renderDetalhe(id);
  }
  $('#btn-voltar').onclick = () => ir('lista');
  $('#fab').onclick = () => ir('nova');

  // ---------- lista ----------
  async function renderLista() {
    const lista = await STORE.listar({ apenasAbertas: true });
    const c = $('#lista'); c.innerHTML = '';
    $('#cont-abertas').textContent = lista.length;
    if (!lista.length) { c.appendChild(el('div', 'vazio', `${I.checkCircle}<div>Nenhuma ocorrência em aberto.</div>`)); return; }
    for (const o of lista) c.appendChild(cardOc(o));
  }
  function cardOc(o) {
    const d = el('div', 'card oc');
    d.style.setProperty('--sev', CONFIG.corSev(o.severidade));
    d.innerHTML = `
      <div class="linha1"><span class="titulo">${esc(CONFIG.nomeTipo(o.tipo))}</span>
        <span class="badge soft" style="--cor:${CONFIG.corStatus(o.status)}">${esc(CONFIG.nomeStatus(o.status))}</span></div>
      <div class="local">${esc(o.rodovia)} · ${fmtKm(o.km)} · ${esc(o.sentido)}</div>
      <div class="meta">
        <span class="badge" style="--cor:${CONFIG.corSev(o.severidade)}">${esc(CONFIG.nomeSev(o.severidade))}</span>
        ${o.risco_colapso ? `<span class="aviso-colapso">${I.alert}risco de colapso</span>` : ''}
        <span>${tempoAtras(o.criado_em)}</span><span>${esc(o.criado_por)}</span>
        ${o.sync !== 'ok' ? `<span class="sync-pend">${I.sync}aguardando envio</span>` : ''}
      </div>`;
    d.onclick = () => ir('detalhe', o.id);
    return d;
  }

  // ---------- nova ocorrência ----------
  const form = { tipo: null, sev: null, pista: null, fotos: [], gps: null, loc: null };
  let watchId = null;
  function chips(cont, itens, campo, comCor) {
    cont.innerHTML = '';
    itens.forEach(it => {
      const b = el('button', null, esc(it.nome)); b.type = 'button';
      if (comCor) b.style.setProperty('--cor', it.cor);
      b.onclick = () => { form[campo] = it.id; [...cont.children].forEach(x => x.classList.remove('ativo')); b.classList.add('ativo'); };
      cont.appendChild(b);
    });
  }
  function gpsEstado(cls, msg) { $('#gps').className = 'gps ' + cls; $('#gps-status').textContent = msg; }
  function prepararNova() {
    form.tipo = form.sev = form.pista = null; form.fotos = []; form.gps = null; form.loc = null;
    chips($('#f-tipo'), CONFIG.TIPOS, 'tipo'); chips($('#f-sev'), CONFIG.SEVERIDADES, 'sev', true); chips($('#f-pista'), CONFIG.PISTA_AFETADA, 'pista');
    $('#f-colapso').checked = false; $('#f-colapso-wrap').classList.remove('on'); $('#f-obs').value = ''; $('#f-km').value = '';
    const selR = $('#f-rodovia'); selR.innerHTML = '<option value="">—</option>';
    GEO.rodovias().forEach(r => selR.appendChild(el('option', null, r)).value = r);
    renderFotosForm();
    // GPS
    gpsEstado('', 'Obtendo GPS…'); $('#gps-loc').textContent = '—'; $('#gps-coord').textContent = '';
    if (watchId) navigator.geolocation.clearWatch(watchId);
    if (!navigator.geolocation) { gpsEstado('erro', 'GPS indisponível — informe rodovia e km manualmente'); return; }
    watchId = navigator.geolocation.watchPosition(pos => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      form.gps = { lat, lng, precisao: Math.round(accuracy) };
      $('#gps-coord').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)} (±${Math.round(accuracy)} m)`;
      const loc = GEO.localizar(lat, lng);
      if (loc) {
        form.loc = loc;
        gpsEstado('ok', `Localizado na malha (${loc.distancia_m} m do eixo) — confira e ajuste se necessário`);
        $('#gps-loc').textContent = `${loc.rodovia} · ${fmtKm(loc.km)} · ${loc.sentido}${loc.municipio ? ' · ' + loc.municipio : ''}`;
        if (!$('#f-km').dataset.manual) { $('#f-rodovia').value = loc.rodovia; $('#f-km').value = loc.km.toFixed(2); $('#f-sentido').value = loc.sentido; }
      } else {
        gpsEstado('', 'Fora da malha da SR Leste / Médio Iguaçu / Xisto (>300 m) — informe rodovia e km');
        $('#gps-loc').textContent = '—';
      }
      if (accuracy < 25) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    }, err => {
      gpsEstado('erro', 'Sem GPS: ' + err.message + ' — informe rodovia e km');
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 });
  }
  $('#f-km').addEventListener('input', () => $('#f-km').dataset.manual = '1');
  $('#f-colapso').addEventListener('change', e => $('#f-colapso-wrap').classList.toggle('on', e.target.checked));

  // fotos do formulário
  let alvoFotos = null; // callback que recebe os blobs
  function renderFotosForm() { renderFotos($('#f-fotos'), form.fotos, i => { form.fotos.splice(i, 1); renderFotosForm(); }, () => pedirFotos(bl => { form.fotos.push(...bl); renderFotosForm(); })); }
  function renderFotos(cont, blobs, onRemove, onAdd) {
    cont.innerHTML = '';
    blobs.forEach((b, i) => {
      const w = el('div', 'foto-wrap'); const img = el('img', 'foto'); img.src = URL.createObjectURL(b); w.appendChild(img);
      const rm = el('button', 'rm', I.close); rm.type = 'button'; rm.onclick = () => onRemove(i); w.appendChild(rm); cont.appendChild(w);
    });
    const add = el('div', 'add', `${I.camera}<span>Foto</span>`); add.onclick = onAdd; cont.appendChild(add);
  }
  function pedirFotos(cb) { alvoFotos = cb; $('#input-foto').value = ''; $('#input-foto').click(); }
  $('#input-foto').addEventListener('change', async e => {
    const files = [...e.target.files]; if (!files.length) return;
    toast(`Comprimindo ${files.length} foto(s)…`);
    const blobs = []; for (const f of files) blobs.push(await FOTOS.comprimir(f));
    if (alvoFotos) alvoFotos(blobs);
  });

  $('#btn-salvar').onclick = async () => {
    const rodovia = $('#f-rodovia').value, km = parseFloat($('#f-km').value);
    if (!rodovia || isNaN(km)) return toast('Informe rodovia e km', true);
    if (!form.tipo) return toast('Selecione o tipo', true);
    if (!form.sev) return toast('Selecione a severidade', true);
    if (!form.pista) return toast('Selecione a pista afetada', true);
    if (!form.fotos.length) return toast('Tire ao menos 1 foto', true);
    const b = $('#btn-salvar'); b.disabled = true;
    try {
      await STORE.criar({
        lat: form.gps ? form.gps.lat : null, lng: form.gps ? form.gps.lng : null, precisao: form.gps ? form.gps.precisao : null,
        rodovia, km, sentido: $('#f-sentido').value,
        trecho: form.loc ? form.loc.trecho : null, municipio: form.loc ? form.loc.municipio : null,
        tipo: form.tipo, severidade: form.sev, pista_afetada: form.pista, risco_colapso: $('#f-colapso').checked,
        observacao: $('#f-obs').value.trim(),
      }, form.fotos);
      delete $('#f-km').dataset.manual;
      toast(navigator.onLine ? 'Ocorrência registrada' : 'Registrada offline — será enviada quando houver sinal');
      ir('lista');
    } catch (e) { toast(e.message, true); } finally { b.disabled = false; }
  };

  // ---------- detalhe ----------
  let mapaDet = null;
  function blocoAtendimento(at) {
    if (!at) return '';
    const p = [];
    if (at.equipamento) p.push(`<span>${I.truck}${esc(at.equipamento)}</span>`);
    if (at.executor) p.push(`<span>${I.users}${esc(at.executor)}</span>`);
    if (at.volume_m3) p.push(`<span>${I.box}${esc(at.volume_m3)} m³</span>`);
    return p.length ? `<div class="at">${p.join('')}</div>` : '';
  }
  async function renderDetalhe(id) {
    const o = await STORE.obter(id); if (!o) return ir('lista');
    const c = $('#tela-detalhe'); c.innerHTML = '';
    const cab = el('div', 'card detalhe-cab'); cab.style.setProperty('--sev', CONFIG.corSev(o.severidade));
    cab.innerHTML = `
      <div class="loc">${esc(o.rodovia)} · ${fmtKm(o.km)}</div>
      <div class="tipo">${esc(CONFIG.nomeTipo(o.tipo))}</div>
      <div class="badges">
        <span class="badge soft" style="--cor:${CONFIG.corStatus(o.status)}">${esc(CONFIG.nomeStatus(o.status))}</span>
        <span class="badge" style="--cor:${CONFIG.corSev(o.severidade)}">${esc(CONFIG.nomeSev(o.severidade))}</span>
        ${o.risco_colapso ? `<span class="badge" style="--cor:#dc2626">${I.alert}Risco de colapso</span>` : ''}
        ${o.sync !== 'ok' ? `<span class="badge outline" style="--cor:#ea580c">${I.sync}aguardando envio</span>` : ''}
      </div>
      <div class="info-grid">
        <div><span>Sentido</span>${esc(o.sentido)}</div><div><span>Pista afetada</span>${esc(CONFIG.nomePista(o.pista_afetada))}</div>
        <div><span>Município</span>${esc(o.municipio || '—')}</div><div><span>Trecho SRE</span>${esc(o.trecho || '—')}</div>
        <div><span>Registrado por</span>${esc(o.criado_por)}</div><div><span>Em</span>${fmtData(o.criado_em)}</div>
        ${o.atendimento ? `<div><span>Equipamento</span>${esc(o.atendimento.equipamento || '—')}</div><div><span>Executor</span>${esc(o.atendimento.executor || '—')}</div>` : ''}
        ${o.atendimento && o.atendimento.volume_m3 ? `<div><span>Volume estimado</span>${esc(o.atendimento.volume_m3)} m³</div>` : ''}
        ${o.resolvida_em ? `<div><span>Resolvida em</span>${fmtData(o.resolvida_em)}</div>` : ''}
      </div>
      <div id="mapa-detalhe"></div>`;
    c.appendChild(cab);

    // ações
    const perfil = usuario().perfil;
    if (perfil !== 'der' && o.status !== 'resolvida') {
      const ac = el('div', 'acoes');
      if (o.status === 'aberta') { const b = el('button', 'btn amarelo bloco', I.play + 'Iniciar atendimento'); b.onclick = () => formAtendimento(o, 'em_atendimento'); ac.appendChild(b); }
      if (o.status === 'em_atendimento') { const b = el('button', 'btn sec bloco', I.plus + 'Registrar avanço'); b.onclick = () => formAtendimento(o, null); ac.appendChild(b); }
      const r = el('button', 'btn verde bloco', I.check + 'Resolver com foto de comprovação'); r.onclick = () => formAtendimento(o, 'resolvida'); ac.appendChild(r);
      c.appendChild(ac);
    }

    // linha do tempo
    const tl = el('div', 'card'); tl.innerHTML = '<div class="secao-titulo">Histórico</div>';
    const t = el('div', 'timeline');
    for (const ev of o.historico) {
      const d = el('div', 'ev'); d.style.setProperty('--cor', CONFIG.corStatus(ev.status));
      d.innerHTML = `<div class="quando">${fmtData(ev.em)} · ${esc(ev.por)}</div><div class="oque">${esc(CONFIG.nomeStatus(ev.status))}</div>${ev.texto ? `<div class="texto">${esc(ev.texto)}</div>` : ''}${blocoAtendimento(ev.atendimento)}`;
      if (ev.fotos && ev.fotos.length) {
        const g = el('div', 'fotos-grid');
        for (const fid of ev.fotos) { const u = await STORE.fotoUrl(fid); if (!u) continue; const img = el('img', 'foto'); img.src = u; img.onclick = () => verFoto(u); g.appendChild(img); }
        d.appendChild(g);
      }
      t.appendChild(d);
    }
    tl.appendChild(t); c.appendChild(tl);

    // mapa
    if (o.lat && window.L) {
      setTimeout(() => {
        mapaDet = L.map('mapa-detalhe', { zoomControl: false, attributionControl: false }).setView([o.lat, o.lng], 14);
        L.tileLayer(CONFIG.TILES, { maxZoom: 19 }).addTo(mapaDet);
        L.circleMarker([o.lat, o.lng], { radius: 9, color: '#fff', weight: 2.5, fillColor: CONFIG.corSev(o.severidade), fillOpacity: 1 }).addTo(mapaDet);
      }, 50);
    } else $('#mapa-detalhe').remove();
  }
  function verFoto(u) { const v = el('div', 'visualizador'); v.innerHTML = `<img src="${u}">`; v.onclick = () => v.remove(); document.body.appendChild(v); }

  // formulário de atendimento / avanço / resolução
  function formAtendimento(o, novoStatus) {
    const titulo = novoStatus === 'em_atendimento' ? 'Iniciar atendimento' : novoStatus === 'resolvida' ? 'Resolver ocorrência' : 'Registrar avanço';
    const fotos = [];
    modal(titulo, m => {
      const at = o.atendimento || {};
      const mostrarAt = novoStatus !== 'resolvida' || !o.atendimento;
      m.innerHTML = `
        ${mostrarAt ? `
        <div class="campo"><label>Equipamento atuando</label><input type="text" id="a-equip" value="${esc(at.equipamento || '')}" placeholder="Ex.: escavadeira hidráulica, caminhão basculante"></div>
        <div class="campo"><label>Quem está realizando</label><input type="text" id="a-exec" value="${esc(at.executor || '')}" placeholder="Equipe / empresa"></div>
        ${o.tipo === 'queda_barreira' ? `<div class="campo"><label>Volume estimado (m³)</label><input type="number" id="a-vol" inputmode="decimal" value="${esc(at.volume_m3 || '')}"></div>` : ''}` : ''}
        <div class="campo"><label>Descrição</label><textarea id="a-texto" placeholder="${novoStatus === 'resolvida' ? 'Ex.: pista liberada, material removido' : 'Situação atual'}"></textarea></div>
        <div class="campo"><div class="rotulo">${novoStatus === 'resolvida' ? 'Fotos de comprovação (obrigatório)' : 'Fotos (opcional)'}</div><div class="fotos-grid" id="a-fotos"></div></div>
        <button class="btn bloco ${novoStatus === 'resolvida' ? 'verde' : ''}" id="a-ok">${novoStatus === 'resolvida' ? I.check + 'Confirmar resolução' : 'Salvar'}</button>`;
      const rf = () => renderFotos(m.querySelector('#a-fotos'), fotos, i => { fotos.splice(i, 1); rf(); }, () => pedirFotos(bl => { fotos.push(...bl); rf(); }));
      rf();
      m.querySelector('#a-ok').onclick = async () => {
        const atd = mostrarAt ? { equipamento: m.querySelector('#a-equip').value.trim(), executor: m.querySelector('#a-exec').value.trim() } : null;
        if (atd && m.querySelector('#a-vol')) atd.volume_m3 = parseFloat(m.querySelector('#a-vol').value) || null;
        if (atd && !atd.equipamento && !atd.executor && !atd.volume_m3) { if (novoStatus === 'em_atendimento') return toast('Informe ao menos equipamento ou executor', true); }
        try {
          await STORE.atualizar(o.id, { status: novoStatus, texto: m.querySelector('#a-texto').value.trim(), atendimento: atd, fotosBlobs: fotos });
          fecharModal(); toast('Registrado'); if (novoStatus === 'resolvida') ir('lista'); else renderDetalhe(o.id);
        } catch (e) { toast(e.message, true); }
      };
    });
  }

  // ---------- modal ----------
  let modalEl = null;
  function modal(titulo, build) {
    fecharModal();
    modalEl = el('div', 'modal-fundo'); const m = el('div', 'modal'); m.innerHTML = `<h3>${esc(titulo)}</h3>`;
    const corpo = el('div'); m.appendChild(corpo); modalEl.appendChild(m);
    modalEl.onclick = e => { if (e.target === modalEl) fecharModal(); };
    document.body.appendChild(modalEl); build(corpo);
  }
  function fecharModal() { if (modalEl) { modalEl.remove(); modalEl = null; } }

  // ---------- início ----------
  atualizarRede();
  if (SUPA) {
    let u = null;
    try { u = await REMOTE.iniciar(); } catch (ex) { console.warn(ex); }
    if (u) iniciar(); else mostrarLogin();
  } else if (usuario()) iniciar(); else mostrarLogin();
})();
