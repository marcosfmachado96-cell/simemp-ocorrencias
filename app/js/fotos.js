// Compressão de fotos no aparelho antes de gravar (~1280 px, JPEG 0.72 -> ~120-250 KB)
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
