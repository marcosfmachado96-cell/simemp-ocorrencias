// Relatório PDF simples e objetivo (gerado no navegador, sem servidor)
window.RELATORIO = (() => {
  const fmtData = iso => { const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const fmtDia = iso => new Date(iso + (iso.length === 10 ? 'T12:00' : '')).toLocaleDateString('pt-BR');
  const horas = (a, b) => (new Date(b) - new Date(a)) / 36e5;
  const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));

  // desenha a malha + ocorrências num canvas
  function mapaCanvas(ocs, w = 1400, h = 900) {
    const malha = GEO.getMalha();
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    let minLon = 999, maxLon = -999, minLat = 999, maxLat = -999;
    const pts = ocs.filter(o => o.lat);
    const fonte = pts.length >= 2 ? pts.map(o => [o.lng, o.lat]) : malha.features.flatMap(f => f.geometry.coordinates);
    for (const [lon, lat] of fonte) { minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon); minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat); }
    const mLon = (maxLon - minLon) * 0.12 + 0.02, mLat = (maxLat - minLat) * 0.12 + 0.02;
    minLon -= mLon; maxLon += mLon; minLat -= mLat; maxLat += mLat;
    const k = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
    const esc = Math.min(w / ((maxLon - minLon) * k), h / (maxLat - minLat));
    const ox = (w - (maxLon - minLon) * k * esc) / 2, oy = (h - (maxLat - minLat) * esc) / 2;
    const X = lon => ox + (lon - minLon) * k * esc, Y = lat => h - oy - (lat - minLat) * esc;
    g.lineWidth = 1.6; g.strokeStyle = '#7f95b3';
    for (const f of malha.features) {
      g.beginPath(); f.geometry.coordinates.forEach(([lon, lat], i) => i ? g.lineTo(X(lon), Y(lat)) : g.moveTo(X(lon), Y(lat))); g.stroke();
    }
    // rótulos de rodovia (um por rodovia, no meio do trecho mais longo)
    g.font = 'bold 15px sans-serif'; g.fillStyle = '#3b4a5e'; g.textAlign = 'center';
    const porRod = {};
    for (const f of malha.features) { const r = f.properties.rod; if (!porRod[r] || f.geometry.coordinates.length > porRod[r].geometry.coordinates.length) porRod[r] = f; }
    for (const r in porRod) { const cs = porRod[r].geometry.coordinates; const [lon, lat] = cs[Math.floor(cs.length / 2)]; const x = X(lon), y = Y(lat); if (x > 0 && x < w && y > 0 && y < h) g.fillText(r, x, y - 6); }
    for (const o of pts) {
      const x = X(o.lng), y = Y(o.lat), r = o.severidade === 'critica' ? 11 : 8;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = CONFIG.corSev(o.severidade); g.fill();
      g.lineWidth = 3; g.strokeStyle = CONFIG.corStatus(o.status); g.stroke();
      if (o.risco_colapso) { g.lineWidth = 2; g.strokeStyle = '#000'; g.beginPath(); g.arc(x, y, r + 4, 0, Math.PI * 2); g.stroke(); }
    }
    return c.toDataURL('image/jpeg', 0.85);
  }

  async function blobParaDataUrl(blob) { return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); }); }

  async function gerar(ocs, filtro) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 14;
    const u = STORE.usuarioAtual();
    const incluirFotos = ocs.length <= 60 && confirm('Incluir fotos (abertura e comprovação) no relatório?');

    // ---- cabeçalho ----
    doc.setFillColor(16, 41, 77); doc.rect(0, 0, W, 26, 'F');
    doc.setTextColor(255); doc.setFontSize(17); doc.setFont(undefined, 'bold'); doc.text('SIMEMP Ocorrências — Relatório', M, 11);
    doc.setFontSize(10); doc.setFont(undefined, 'normal');
    const periodo = filtro.escopo === 'abertas' ? 'Ocorrências em aberto (situação atual)' : `Período: ${fmtDia(filtro.de)} a ${fmtDia(filtro.ate)}`;
    doc.text(`Superintendência Regional Leste — DER-PR · ${periodo}`, M, 18);
    doc.text(`Gerado em ${fmtData(new Date().toISOString())} por ${u ? u.nome : '—'}`, M, 23);
    doc.setTextColor(30);
    const filtros = [filtro.rod && 'Rodovia: ' + filtro.rod, filtro.status && 'Status: ' + CONFIG.nomeStatus(filtro.status), filtro.sev && 'Severidade: ' + CONFIG.nomeSev(filtro.sev), filtro.tipo && 'Tipo: ' + CONFIG.nomeTipo(filtro.tipo), filtro.colapso && 'Somente com risco de colapso'].filter(Boolean);
    let y = 33;
    if (filtros.length) { doc.setFontSize(9); doc.setTextColor(100); doc.text('Filtros: ' + filtros.join(' · '), M, y); doc.setTextColor(30); y += 6; }

    // ---- indicadores ----
    const abertas = ocs.filter(o => o.status === 'aberta').length, emAt = ocs.filter(o => o.status === 'em_atendimento').length, res = ocs.filter(o => o.status === 'resolvida');
    const crit = ocs.filter(o => o.severidade === 'critica' && o.status !== 'resolvida').length, colapso = ocs.filter(o => o.risco_colapso && o.status !== 'resolvida').length;
    const tm = res.filter(o => o.resolvida_em).length ? res.filter(o => o.resolvida_em).reduce((s, o) => s + horas(o.criado_em, o.resolvida_em), 0) / res.filter(o => o.resolvida_em).length : null;
    const kpis = [['Total', ocs.length], ['Abertas', abertas], ['Em atendimento', emAt], ['Resolvidas', res.length], ['Críticas abertas', crit], ['Risco colapso', colapso], ['T. médio resol.', tm ? tm.toFixed(0) + ' h' : '—']];
    const bw = (W - 2 * M - 6 * 2) / 7;
    kpis.forEach(([t, v], i) => {
      const x = M + i * (bw + 2);
      doc.setFillColor(i === 4 && crit || i === 5 && colapso ? 250 : 238, i === 4 && crit || i === 5 && colapso ? 226 : 241, i === 4 && crit || i === 5 && colapso ? 226 : 245);
      doc.roundedRect(x, y, bw, 16, 2, 2, 'F');
      doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text(String(v), x + bw / 2, y + 8, { align: 'center' });
      doc.setFontSize(6.5); doc.setFont(undefined, 'normal'); doc.text(t.toUpperCase(), x + bw / 2, y + 13, { align: 'center' });
    });
    y += 22;

    // ---- mapa ----
    const img = mapaCanvas(ocs); const mh = (W - 2 * M) * 900 / 1400;
    doc.setDrawColor(200); doc.rect(M, y, W - 2 * M, mh); doc.addImage(img, 'JPEG', M, y, W - 2 * M, mh);
    y += mh + 3;
    doc.setFontSize(7); doc.setTextColor(90);
    // legenda em duas linhas, com larguras medidas para não sair da página
    let lx = M; const ly = y + 1.2;
    const item = (txt, desenha) => { desenha(lx + 1.5, ly); doc.text(txt, lx + 4, ly + 0.8); lx += doc.getTextWidth(txt) + 8; };
    doc.text('Severidade:', lx, ly + 0.8); lx += doc.getTextWidth('Severidade:') + 2;
    CONFIG.SEVERIDADES.forEach(s => { const [r, g, b] = hex(s.cor); item(s.nome, (x, yy) => { doc.setFillColor(r, g, b); doc.circle(x, yy, 1.5, 'F'); }); });
    lx = M; y += 5;
    const ly2 = y + 1.2;
    const item2 = (txt, desenha) => { desenha(lx + 1.5, ly2); doc.text(txt, lx + 4, ly2 + 0.8); lx += doc.getTextWidth(txt) + 8; };
    doc.text('Status (borda):', lx, ly2 + 0.8); lx += doc.getTextWidth('Status (borda):') + 2;
    CONFIG.STATUS.forEach(s => { const [r, g, b] = hex(s.cor); item2(s.nome, (x, yy) => { doc.setDrawColor(r, g, b); doc.setLineWidth(.8); doc.setFillColor(255); doc.circle(x, yy, 1.5, 'FD'); }); });
    item2('Anel preto: risco de colapso', (x, yy) => { doc.setDrawColor(0); doc.setLineWidth(.5); doc.circle(x, yy, 2.2, 'D'); });
    doc.setTextColor(30); y += 7;

    // ---- resumos ----
    const cont = (arr, k, itens) => itens.map(it => [it.nome, arr.filter(o => o[k] === it.id).length]).filter(r => r[1]);
    const porRod = Object.entries(ocs.reduce((a, o) => (a[o.rodovia] = (a[o.rodovia] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]);
    const cabec = { fillColor: [16, 41, 77], fontSize: 8 }; const estilo = { fontSize: 8, cellPadding: 1.2 };
    const larg = (W - 2 * M - 8) / 3;
    doc.autoTable({ startY: y, margin: { left: M }, tableWidth: larg, head: [['Por severidade', 'Qtd']], body: cont(ocs, 'severidade', CONFIG.SEVERIDADES), headStyles: cabec, styles: estilo, theme: 'grid' });
    const y1 = doc.lastAutoTable.finalY;
    doc.autoTable({ startY: y, margin: { left: M + larg + 4 }, tableWidth: larg, head: [['Por tipo', 'Qtd']], body: cont(ocs, 'tipo', CONFIG.TIPOS), headStyles: cabec, styles: estilo, theme: 'grid' });
    const y2 = doc.lastAutoTable.finalY;
    doc.autoTable({ startY: y, margin: { left: M + 2 * (larg + 4) }, tableWidth: larg, head: [['Por rodovia', 'Qtd']], body: porRod.slice(0, 8), headStyles: cabec, styles: estilo, theme: 'grid' });
    y = Math.max(y1, y2, doc.lastAutoTable.finalY) + 6;

    // ---- tabela de ocorrências ----
    doc.addPage(); y = 16;
    doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.text('Relação de ocorrências', M, y); doc.setFont(undefined, 'normal'); y += 3;
    const ordenadas = [...ocs].sort((a, b) => a.rodovia.localeCompare(b.rodovia) || a.km - b.km);
    doc.autoTable({
      startY: y, margin: { left: M, right: M },
      head: [['Data', 'Rodovia', 'km', 'Sent.', 'Tipo', 'Sev.', 'Status', 'Colapso', 'Pista afetada', 'Atendimento', 'Resolvida', 'Tempo']],
      body: ordenadas.map(o => [
        fmtData(o.criado_em), o.rodovia, Number(o.km).toFixed(2).replace('.', ','), CONFIG.nomeSentido(o.sentido),
        CONFIG.nomeTipo(o.tipo), CONFIG.nomeSev(o.severidade), CONFIG.nomeStatus(o.status), o.risco_colapso ? 'SIM' : '',
        CONFIG.nomePista(o.pista_afetada),
        o.atendimento ? [o.atendimento.equipamento, o.atendimento.executor, o.atendimento.volume_m3 && o.atendimento.volume_m3 + ' m³'].filter(Boolean).join(' / ') : '',
        o.resolvida_em ? fmtData(o.resolvida_em) : '', horas(o.criado_em, o.resolvida_em || new Date().toISOString()).toFixed(0) + ' h',
      ]),
      headStyles: { fillColor: [16, 41, 77], fontSize: 7 }, styles: { fontSize: 6.5, cellPadding: 1, overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 12 }, 2: { cellWidth: 10 }, 3: { cellWidth: 9 }, 5: { cellWidth: 11 }, 7: { cellWidth: 13 }, 11: { cellWidth: 11 } },
      didParseCell: d => {
        if (d.section === 'body' && d.column.index === 5) { const [r, g, b] = hex(CONFIG.corSev(ordenadas[d.row.index].severidade)); d.cell.styles.textColor = [r, g, b]; d.cell.styles.fontStyle = 'bold'; }
        if (d.section === 'body' && d.column.index === 7 && d.cell.raw === 'SIM') { d.cell.styles.textColor = [200, 35, 44]; d.cell.styles.fontStyle = 'bold'; }
      },
      theme: 'striped',
    });

    // ---- fotos ----
    if (incluirFotos) {
      doc.addPage(); y = 16;
      doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.text('Registro fotográfico', M, y); doc.setFont(undefined, 'normal'); y += 6;
      const fw = (W - 2 * M - 6) / 3, fh = fw * 0.66;
      for (const o of ordenadas) {
        const fotos = await STORE.fotosDe(o.id);
        const ab = fotos.find(f => f.fase === 'abertura'), co = fotos.find(f => f.fase === 'comprovacao');
        if (!ab && !co) continue;
        if (y + fh + 14 > 285) { doc.addPage(); y = 16; }
        doc.setFontSize(9); doc.setFont(undefined, 'bold');
        doc.text(`${o.rodovia} · km ${Number(o.km).toFixed(2).replace('.', ',')} — ${CONFIG.nomeTipo(o.tipo)} (${CONFIG.nomeSev(o.severidade)}) · ${CONFIG.nomeStatus(o.status)} · ${fmtData(o.criado_em)}`, M, y);
        doc.setFont(undefined, 'normal'); doc.setFontSize(7); doc.setTextColor(100); y += 4;
        doc.text('Abertura', M, y); doc.text(co ? 'Comprovação' : '', M + fw + 3, y); doc.setTextColor(30); y += 1.5;
        if (ab) doc.addImage(await blobParaDataUrl(ab.blob), 'JPEG', M, y, fw, fh);
        if (co) doc.addImage(await blobParaDataUrl(co.blob), 'JPEG', M + fw + 3, y, fw, fh);
        y += fh + 6;
      }
    }

    // rodapé
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(130); doc.text(`SIMEMP Ocorrências · S.R. Leste · página ${i}/${n}`, W / 2, 292, { align: 'center' }); }
    doc.save(`SIMEMP_ocorrencias_${new Date().toISOString().slice(0, 10)}.pdf`);
  }
  return { gerar };
})();
