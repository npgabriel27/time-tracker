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

   O script cria uma aba chamada **Registros** com as colunas:

   | Data | Horas | Milissegundos | Meta (h) | Sessões | Atualizado em |
   |------|-------|--------------|---------|---------|--------------|
   | 2026-09-14 | 8.25 | 29700000 | 8 | 3 | 2026-09-14T18:… |

   - Se você registrar o dia mais de uma vez, a linha existente é **atualizada** (não duplicada)

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
   ├── apps-script.gs   ← código para o Google Apps Script
   └── README.md        ← este arquivo
   ```
