// Configuração geral do SIMEMP Ocorrências
// MODO 'local'    -> protótipo: dados ficam no navegador (IndexedDB), sem servidor
// MODO 'supabase' -> produção: dados no Supabase (preencher URL e chave)
window.CONFIG = {
  MODO: 'supabase',
  SUPABASE_URL: 'https://dsgtfrkyocevlywscpvu.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_yFe77x8yjIbmwXctUWt9Sw_uaUWmnHQ',
  VERSAO: '1.5.0',

  TIPOS: [
    { id: 'queda_barreira', nome: 'Queda de barreira' },
    { id: 'queda_arvore',   nome: 'Queda de árvore' },
    { id: 'bloqueio_pista', nome: 'Bloqueio de pista' },
    { id: 'erosao',         nome: 'Erosão' },
    { id: 'queda_pista',    nome: 'Queda de pista' },
    { id: 'outro',          nome: 'Outro' },
  ],
  SEVERIDADES: [
    { id: 'baixa',   nome: 'Baixa',   cor: '#16a34a' },
    { id: 'media',   nome: 'Média',   cor: '#d9a400' },
    { id: 'alta',    nome: 'Alta',    cor: '#ea580c' },
    { id: 'critica', nome: 'Crítica', cor: '#dc2626' },
  ],
  SENTIDOS: [
    { id: 'direita',  nome: 'Direita',  desc: 'sentido crescente do km' },
    { id: 'esquerda', nome: 'Esquerda', desc: 'sentido decrescente do km' },
    { id: 'ambos',    nome: 'Ambos',    desc: 'pista simples / os dois sentidos' },
  ],
  PISTA_AFETADA: [
    { id: 'acostamento',   nome: 'Acostamento' },
    { id: 'uma_faixa',     nome: '1 faixa' },
    { id: 'pista_total',   nome: 'Pista total' },
    { id: 'ambos_sentidos',nome: 'Ambos os sentidos' },
  ],
  STATUS: [
    { id: 'aberta',         nome: 'Aberta',         cor: '#dc2626' },
    { id: 'em_atendimento', nome: 'Em atendimento', cor: '#d97706' },
    { id: 'resolvida',      nome: 'Resolvida',      cor: '#16a34a' },
  ],
  // mapa base (OpenStreetMap, gratuito; o CSS dessatura os tiles para destacar as ocorrências)
  TILES: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  TILES_ATTR: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  // Usuários do protótipo (em produção vêm do Supabase Auth)
  USUARIOS_DEMO: [
    { id: 'u1', nome: 'Marcos Machado', perfil: 'gestor' },
    { id: 'u2', nome: 'Técnico A',       perfil: 'tecnico' },
    { id: 'u3', nome: 'Técnico B',       perfil: 'tecnico' },
    { id: 'u4', nome: 'Técnico C',       perfil: 'tecnico' },
    { id: 'u5', nome: 'DER-PR (leitura)', perfil: 'der' },
  ],
};
CONFIG.nomeTipo   = id => (CONFIG.TIPOS.find(t => t.id === id) || {}).nome || id;
CONFIG.nomeSev    = id => (CONFIG.SEVERIDADES.find(t => t.id === id) || {}).nome || id;
CONFIG.corSev     = id => (CONFIG.SEVERIDADES.find(t => t.id === id) || {}).cor || '#888';
CONFIG.nomeStatus = id => (CONFIG.STATUS.find(t => t.id === id) || {}).nome || id;
CONFIG.corStatus  = id => (CONFIG.STATUS.find(t => t.id === id) || {}).cor || '#888';
CONFIG.nomeSentido = id => {
  // aceita os valores antigos (crescente/decrescente) de registros já gravados
  const eq = { crescente: 'direita', decrescente: 'esquerda' };
  const v = eq[id] || id;
  return (CONFIG.SENTIDOS.find(t => t.id === v) || {}).nome || v || '—';
};
CONFIG.nomePista  = id => (CONFIG.PISTA_AFETADA.find(t => t.id === id) || {}).nome || id;
