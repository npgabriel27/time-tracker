   # Registro de Ponto

   App web simples para controle de horas trabalhadas. A planilha do Google Sheets é a fonte da verdade — cada clique registra uma batida (entrada/saída) direto nela, então nada se perde se o iPhone fechar o app em segundo plano.

   🔗 **Acesse:** `https://npgabriel27.github.io/time-tracker/`

   ---

   ## Funcionalidades

   - Botão único **Registrar Ponto**: consulta a planilha, sugere entrada ou saída (com base no último registro) e você confirma
   - Sem cronômetro rodando em background — o "tempo decorrido" é sempre recalculado a partir do último horário registrado na planilha, então fechar o app não faz perder o rastreio
   - Mostra automaticamente o contexto certo:
     - **Trabalhando**: desde que horas, tempo da sessão, total do dia, quanto falta para a meta e previsão de saída
     - **Almoço/intervalo**: quanto tempo de pausa já passou e, se voltar agora, a previsão de saída
     - **Interjornada** (entre um dia e outro): quanto tempo de descanso, com aviso se for menos de 11h
     - **Entrada sem saída**: aviso de que um registro pode ter ficado faltando
   - Painel de resumo: horas de hoje, banco de horas, total da semana e média diária
   - Histórico dos últimos dias com desvio em relação à meta
   - Meta diária configurável (padrão: 8h)
   - Fila local de envio (`outbox`) — se registrar um ponto sem internet, ele fica salvo no aparelho e é reenviado automaticamente assim que a conexão voltar
   - Instalável como app (PWA) — funciona offline (consultando o último cache) e abre em tela cheia
   - Notificações push opcionais (meta diária batida / lembrete de iniciar o dia), mesmo com o app fechado

   ---

   ## Instalar como app no iPhone

   1. Abra `https://npgabriel27.github.io/time-tracker/` no **Safari**
   2. Toque no ícone de compartilhar (quadrado com seta para cima)
   3. Escolha **Adicionar à Tela de Início**

   O app passa a abrir com ícone próprio, em tela cheia (sem barra do navegador) e continua funcionando offline.

   ---

   ## Setup do Google Apps Script (obrigatório)

   O app não funciona sem isso — a planilha é a fonte da verdade (é ela que o app consulta para saber se o próximo registro é entrada ou saída). Siga os passos abaixo.

   ### 1. Crie uma planilha no Google Sheets

   Abra o [Google Sheets](https://sheets.google.com) e crie uma planilha nova. Pode deixar vazia — o script cria a aba automaticamente.

   ### 2. Abra o editor de script

   Na planilha, vá em **Extensões → Apps Script**.

   ### 3. Cole o código

   Apague o conteúdo padrão e cole todo o conteúdo do arquivo `apps-script.gs` deste repositório.

   ### 4. Salve e faça o deploy

   1. Clique em **Salvar** (ícone de disquete ou `Ctrl+S`)
   2. Clique em **Implantar → Nova implantação**
   3. Em "Tipo", escolha **Aplicativo da Web**
   4. Configure:
      - **Executar como:** Eu (sua conta Google)
      - **Quem tem acesso:** Qualquer pessoa
   5. Clique em **Implantar**
   6. Autorize as permissões quando solicitado
   7. **Copie a URL gerada** — ela se parece com:
      ```
      https://script.google.com/macros/s/XXXXXXXXXX/exec
      ```

   ### 5. Cole a URL no app

   1. Abra o app em `https://npgabriel27.github.io/time-tracker/`
   2. Clique em **Configurações** (no final da página)
   3. Cole a URL no campo **URL do Google Apps Script**
   4. A partir de agora, o botão **Registrar Ponto** consulta e grava direto na planilha

   ---

   ## Setup do Cloudflare Worker (notificações push, opcional)

   Se você quiser receber notificações push — meta diária batida e lembrete de "ainda não iniciou hoje" — mesmo com o app fechado, siga os passos abaixo para publicar o Worker que envia essas notificações.

   ### 1. Crie uma conta na Cloudflare

   Crie uma conta gratuita em [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) (o plano free cobre este uso tranquilamente).

   ### 2. Instale as dependências e faça login

   ```bash
   cd worker
   npm install
   npx wrangler login
   ```

   ### 3. Crie o KV namespace

   ```bash
   npx wrangler kv namespace create PUSH_KV
   ```

   Copie o `id` impresso e cole em `worker/wrangler.toml`, no campo `kv_namespaces[0].id`.

   ### 4. Gere as chaves VAPID

   ```bash
   npx web-push generate-vapid-keys
   ```

   Cole a **Public Key** em `worker/wrangler.toml`, no campo `[vars] VAPID_PUBLIC_KEY`.
   Guarde a **Private Key** para o próximo passo — não a cole em nenhum arquivo do repositório.

   ### 5. Configure os secrets

   ```bash
   npx wrangler secret put VAPID_PRIVATE_KEY
   npx wrangler secret put SHARED_SECRET
   ```

   O `SHARED_SECRET` pode ser qualquer string aleatória longa (ex.: saída de `openssl rand -hex 24`). Ela serve só para impedir que estranhos poluam o KV — não é segurança real, já que o mesmo valor fica visível no código-fonte público do app (constante `PUSH_AUTH_TOKEN`).

   ### 6. Deploy

   ```bash
   npx wrangler deploy
   ```

   Copie a URL impressa (algo como `https://time-tracker-push.SEU-SUBDOMINIO.workers.dev`).

   ### 7. Configure o app

   1. Abra `index.html` e preencha as constantes `VAPID_PUBLIC_KEY`, `WORKER_URL` e `PUSH_AUTH_TOKEN` com os valores gerados acima
   2. Publique a alteração (commit + push, já que o site é servido pelo GitHub Pages)
   3. Abra o app, vá em **Configurações** e toque em **Ativar notificações**

   ### Requisitos no iPhone

   - **iOS 16.4 ou superior**
   - O app precisa estar **instalado na Tela de Início** (ver seção "Instalar como app no iPhone" acima) — Web Push **não funciona** numa aba comum do Safari, só no PWA instalado

   ---

   ## Estrutura da planilha

   O script cria uma aba chamada **Registros** com uma linha **por batida** (entrada ou saída — não por sessão nem por dia):

   | Timestamp | Data | Tipo | Horário | ID |
   |-----------|------|------|---------|-----|
   | 2026-09-14T11:32:10Z | 2026-09-14 | entrada | 2026-09-14T11:32:05Z | 1757858330000-a1b2c3 |
   | 2026-09-14T15:31:40Z | 2026-09-14 | saida | 2026-09-14T15:31:38Z | 1757858421000-d4e5f6 |

   - Cada clique em **Confirmar** no app grava uma linha nova — o app decide entrada/saída consultando a última linha da planilha
   - A coluna **ID** é uma chave técnica (não editar) usada para o app não duplicar uma batida caso reenvie por causa de uma falha de rede
   - Trocar o formato do `apps-script.gs` no meio do uso (colunas diferentes) faz o script **apagar a aba e recriar o cabeçalho** na próxima chamada — não é reversível, então não implante uma versão nova do script sobre dados que você queira manter

   ---

   ## Rodando localmente

   Basta abrir o `index.html` diretamente no navegador — não precisa de servidor.

   ```bash
   open index.html   # macOS
   start index.html  # Windows
   ```

   ---

   ## Estrutura do repositório

   ```
   time-tracker/
   ├── index.html       ← app completo (HTML + CSS + JS em um único arquivo)
   ├── manifest.json    ← manifesto do PWA (nome, ícones, cores)
   ├── sw.js            ← service worker (cache offline + notificações push)
   ├── icons/           ← ícones do app (Tela de Início, favicon)
   ├── worker/          ← Cloudflare Worker que envia as notificações push
   ├── apps-script.gs   ← código para o Google Apps Script
   └── README.md        ← este arquivo
   ```
