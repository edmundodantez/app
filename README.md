# InvestCalc — Real Estate Cashflow (PWA)

Web app para iPhone baseado nas planilhas **Single_Deal_Analyzer2.xlsx**
(lógica do deal) e **Edmundo_Cashflow.xlsx** (portfólio multi-deal). Sem
dependências, sem build — HTML, CSS e JavaScript puros.

## O que ele faz

Reproduz o modelo das planilhas, célula por célula:

- **Calculadora** — análise avulsa de um deal (a Single Deal Analyzer): faça a
  conta sem sujar o portfólio; só entra no cashflow se você tocar em "Salvar
  no cashflow". A última análise fica guardada no aparelho. O botão
  **Compartilhar** gera um resumo em texto (premissas, resultados e
  sensibilidade) e abre a folha nativa do iPhone — AirDrop, Mail, WhatsApp
  etc. (em navegadores sem Web Share, copia para a área de transferência).

- **Deals** — cada deal tem os mesmos inputs da planilha: preço do terreno,
  orçamento de construção, preço de venda esperado, datas (closing, início da
  obra, venda/refi), tipo de financiamento (Construction Loan ou Cash), land
  advance no closing ou com atraso, LTC, juros, loan fees all-in (5% padrão,
  cobrindo origination + docs + underwriting + appraisal) mais seguro à parte,
  cronograma de até 10 draws com % e datas (incluindo valores e datas fixados
  manualmente) e o KPI "Peak Exposure incl. Draw Float" do modelo novo.
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

O motor de cálculo (`model.js`) é validado por `test/model.test.js` contra os
valores calculados pela própria planilha (todos os deals e o portfólio batem
ao centavo):

```bash
node test/model.test.js
```

Os dados ficam no aparelho (localStorage) e o app funciona offline após o
primeiro acesso.

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
