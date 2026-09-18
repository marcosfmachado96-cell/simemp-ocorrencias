// Dados fictícios para o protótipo (só em MODO 'local').
// Gera ocorrências ao longo da malha da S.R. Leste, nos últimos 60 dias.
window.SEED = {
  async gerar(qtd = 28) {
    const malha = GEO.getMalha();
    if (!malha) throw new Error('Malha não carregada');
    const feats = malha.features.filter(f => f.geometry.coordinates.length > 5);
    const rnd = a => a[Math.floor(Math.random() * a.length)];
    const nomes = CONFIG.USUARIOS_DEMO.filter(u => u.perfil === 'tecnico');
    const obs = {
      queda_barreira: ['Material sobre a pista, ~2 m de altura.', 'Deslizamento de talude após chuva.', 'Blocos de rocha na faixa da direita.'],
      queda_arvore: ['Árvore de grande porte sobre a pista.', 'Galhos obstruindo meia pista.', 'Eucalipto caído no acostamento.'],
      bloqueio_pista: ['Pista totalmente interditada.', 'Bloqueio parcial, trânsito em meia pista.', 'Veículo tombado com carga.'],
      erosao: ['Erosão no bordo do acostamento.', 'Erosão avançando sobre a pista.', 'Processo erosivo junto ao bueiro.'],
      queda_pista: ['Afundamento de pista, ~1,5 m de extensão.', 'Ruptura de aterro na faixa da direita.'],
      outro: ['Buraco de grandes dimensões.', 'Sinalização derrubada.'],
    };
    const equip = ['Escavadeira hidráulica', 'Pá carregadeira + caminhão basculante', 'Retroescavadeira', 'Motosserra + caminhão munck', 'Motoniveladora'];
    const exec = ['Equipe de conservação SR Leste', 'Empreiteira contratada', 'Equipe própria + apoio Defesa Civil'];

    for (let i = 0; i < qtd; i++) {
      const f = rnd(feats);
      const c = f.geometry.coordinates;
      const k = 1 + Math.floor(Math.random() * (c.length - 2));
      const t = Math.random();
      const lon = c[k][0] + (c[k + 1][0] - c[k][0]) * t;
      const lat = c[k][1] + (c[k + 1][1] - c[k][1]) * t;
      const loc = GEO.localizar(lat, lon) || { rodovia: f.properties.rod, km: f.properties.km_ini, sentido: f.properties.sentido, municipio: f.properties.municipio, trecho: f.properties.trecho };
      const tipo = rnd(['queda_barreira', 'queda_barreira', 'queda_arvore', 'queda_arvore', 'bloqueio_pista', 'erosao', 'queda_pista', 'outro']);
      const sev = rnd(['baixa', 'media', 'media', 'alta', 'alta', 'critica']);
      const diasAtras = Math.floor(Math.random() * 60);
      const criado = new Date(Date.now() - diasAtras * 864e5 - Math.random() * 864e5);
      const tec = rnd(nomes);
      // status: quanto mais antiga, mais provável estar resolvida
      let status = 'aberta';
      if (diasAtras > 3 && Math.random() < 0.55) status = 'resolvida';
      else if (Math.random() < 0.4) status = 'em_atendimento';

      const oc = {
        id: STORE.uuid(), criado_em: criado.toISOString(), criado_por: tec.nome, criado_por_id: tec.id,
        status, sync: 'ok',
        lat, lng: lon, precisao: 5 + Math.round(Math.random() * 12),
        rodovia: loc.rodovia, km: loc.km, sentido: loc.sentido, trecho: loc.trecho, municipio: loc.municipio,
        tipo, severidade: sev,
        pista_afetada: rnd(['acostamento', 'uma_faixa', 'uma_faixa', 'pista_total', 'ambos_sentidos']),
        risco_colapso: tipo === 'queda_pista' || (tipo === 'erosao' && Math.random() < 0.5),
        observacao: rnd(obs[tipo]),
        atendimento: null, resolvida_em: null, historico: [],
      };
      const fAb = await STORE._put('fotos', { id: STORE.uuid(), oc_id: oc.id, fase: 'abertura', blob: await FOTOS.fake(CONFIG.nomeTipo(tipo), '#7c6f64'), em: oc.criado_em }).then(id => id);
      oc.historico.push({ em: oc.criado_em, por: tec.nome, status: 'aberta', texto: oc.observacao, fotos: [fAb] });

      if (status !== 'aberta') {
        const em = new Date(criado.getTime() + (2 + Math.random() * 20) * 36e5).toISOString();
        const at = { equipamento: rnd(equip), executor: rnd(exec), inicio_em: em };
        if (tipo === 'queda_barreira') at.volume_m3 = 20 + Math.round(Math.random() * 400);
        oc.atendimento = at;
        const fAt = await STORE._put('fotos', { id: STORE.uuid(), oc_id: oc.id, fase: 'atendimento', blob: await FOTOS.fake('Em atendimento', '#b8860b'), em });
        oc.historico.push({ em, por: tec.nome, status: 'em_atendimento', texto: 'Início do atendimento.', fotos: [fAt], atendimento: at });
      }
      if (status === 'resolvida') {
        const em = new Date(new Date(oc.atendimento.inicio_em).getTime() + (4 + Math.random() * 72) * 36e5).toISOString();
        oc.resolvida_em = em;
        const fRe = await STORE._put('fotos', { id: STORE.uuid(), oc_id: oc.id, fase: 'comprovacao', blob: await FOTOS.fake('Comprovação', '#2e7d4f'), em });
        oc.historico.push({ em, por: tec.nome, status: 'resolvida', texto: 'Pista liberada.', fotos: [fRe] });
      }
      await STORE._put('ocorrencias', oc);
    }
    await STORE.meta('seed', true);
  },
};
