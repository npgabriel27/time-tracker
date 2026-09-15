   # Registro de Ponto

   App web simples para controle de horas trabalhadas. Funciona offline via `localStorage` e pode sincronizar com o Google Sheets.

   🔗 **Acesse:** `https://npgabriel27.github.io/time-tracker/`

   ---

   ## Funcionalidades

   - Cronômetro com iniciar / pausar — acumula várias sessões no mesmo dia
   - Painel de resumo: horas de hoje, banco de horas, total da semana e média diária
   - Histórico dos últimos dias com desvio em relação à meta
   - Meta diária configurável (padrão: 8h)
   - Persistência local em `localStorage` — funciona sem internet
   - Sincronização opcional com Google Sheets via Apps Script
   - Instalável como app (PWA) — funciona offline e abre em tela cheia

   ---

   ## Instalar como app no iPhone

   1. Abra `https://npgabriel27.github.io/time-tracker/` no **Safari**
   2. Toque no ícone de compartilhar (quadrado com seta para cima)
   3. Escolha **Adicionar à Tela de Início**

   O app passa a abrir com ícone próprio, em tela cheia (sem barra do navegador) e continua funcionando offline.

   ---

   ## Setup do Google Apps Script (opcional)

   Se você quiser que os registros sejam salvos no Google Sheets, siga os passos abaixo.

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
   4. A partir de agora, toda vez que você pausar o cronômetro, o registro é enviado para a planilha automaticamente

   ---

   ## Estrutura da planilha

   O script cria uma aba chamada **Registros** com uma linha **por sessão** (não por dia):

   | Timestamp | Competência | Início | Fim | ID Sessão |
   |-----------|-------------|--------|-----|-----------|
   | 2026-09-14T18:32:10Z | 2026-09-14 | 2026-09-14T12:00:00Z | 2026-09-14T15:31:40Z | 1757858330000 |

   - Ao **iniciar** o cronômetro, uma linha é criada na hora com o horário de início (coluna Fim vazia)
   - Ao **pausar**, a mesma linha é localizada (pela coluna ID Sessão) e a coluna Fim é preenchida
   - A coluna **ID Sessão** é uma chave técnica (não editar) usada só para o app encontrar a linha certa ao atualizar
   - Rodar **Sincronizar agora** reenvia as sessões do dia — seguro mesmo se já estiverem sincronizadas, não duplica linhas

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
   ├── sw.js            ← service worker (cache offline)
   ├── icons/           ← ícones do app (Tela de Início, favicon)
   ├── apps-script.gs   ← código para o Google Apps Script
   └── README.md        ← este arquivo
   ```
