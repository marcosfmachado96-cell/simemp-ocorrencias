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

  // Grava na imagem uma tarja com as informações da ocorrência.
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
    const fonte = Math.max(11, Math.round(base * 0.030));      // corpo do texto
    const fonteT = Math.round(fonte * 1.16);                   // primeira linha (destaque)
    const pad = Math.round(fonte * 0.62);
    const alturaLinha = Math.round(fonte * 1.42);
    const alturaTarja = pad * 2 + alturaLinha * textos.length;
    const y0 = c.height - alturaTarja;

    // tarja escura com leve degradê para o texto não brigar com a imagem
    const grad = g.createLinearGradient(0, y0 - alturaLinha * 0.5, 0, c.height);
    grad.addColorStop(0, 'rgba(11,31,58,0)');
    grad.addColorStop(0.35, 'rgba(11,31,58,0.62)');
    grad.addColorStop(1, 'rgba(11,31,58,0.82)');
    g.fillStyle = grad;
    g.fillRect(0, y0 - alturaLinha * 0.5, c.width, alturaTarja + alturaLinha * 0.5);
    // filete âmbar no topo da tarja
    g.fillStyle = '#f2a900';
    g.fillRect(0, y0, c.width, Math.max(2, Math.round(base * 0.004)));

    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = Math.round(fonte * 0.35);
    textos.forEach((t, i) => {
      g.font = (i === 0 ? '600 ' + fonteT : '400 ' + fonte) + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      g.fillStyle = i === 0 ? '#ffffff' : 'rgba(255,255,255,.92)';
      g.fillText(t, pad * 1.4, y0 + pad + alturaLinha * i + alturaLinha / 2);
    });
    g.shadowBlur = 0;

    // selo do sistema no canto superior direito
    g.font = '600 ' + Math.round(fonte * 0.82) + 'px system-ui, sans-serif';
    g.textAlign = 'right';
    const selo = 'SIMEMP', larg = g.measureText(selo).width + pad * 1.6, alt = fonte * 1.7;
    g.fillStyle = 'rgba(11,31,58,.6)';
    g.fillRect(c.width - larg - pad, pad, larg, alt);
    g.fillStyle = 'rgba(255,255,255,.95)';
    g.fillText(selo, c.width - pad * 1.8, pad + alt / 2);

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
