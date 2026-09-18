// Localização na malha rodoviária: dado um ponto GPS, encontra o trecho
// mais próximo e interpola o km oficial (Km_Inicial -> Km_Final do SRE-PR).
window.GEO = (() => {
  let malha = null;      // FeatureCollection
  let segs = [];         // índice de segmentos projetados

  // projeção equiretangular local (metros) — suficiente para distâncias curtas
  const R = 6371000;
  function proj(lon, lat, lat0) {
    const k = Math.PI / 180;
    return [R * lon * k * Math.cos(lat0 * k), R * lat * k];
  }

  async function carregar(url) {
    const r = await fetch(url);
    malha = await r.json();
    segs = [];
    for (const f of malha.features) {
      const c = f.geometry.coordinates;
      const lat0 = c[0][1];
      const pts = c.map(([lon, lat]) => proj(lon, lat, lat0));
      // comprimento acumulado por vértice
      const acum = [0];
      for (let i = 1; i < pts.length; i++) {
        acum.push(acum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      }
      // acessos/contornos (código 'A' no trecho) ficam em desvantagem no empate com o eixo principal
      const penal = (f.properties.trecho || '').charAt(3) === 'A' ? 20 : 0;
      segs.push({ f, pts, acum, lat0, total: acum[acum.length - 1], penal });
    }
    return malha;
  }

  // Retorna { rodovia, km, sentido, trecho, municipio, distancia_m, ... } ou null
  function localizar(lat, lon, raioMax = 300) {
    if (!segs.length) return null;
    let melhor = null;
    for (const s of segs) {
      const [px, py] = proj(lon, lat, s.lat0);
      const pts = s.pts;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
        if (!melhor || d + s.penal < melhor.d + melhor.s.penal) melhor = { d, s, i, t };
      }
    }
    if (!melhor || melhor.d > raioMax) return null;
    const { s, i, t, d } = melhor;
    const dist = s.acum[i - 1] + t * (s.acum[i] - s.acum[i - 1]);
    const p = s.f.properties;
    const frac = s.total ? dist / s.total : 0;
    const km = p.km_ini + frac * (p.km_fim - p.km_ini);
    return {
      rodovia: p.rod, km: Math.round(km * 100) / 100, sentido: p.sentido,
      trecho: p.trecho, municipio: p.municipio || '', pista: p.pista || '',
      km_ini: p.km_ini, km_fim: p.km_fim, distancia_m: Math.round(d),
    };
  }

  function rodovias() {
    return [...new Set(segs.map(s => s.f.properties.rod))].sort();
  }
  function getMalha() { return malha; }

  return { carregar, localizar, rodovias, getMalha };
})();
