# InvestCalc — Análise de Investimentos

Web app (PWA) para iPhone com calculadoras de análise de investimentos. Sem
dependências, sem build — é só HTML, CSS e JavaScript puros.

## Calculadoras

- **Juros compostos** — projeção de patrimônio com aporte inicial, aportes
  mensais, taxa (a.a. ou a.m.) e prazo. Mostra valor final, total investido,
  total em juros, gráfico interativo da evolução e tabela ano a ano.
- **Comparador de renda fixa** — CDB (% do CDI), LCI/LCA (isentas), Tesouro
  Selic e poupança, com IR regressivo calculado automaticamente pelo prazo.
- **Valuation de ações** — preço teto pelo método Bazin (dividendos ÷ yield
  desejado), preço justo de Graham (√(22,5 × LPA × VPA)), dividend yield,
  P/L e P/VP, com margem de desconto/ágio sobre a cotação.

Os valores digitados ficam salvos no aparelho (localStorage) e o app funciona
offline depois do primeiro acesso (service worker).

## Como publicar (GitHub Pages)

1. No GitHub, abra **Settings → Pages** do repositório.
2. Em "Build and deployment", escolha **Deploy from a branch** e selecione o
   branch principal com a pasta `/ (root)`.
3. O app ficará disponível em `https://<seu-usuario>.github.io/app/`.

## Como instalar no iPhone

1. Abra o endereço do app no **Safari**.
2. Toque no botão **Compartilhar** (quadrado com seta para cima).
3. Toque em **Adicionar à Tela de Início**.
4. O InvestCalc aparece como um app, com ícone próprio e tela cheia.

## Rodar localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

(O service worker só é registrado em HTTPS, mas todo o resto funciona em
localhost.)
