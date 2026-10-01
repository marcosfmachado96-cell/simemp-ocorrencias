// Relevo: curvas de nível, declividade e consulta de altitude.
// A grade de altitude (altitude.bin) é baixada só quando necessária.
window.RELEVO = (() => {
  let areas = [];
  const grades = new Map();   // id -> { dados, largura, altura, celula, ... }

  async function carregar() {
    try { areas = await (await fetch('data/relevo.json')).json(); } catch (e) { areas = []; }
    if (areas.length && window.proj4) {
      proj4.defs('EPSG:31982', '+proj=utm +zone=22 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
    }
    return areas;
  }

  function areaDe(lat, lng) {
    return areas.find(a => {
      const l = a.grade && a.grade.limites;
      return l && lat >= l[0][0] && lat <= l[1][0] && lng >= l[0][1] && lng <= l[1][1];
    });
  }

  async function grade(area) {
    if (grades.has(area.id)) return grades.get(area.id);
    const r = await fetch(area.grade.arquivo);
    if (!r.ok) throw new Error('grade de altitude indisponível');
    const g = Object.assign({}, area.grade, { dados: new Float32Array(await r.arrayBuffer()) });
    grades.set(area.id, g);
    return g;
  }

  function altitudeEm(g, col, row) {
    if (col < 0 || row < 0 || col >= g.largura || row >= g.altura) return NaN;
    const v = g.dados[row * g.largura + col];
    return v <= g.sem_dado + 1 ? NaN : v;
  }

  // Devolve { altitude, declividade, area } ou null se o ponto não tem modelo de relevo
  async function consultar(lat, lng) {
    const area = areaDe(lat, lng);
    if (!area || !window.proj4) return null;
    const g = await grade(area);
    const [x, y] = proj4('EPSG:4326', 'EPSG:31982', [lng, lat]);
    const col = Math.round((x - g.utm_minx) / g.celula - 0.5);
    const row = Math.round((g.utm_maxy - y) / g.celula - 0.5);
    const alt = altitudeEm(g, col, row);
    if (!isFinite(alt)) return { area, altitude: NaN, declividade: NaN };
    // declividade pelo gradiente central (passo de 2 células para suavizar)
    const p = 2;
    const [xe, xd] = [altitudeEm(g, col - p, row), altitudeEm(g, col + p, row)];
    const [yn, ys] = [altitudeEm(g, col, row - p), altitudeEm(g, col, row + p)];
    const dx = (isFinite(xe) && isFinite(xd)) ? (xd - xe) / (2 * p * g.celula)
      : (isFinite(xd) ? (xd - alt) / (p * g.celula) : (isFinite(xe) ? (alt - xe) / (p * g.celula) : NaN));
    const dy = (isFinite(yn) && isFinite(ys)) ? (ys - yn) / (2 * p * g.celula)
      : (isFinite(ys) ? (ys - alt) / (p * g.celula) : (isFinite(yn) ? (alt - yn) / (p * g.celula) : NaN));
    const decl = (isFinite(dx) && isFinite(dy)) ? Math.atan(Math.hypot(dx, dy)) * 180 / Math.PI : NaN;
    return { area, altitude: alt, declividade: decl };
  }

  const lista = () => areas;
  return { carregar, lista, consultar, areaDe };
})();
