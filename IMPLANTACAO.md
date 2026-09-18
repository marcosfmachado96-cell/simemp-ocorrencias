# Implantação — SIMEMP Ocorrências

**Sistema no ar desde 18/09/2026.**

| O quê | Endereço |
|---|---|
| App do técnico (celular) | https://marcosfmachado96-cell.github.io/simemp-ocorrencias/ |
| Painel (computador) | https://marcosfmachado96-cell.github.io/simemp-ocorrencias/painel.html |
| Código | https://github.com/marcosfmachado96-cell/simemp-ocorrencias |
| Banco / usuários | https://supabase.com/dashboard/project/dsgtfrkyocevlywscpvu |

## Cadastrar um técnico (ou usuário do DER)

1. Supabase → *Authentication* → *Users* → *Add user* → *Create new user*: e-mail, senha inicial, **Auto confirm user** marcado → *Create user*.
2. O perfil nasce como `tecnico` com o nome tirado do e-mail. Para ajustar nome e perfil:
   *SQL Editor* → cole e execute (trocando e-mail, nome e perfil):
   ```sql
   update public.perfis set nome = 'Nome do Técnico', perfil = 'tecnico'
   where id = (select id from auth.users where email = 'tecnico@empresa.com');
   ```
   Perfis: `tecnico` (registra e atende), `gestor` (tudo), `der` (só leitura no painel).
   Ou edite direto em *Table Editor* → `perfis` (colunas `nome`, `perfil`, `ativo`).
3. Para desativar alguém: `ativo` = false na tabela `perfis`.
4. Instalar no celular: abrir o endereço do app → menu do navegador → **Adicionar à tela de início** → entrar com e-mail e senha.

## Atualizar o sistema

Qualquer alteração em `app/` publicada com `git push` na branch `main` vai ao ar em ~1 minuto (GitHub Actions).
Os celulares pegam a versão nova na próxima abertura com sinal.

---

## Roteiro original (já executado)

## 1. Supabase (banco, login e fotos)

1. **[você]** Acesse https://supabase.com → *Start your project* → crie a conta (pode usar login com GitHub ou e-mail).
2. **[você]** *New project*:
   - Name: `simemp-ocorrencias`
   - Database password: escolha uma forte e **guarde** (não é a senha do app; é a do banco).
   - Region: `South America (São Paulo)`
   - Plan: Free.
3. **[você]** Menu lateral *SQL Editor* → *New query* → cole o conteúdo inteiro de [supabase/schema.sql](supabase/schema.sql) → *Run*.
   Deve terminar com "Success. No rows returned".
4. **[você]** *Project Settings* (engrenagem) → *API*. Copie e me envie:
   - **Project URL** (ex.: `https://abcdefgh.supabase.co`)
   - **anon public** key (uma chave longa começando com `eyJ...`)

   Essa chave é pública por desenho — o que protege os dados são as regras de acesso do banco (RLS), já no SQL.
5. **[você]** Cadastro dos usuários: *Authentication* → *Users* → *Add user* → *Create new user*:
   - E-mail e senha inicial do técnico
   - Marque **Auto Confirm User**
   - Em *User Metadata* cole, ajustando o nome e o perfil:
     ```json
     {"nome": "Nome do Técnico", "perfil": "tecnico"}
     ```
   - Perfis válidos: `tecnico` (registra e atende), `gestor` (tudo), `der` (só leitura no painel).
   - Repita para os 10 técnicos, para você (`gestor`) e para o acesso do DER (`der`).

   Para desativar alguém depois: *Table Editor* → tabela `perfis` → coluna `ativo` = false.

## 2. GitHub (hospedagem gratuita com HTTPS)

O app precisa de HTTPS para o GPS e a câmera funcionarem no celular. O GitHub Pages fornece isso de graça
para repositórios **públicos** (o código e a malha rodoviária são públicos; os dados ficam no Supabase, protegidos por login).

1. **[você]** Crie a conta em https://github.com (se ainda não tiver).
2. **[você]** *New repository* → Name: `simemp-ocorrencias` → Public → *Create repository* (sem README).
3. **[você]** Me passe o nome de usuário do GitHub. Eu preparo o envio; o comando final de envio (`git push`)
   pedirá seu login do GitHub na primeira vez — abre uma janela do navegador para autorizar.
4. No repositório: *Settings* → *Pages* → *Source*: **GitHub Actions**. A publicação é automática a cada envio
   ([.github/workflows/pages.yml](.github/workflows/pages.yml)).
5. O endereço fica `https://<seu-usuario>.github.io/simemp-ocorrencias/`.
   - Técnicos: abrir esse endereço no celular → menu do navegador → **Adicionar à tela de início**.
   - Painel: `https://<seu-usuario>.github.io/simemp-ocorrencias/painel.html`.

## 3. O que eu faço com as chaves

- Coloco URL e chave em `app/js/config.js` e mudo `MODO` para `'supabase'`.
- Envio o código para o GitHub e confirmo a publicação.
- Testamos: você entra no painel, um técnico registra uma ocorrência no celular, ela aparece no mapa em segundos.

## Manutenção (custo zero, mas com duas rotinas)

- **Supabase "dorme" após 7 dias sem uso** no plano gratuito. Com uso diário não acontece. Se acontecer
  (ex.: férias coletivas), basta abrir o projeto no painel do Supabase e clicar em *Restore*.
- **Fotos**: 1 GB grátis ≈ 1,5 ano de uso. Quando chegar perto, baixamos as fotos das ocorrências
  resolvidas antigas para o OneDrive e liberamos espaço (eu preparo o script quando for a hora).
