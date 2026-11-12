# InvestCalc — Real Estate Cashflow (PWA)

Web app para iPhone baseado nas planilhas **Single_Deal_Analyzer2.xlsx**
(lógica do deal) e **Edmundo_Cashflow.xlsx** (portfólio multi-deal). Sem
dependências, sem build — HTML, CSS e JavaScript puros.

## O que ele faz

No computador o app abre com barra lateral e painel largo; no iPhone, com barra
superior e abas embaixo. A tela **Início** é o painel geral: lucro projetado,
capital de clientes em obras, saldo devido a credores, juros a pagar hoje,
imóveis disponíveis, clientes procurando, próximos pagamentos de clientes (com
os atrasados em destaque), deals e credores. O visual é sempre claro (branco
com azul), mesmo com o aparelho em modo escuro. O nome da empresa (Ajustes) aparece na barra
lateral, e um indicador mostra se os dados estão só no aparelho ou na nuvem.

Reproduz o modelo das planilhas, célula por célula:

- **Calculadora** — análise avulsa de um deal (a Single Deal Analyzer): faça a
  conta sem sujar o portfólio; só entra no cashflow se você tocar em "Salvar
  no cashflow". A última análise fica guardada no aparelho. O botão
  **Compartilhar** gera um **PDF de uma página** com premissas, resultados e
  sensibilidade (`pdfgen.js`, gerador próprio sem dependências) e abre a folha
  nativa do iPhone — AirDrop, Mail, WhatsApp etc. Em navegadores sem
  compartilhamento de arquivos, o PDF é baixado.

- **Deals** — cada deal tem os mesmos inputs da planilha: preço do terreno,
  orçamento de construção, preço de venda esperado, datas (closing, início da
  obra, venda/refi), tipo de financiamento (Construction Loan ou Cash), land
  advance no closing ou com atraso, LTC, juros, loan fees all-in (5% padrão,
  cobrindo origination + docs + underwriting + appraisal) mais seguro à parte,
  cronograma de até 10 draws com % e datas (incluindo valores e datas fixados
  manualmente, e a data em que cada draw foi realmente pago — "Pago em" — que
  passa a valer no cashflow, nos juros e no retorno) e o KPI "Peak Exposure
  incl. Draw Float" do modelo novo.
- **KPIs por deal** — lucro projetado, ROI headline (na base escolhida: peak
  cash, após land reimbursement ou capital médio), ROI anualizado, pico de
  exposição de caixa, capital médio, juros totais, break-even, margem,
  sensibilidade do preço de venda (±10%) e cashflow mensal completo.
- **Cashflow consolidado** (Master Cashflow) — soma todos os deals ativos mês a
  mês contra o caixa inicial e mostra saldo projetado, pico de exposição e o
  menor saldo (com alerta quando o caixa fica negativo).
- **Ajustes** (Parameters) — defaults globais usados pelos deals que não têm
  valor próprio, cronograma padrão de draws, backup/restauração em JSON e
  restauração dos 10 deals originais da planilha.

- **Clientes** (investidores e credores) — `investors.js`, `investors-ui.js`:
  - **Imóveis** disponíveis para oferecer: dados do imóvel, venda estimada e o
    cronograma de pagamentos (terreno + draws que o cliente paga ao
    construtor). Dá para criar um imóvel a partir de um deal existente ou gerar
    o cronograma (terreno + N draws mensais).
  - **Clientes** que procuram imóveis (orçamento máximo e região): o app mostra
    quais imóveis disponíveis combinam com cada cliente e vice-versa. Ao
    atribuir um imóvel, você marca a data em que cada draw foi pago e vê
    quanto falta, o que está vencido e o retorno — estimado pelo preço de
    venda previsto e, depois da venda, o realizado (lucro, retorno e taxa
    anualizada pelas datas reais dos pagamentos).
  - **Credores** que emprestam dinheiro: cada empréstimo tem taxa anual e
    lançamentos datados (aporte, devolução de principal, juros pagos). Os juros
    são simples, contados por dia sobre o principal em aberto (ano de 365
    dias), então cada devolução de principal reduz os juros dali em diante.
  - **PDFs** (`reports.js`): oferta de um imóvel, lista dos investimentos
    disponíveis e extrato do cliente (imóveis, pagamentos, retorno e
    empréstimos), além do extrato de um único empréstimo para o credor. O
    extrato sai no idioma configurado no cliente (inglês ou
    português); o nome da empresa e o contato vêm da aba Ajustes.
- **Nuvem** (`cloud.js`, opcional) — sincroniza todos os dados entre celular e
  computador com um login só seu. Veja "Como ligar a nuvem" abaixo.

O motor de cálculo (`model.js`) é validado por `test/model.test.js` contra os
valores calculados pela própria planilha (todos os deals e o portfólio batem
ao centavo):

```bash
node test/model.test.js
node test/pdf.test.js
node test/investors.test.js   # imóveis, retorno, empréstimos e PDFs
node test/cloud.test.js       # sincronização contra um Supabase simulado
```

Os dados ficam no aparelho (localStorage) e o app funciona offline após o
primeiro acesso. Com a nuvem ligada, as alterações sobem sozinhas e os outros
aparelhos as recebem ao abrir o app.

## Como ligar a nuvem (Supabase, plano gratuito)

1. Crie uma conta em supabase.com e um projeto novo.
2. No projeto, abra **SQL Editor**, cole o SQL que aparece em
   **Ajustes → Nuvem → Como configurar** (também está em `cloud.js`,
   `SETUP_SQL`) e rode. Ele cria a tabela `investcalc_state` com row-level
   security: cada usuário só lê e grava a própria linha.
3. Em **Project Settings → API**, copie a **Project URL** e a chave pública
   (**anon** / **publishable**) para os campos da aba Ajustes. Nunca use a
   chave `service_role`/`secret`.
4. Informe e-mail e senha e toque em **Criar conta** (uma vez). Nos outros
   aparelhos, **Entrar** com a mesma conta.
5. Depois, desligue novos cadastros no Supabase (**Authentication → Sign In /
   Providers → Allow new users to sign up**).

O estado inteiro é uma linha JSON com um número de revisão. Se dois aparelhos
alterarem dados sem sincronizar, o app não mistura nem sobrescreve em
silêncio: ele pede para escolher entre os dados da nuvem e os do aparelho.

## Diferença conhecida em relação à planilha

A aba **Dashboard** da planilha soma colunas erradas em três células: B13
("Total Holding Costs") soma a coluna de lucro, B14 ("Total Projected Profit")
soma a coluna de ROI e, por consequência, B15/B16 (ROIs do portfólio) saem
errados. O app calcula esses totais com as colunas corretas.

## Como publicar (GitHub Pages)

1. No GitHub, abra **Settings → Pages** do repositório.
2. Em "Build and deployment", escolha **Deploy from a branch** e selecione o
   branch com a pasta `/ (root)`.
3. O app ficará disponível em `https://<seu-usuario>.github.io/app/`.

## Como instalar no iPhone

1. Abra o endereço do app no **Safari**.
2. Toque em **Compartilhar → Adicionar à Tela de Início**.
3. O InvestCalc vira um app com ícone próprio e tela cheia.

## Rodar localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

(O service worker só registra em HTTPS, mas todo o resto funciona em localhost.)
