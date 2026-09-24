// Tratamento das fotos: compressão no aparelho (~1280 px, JPEG 0.72 -> ~120-250 KB)
// e carimbo com data/hora, local e coordenadas gravado na própria imagem.
window.FOTOS = {
  async comprimir(file, maxLado = 1280, qualidade = 0.72) {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return file;
    const esc = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * esc); c.height = Math.round(bmp.height * esc);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(b => res(b || file), 'image/jpeg', qualidade));
  },

  // Grava na imagem um bloco com as informações da ocorrência, no canto inferior direito.
  // linhas: array de arrays de texto (cada array interna é uma linha, os itens são separados por ·)
  async carimbar(blob, linhas) {
    const bmp = await createImageBitmap(blob).catch(() => null);
    if (!bmp) return blob;
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);

    const textos = linhas.map(l => (Array.isArray(l) ? l.filter(Boolean).join('  ·  ') : l)).filter(Boolean);
    if (!textos.length) return blob;

    const base = Math.min(c.width, c.height);
    const margem = Math.round(base * 0.025);
    const fam = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const fonteDe = t => (t.destaque ? '600 ' + t.tam : '400 ' + t.tam) + 'px ' + fam;

    // ajusta o tamanho da fonte para o bloco caber na largura disponível
    let fonte = Math.max(11, Math.round(base * 0.030));
    let itens, larguraTexto, pad;
    for (let tentativa = 0; tentativa < 8; tentativa++) {
      pad = Math.round(fonte * 0.75);
      itens = textos.map((t, i) => ({ texto: t, destaque: i === 0, tam: i === 0 ? Math.round(fonte * 1.14) : fonte }));
      larguraTexto = Math.max(...itens.map(t => { g.font = fonteDe(t); return g.measureText(t.texto).width; }));
      if (larguraTexto + pad * 2 <= c.width - margem * 2 || fonte <= 11) break;
      fonte = Math.round(fonte * 0.9);
    }
    const alturaLinha = Math.round(fonte * 1.45);
    const largura = larguraTexto + pad * 2;
    const altura = alturaLinha * itens.length + pad * 1.7;
    const x = c.width - margem - largura;
    const y = c.height - margem - altura;
    const raio = Math.round(fonte * 0.45);

    // caixa escura translúcida, com filete âmbar à esquerda
    g.fillStyle = 'rgba(11,31,58,0.74)';
    if (g.roundRect) { g.beginPath(); g.roundRect(x, y, largura, altura, raio); g.fill(); }
    else g.fillRect(x, y, largura, altura);
    g.fillStyle = '#f2a900';
    g.fillRect(x, y + raio, Math.max(2, Math.round(base * 0.005)), altura - raio * 2);

    g.textAlign = 'right'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = Math.round(fonte * 0.3);
    itens.forEach((t, i) => {
      g.font = fonteDe(t);
      g.fillStyle = t.destaque ? '#ffffff' : 'rgba(255,255,255,.90)';
      g.fillText(t.texto, x + largura - pad, y + pad * 0.85 + alturaLinha * i + alturaLinha / 2);
    });
    g.shadowBlur = 0;

    // selo do sistema no canto superior direito
    g.font = '600 ' + Math.round(fonte * 0.82) + 'px ' + fam;
    const selo = 'SIMEMP', largSelo = g.measureText(selo).width + pad * 1.4, altSelo = Math.round(fonte * 1.75);
    g.fillStyle = 'rgba(11,31,58,.6)';
    if (g.roundRect) { g.beginPath(); g.roundRect(c.width - margem - largSelo, margem, largSelo, altSelo, raio * 0.7); g.fill(); }
    else g.fillRect(c.width - margem - largSelo, margem, largSelo, altSelo);
    g.fillStyle = 'rgba(255,255,255,.95)';
    g.fillText(selo, c.width - margem - pad * 0.7, margem + altSelo / 2);

    return new Promise(res => c.toBlob(b => res(b || blob), 'image/jpeg', 0.78));
  },

  // Monta as linhas do carimbo a partir dos dados da ocorrência
  linhasCarimbo({ em, rodovia, km, sentido, municipio, lat, lng, precisao }) {
    const d = new Date(em || Date.now());
    const dataHora = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const local = rodovia ? `${rodovia} km ${Number(km).toFixed(2).replace('.', ',')}${sentido ? ' · ' + (CONFIG.nomeSentido ? CONFIG.nomeSentido(sentido) : sentido) : ''}` : '';
    const coord = (lat != null && lng != null) ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}${precisao ? ` (±${precisao} m)` : ''}` : 'sem GPS';
    return [[dataHora, local], [municipio || null, coord]];
  },

  // Foto fictícia para o protótipo (canvas com texto)
  fake(texto, cor = '#6b7280') {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480;
    const g = c.getContext('2d');
    g.fillStyle = cor; g.fillRect(0, 0, 640, 480);
    g.fillStyle = 'rgba(255,255,255,.15)';
    for (let i = 0; i < 12; i++) g.fillRect(Math.random() * 640, Math.random() * 480, 80 + Math.random() * 160, 40 + Math.random() * 120);
    g.fillStyle = '#fff'; g.font = 'bold 28px sans-serif'; g.textAlign = 'center';
    g.fillText(texto, 320, 230); g.font = '18px sans-serif'; g.fillText('foto fictícia — protótipo', 320, 270);
    return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.7));
  },
};
