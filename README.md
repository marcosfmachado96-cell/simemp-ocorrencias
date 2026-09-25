# SIMEMP Ocorrências

Registro de ocorrências em rodovias (queda de barreira, árvore, bloqueio de pista, erosão, queda de pista, defensa danificada)
pelos técnicos de campo da S.R. Leste, com painel de acompanhamento em mapa e relatório PDF.
Custo zero: PWA + hospedagem estática + Supabase (plano gratuito).

## Modos

- `MODO: 'local'` (atual) — protótipo: os dados ficam só no navegador (IndexedDB), com dados fictícios.
- `MODO: 'supabase'` — produção: login por e-mail/senha, dados no Supabase, fotos no Storage, painel em
  tempo real. O celular continua gravando primeiro no aparelho (offline) e envia quando há sinal.

Roteiro de implantação: [IMPLANTACAO.md](IMPLANTACAO.md). Banco: [supabase/schema.sql](supabase/schema.sql).

## Pastas

```
app/                    site publicável (é isso que vai para a hospedagem)
  index.html            app do técnico (celular, PWA, offline)
  painel.html           painel (computador): mapa, filtros, detalhe, PDF
  js/config.js          listas (tipos, severidades, status), cores, mapa base, usuários demo, MODO
  js/icons.js           ícones vetoriais (SVG inline)
  js/geo.js             GPS -> rodovia / km / sentido (interpola Km_Inicial..Km_Final do SRE)
  js/store.js           camada de dados (IndexedDB + fila de envio)
  js/remote.js          sincronização com o Supabase (envio da fila, download, tempo real, login)
  js/app.js             interface do técnico
  js/painel.js          interface do painel
  js/relatorio.js       PDF (jsPDF) gerado no navegador
  js/seed.js            dados fictícios do protótipo
  sw.js                 service worker (funciona sem sinal)
  data/malha_leste.geojson   malha da SR1 Leste = S.R. Leste + Esc. Médio Iguaçu + Esc. Xisto (454 KB, vai para o celular)
  data/malha_pr.geojson      estado inteiro simplificado (só contexto no painel)
ferramentas/
  gerar_malha.py        gera os geojson a partir do shapefile SRE
  gerar_icones.py       ícones da PWA
  servidor_dev.py       servidor local para testes
SRE_2024_Atualizado/    shapefile oficial SRE-PR 2022 (fonte)
```

## Rodar localmente

```bash
python ferramentas/servidor_dev.py 8765
```

- Técnico: http://localhost:8765/index.html (no Chrome, F12 → modo dispositivo para simular celular)
- Painel:  http://localhost:8765/painel.html

Menu ☰ → "Recriar dados fictícios" zera e gera 28 ocorrências novas.

## Testar no celular de verdade

GPS e câmera só funcionam em **HTTPS** (ou localhost). Acessar pelo IP do computador (http://192.168...) mostra
o app, mas o navegador bloqueia o GPS. Para o teste real é preciso publicar a pasta `app/` em uma hospedagem
gratuita com HTTPS — **GitHub Pages** (recomendado) ou Cloudflare Pages. Depois: abrir a URL no celular →
menu do navegador → "Adicionar à tela de início".

## Identidade visual

Tipografia Inter (Google Fonts, com fallback do sistema), paleta azul-marinho institucional + âmbar, ícones vetoriais
(sem emojis), mapa OpenStreetMap dessaturado por CSS para destacar as ocorrências. Tokens de cor em `css/app.css`
(`:root`) e cores de severidade/status em `js/config.js` — mudar ali reflete no app, painel e PDF.

## Regras implementadas

- Técnico: cria ocorrência, inicia atendimento (equipamento, executor, volume se barreira), registra avanço,
  resolve (foto de comprovação obrigatória). No celular vê só as ocorrências em aberto.
- Gestor: tudo. DER: só leitura.
- Status: Aberta → Em atendimento → Resolvida. Cada mudança guarda quem/quando/foto.
- Campo "possibilidade de colapso de pista" (destaque vermelho e anel preto no mapa/PDF).
- km automático: projeta o GPS no trecho mais próximo da malha (até 300 m) e interpola o km oficial.
  Em cruzamentos pode sugerir a rodovia errada — por isso o técnico sempre confirma.
- Fotos comprimidas no aparelho (~1280 px, JPEG) e **carimbadas** com data/hora, rodovia, km, sentido,
  município e coordenadas num bloco no canto inferior direito — gravado na imagem ao salvar, quando os dados já estão confirmados.
- Fotos de acompanhamento podem ser anexadas a qualquer momento enquanto a ocorrência não estiver resolvida.
- Relatório PDF: registro fotográfico traz **a primeira e a última foto** de cada ocorrência (por data de captura),
  com a fase e o horário; se houver mais, avisa o total.
- **Edição pelo gestor**: no painel, ocorrências não resolvidas podem ter rodovia, km, sentido, município,
  tipo, severidade, pista afetada, risco de colapso e observação corrigidos. Cada alteração entra no histórico
  (quem, quando, valor anterior → novo). Coordenadas e fotos originais não são alteradas.
- Painel em celular: abas **Lista / Mapa** (em telas com menos de 820 px), indicadores em faixa rolável
  e botão "Ver no mapa" no detalhe.
- Sentido segue o padrão do SRE: **direita** (km crescente) / **esquerda** (km decrescente) / ambos.
- Offline: registro fica na fila e o topo mostra "offline · N"; envia sozinho quando voltar o sinal.

## Como a sincronização funciona (modo supabase)

1. Técnico registra → grava no IndexedDB + entra na fila (`outbox`).
2. Com sinal, `remote.js` sobe as fotos para o bucket `fotos`, faz `upsert` da ocorrência e, para
   atualizações, chama a função `registrar_evento` (acrescenta o evento ao histórico de forma atômica).
3. O painel assina mudanças em tempo real (`postgres_changes`) e baixa o que mudou (`atualizado_em`).
4. Uma mudança local ainda não enviada nunca é sobrescrita pelo servidor.

Publicação: push na branch `main` → GitHub Actions publica `app/` no GitHub Pages.
