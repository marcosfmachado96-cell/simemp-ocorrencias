// Camada de dados do SIMEMP Ocorrências.
// Tudo é gravado primeiro no IndexedDB do aparelho (funciona offline) e vai
// para uma fila de envio (outbox). Em MODO 'supabase', a fila é enviada ao
// servidor quando há conexão (js/remote.js) e as mudanças do servidor são
// trazidas para o cache local. Em MODO 'local' (protótipo) o próprio
// IndexedDB é o "servidor": os dados ficam só neste navegador.
window.STORE = (() => {
  const DB_NOME = 'simemp_ocorrencias', DB_VERSAO = 1;
  let db = null;
  const canal = ('BroadcastChannel' in window) ? new BroadcastChannel('simemp') : null;
  const ouvintes = [];

  function abrir() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NOME, DB_VERSAO);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('ocorrencias')) {
          const s = d.createObjectStore('ocorrencias', { keyPath: 'id' });
          s.createIndex('status', 'status');
        }
        if (!d.objectStoreNames.contains('fotos')) {
          const s = d.createObjectStore('fotos', { keyPath: 'id' });
          s.createIndex('oc_id', 'oc_id');
        }
        if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
      };
      req.onsuccess = e => { db = e.target.result; res(db); };
      req.onerror = e => rej(e.target.error);
    });
  }
  const tx = (nomes, modo = 'readonly') => db.transaction(nomes, modo);
  const p = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  async function getAll(store, idx, val) {
    const s = tx(store).objectStore(store);
    return p(idx ? s.index(idx).getAll(val) : s.getAll());
  }
  async function put(store, obj) { return p(tx(store, 'readwrite').objectStore(store).put(obj)); }
  async function get(store, k) { return p(tx(store).objectStore(store).get(k)); }
  async function del(store, k) { return p(tx(store, 'readwrite').objectStore(store).delete(k)); }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  const agora = () => new Date().toISOString();

  // ---------- usuário ----------
  function usuarioAtual() { try { return JSON.parse(localStorage.getItem('simemp_usuario')); } catch (e) { return null; } }
  function login(u) { localStorage.setItem('simemp_usuario', JSON.stringify(u)); }
  function logout() { localStorage.removeItem('simemp_usuario'); }

  // ---------- notificação de mudanças (painel em tempo real) ----------
  function notificar() { ouvintes.forEach(cb => cb()); if (canal) canal.postMessage('mudou'); }
  if (canal) canal.onmessage = () => ouvintes.forEach(cb => cb());
  function onChange(cb) { ouvintes.push(cb); }

  // ---------- fila de envio ----------
  async function enfileirar(op) {
    await put('outbox', { op, em: agora() });
    sincronizar(); // tenta na hora; se offline, fica na fila
  }
  let sincronizando = false, repetir = false;
  async function sincronizar() {
    if (!navigator.onLine) return;
    if (sincronizando) { repetir = true; return; } // chegou item durante o envio: roda de novo ao terminar
    sincronizando = true;
    try {
      do {
        repetir = false;
        if (CONFIG.MODO === 'local') {
          // no protótipo não há servidor: marca tudo como enviado
          const fila = await getAll('outbox');
          for (const item of fila) {
            const oc = await get('ocorrencias', item.op.oc_id);
            if (oc && oc.sync !== 'ok') { oc.sync = 'ok'; await put('ocorrencias', oc); }
            await del('outbox', item.seq);
          }
          if (fila.length) notificar();
        } else if (window.REMOTE) {
          await REMOTE.enviarFila();
          await REMOTE.trazer();
        }
      } while (repetir);
    } catch (e) { console.warn('sincronização', e); }
    finally { sincronizando = false; }
  }
  window.addEventListener('online', () => sincronizar());
  async function pendentes() { return (await getAll('outbox')).length; }
  async function fila() { return getAll('outbox'); }
  async function concluirItem(seq) { return del('outbox', seq); }

  // ---------- ocorrências ----------
  async function listar({ apenasAbertas = false } = {}) {
    let lista = await getAll('ocorrencias');
    if (apenasAbertas) lista = lista.filter(o => o.status !== 'resolvida');
    return lista.sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  }
  async function obter(id) { return get('ocorrencias', id); }

  async function salvarFotos(oc_id, fase, blobs) {
    const ids = [];
    for (const blob of blobs) {
      const id = uuid();
      await put('fotos', { id, oc_id, fase, blob, em: agora(), enviada: false });
      ids.push(id);
    }
    return ids;
  }

  async function criar(dados, fotosBlobs) {
    const u = usuarioAtual();
    const id = uuid();
    const fotos = await salvarFotos(id, 'abertura', fotosBlobs);
    const oc = Object.assign({
      id, criado_em: agora(), criado_por: u ? u.nome : '?', criado_por_id: u ? u.id : null,
      status: 'aberta', sync: 'pendente',
    }, dados, {
      atendimento: null, resolvida_em: null,
      historico: [{ em: agora(), por: u ? u.nome : '?', status: 'aberta', texto: dados.observacao || '', fotos }],
    });
    await put('ocorrencias', oc);
    // a fila guarda o estado inicial: eventos posteriores vão como 'atualizar', na ordem
    const { sync, ...linha } = oc;
    await enfileirar({ tipo: 'criar', oc_id: id, linha: JSON.parse(JSON.stringify(linha)) });
    notificar();
    return oc;
  }

  // Muda status e/ou registra avanço. Para 'resolvida' exige foto de comprovação.
  async function atualizar(id, { status, texto = '', atendimento = null, fotosBlobs = [] }) {
    const oc = await get('ocorrencias', id);
    if (!oc) throw new Error('Ocorrência não encontrada');
    if (status === 'resolvida' && !fotosBlobs.length) throw new Error('Foto de comprovação obrigatória para resolver.');
    const u = usuarioAtual();
    const fase = status === 'resolvida' ? 'comprovacao' : status === 'em_atendimento' ? 'atendimento' : 'acompanhamento';
    const fotos = await salvarFotos(id, fase, fotosBlobs);
    if (status) oc.status = status;
    if (atendimento) oc.atendimento = Object.assign({}, oc.atendimento || {}, atendimento);
    if (status === 'em_atendimento' && !(oc.atendimento && oc.atendimento.inicio_em)) {
      oc.atendimento = Object.assign({}, oc.atendimento || {}, { inicio_em: agora() });
    }
    if (status === 'resolvida') oc.resolvida_em = agora();
    const evento = { em: agora(), por: u ? u.nome : '?', status: oc.status, texto, fotos, atendimento: atendimento || undefined };
    oc.historico.push(evento);
    oc.sync = 'pendente';
    await put('ocorrencias', oc);
    await enfileirar({ tipo: 'atualizar', oc_id: id, evento, status: status || null, atendimento: oc.atendimento, resolvida_em: oc.resolvida_em });
    notificar();
    return oc;
  }

  async function fotosDe(oc_id) { return getAll('fotos', 'oc_id', oc_id); }
  async function foto(id) { return get('fotos', id); }
  const urls = new Map();
  async function fotoUrl(fotoId) {
    if (urls.has(fotoId)) return urls.get(fotoId);
    const f = await get('fotos', fotoId);
    if (!f) return null;
    const u = f.blob ? URL.createObjectURL(f.blob) : (f.url || null);
    if (u) urls.set(fotoId, u);
    return u;
  }

  // Recebe uma ocorrência vinda do servidor. Não sobrescreve mudança local ainda não enviada.
  async function receber(oc, fotosServidor) {
    const local = await get('ocorrencias', oc.id);
    if (local && local.sync === 'pendente') return false;
    await put('ocorrencias', Object.assign({}, oc, { sync: 'ok' }));
    for (const f of fotosServidor || []) {
      const existente = await get('fotos', f.id);
      if (!existente) await put('fotos', { id: f.id, oc_id: f.oc_id, fase: f.fase, em: f.em, url: f.url, enviada: true });
      else if (!existente.url) { existente.url = f.url; existente.enviada = true; await put('fotos', existente); }
    }
    return true;
  }
  async function marcarEnviada(oc_id) {
    const oc = await get('ocorrencias', oc_id);
    if (oc) { oc.sync = 'ok'; await put('ocorrencias', oc); }
  }

  async function limparTudo() {
    for (const s of ['ocorrencias', 'fotos', 'outbox']) await p(tx(s, 'readwrite').objectStore(s).clear());
    notificar();
  }
  async function meta(k, v) {
    if (v === undefined) { const r = await get('meta', k); return r && r.v; }
    await put('meta', { k, v });
  }

  async function init() {
    if (!db) await abrir();
    // ao trocar de modo (protótipo -> produção) o cache local é descartado
    const modoAnterior = await meta('modo');
    const restoDoPrototipo = CONFIG.MODO === 'supabase' && (await meta('seed'));
    if ((modoAnterior && modoAnterior !== CONFIG.MODO) || restoDoPrototipo) { await limparTudo(); await meta('seed', false); await meta('ultima_sync', null); }
    await meta('modo', CONFIG.MODO);
    return db;
  }

  return { init, uuid, usuarioAtual, login, logout, listar, obter, criar, atualizar, fotosDe, foto, fotoUrl,
           pendentes, fila, concluirItem, sincronizar, onChange, notificar, receber, marcarEnviada, limparTudo, meta, _put: put };
})();
