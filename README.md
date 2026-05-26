# Missão da Semana

Aplicativo web simples para controlar tarefas domésticas semanais dos filhos Felipe e Antonela e registrar multas por palavrões ou besteiras da família.

## Estrutura

- `index.html`: página principal.
- `src/app.js`: estado, cálculos, eventos, importação/exportação e renderização.
- `src/styles.css`: visual responsivo, colorido e lúdico.
- `data/example-data.json`: resumo dos dados iniciais e regras.

## Como executar

Opção mais simples:

1. Abra o arquivo `index.html` no navegador.
2. Use o aplicativo normalmente.

Opção com servidor local:

```bash
npm start
```

Depois acesse `http://localhost:4173`.

## Como publicar no GitHub Pages

Este projeto já está preparado para GitHub Pages com o workflow `.github/workflows/github-pages.yml`.

1. Crie um repositório no GitHub, por exemplo `missao-da-semana`.
2. Envie estes arquivos para o repositório.
3. No GitHub, abra `Settings` > `Pages`.
4. Em `Build and deployment`, escolha `GitHub Actions`.
5. Faça um push na branch `master` ou `main`.
6. Aguarde a action `Publicar no GitHub Pages` terminar.

A URL final ficará parecida com:

```text
https://seu-usuario.github.io/missao-da-semana/
```

O app usa caminhos relativos, então funciona tanto na raiz quanto dentro do subcaminho do repositório.

## Persistência

Os dados ficam salvos no `localStorage` do navegador. O app também possui botões para exportar e importar um arquivo JSON com todo o estado.

Importante: no GitHub Pages os dados continuam ficando no navegador de cada pessoa/dispositivo. Para levar os dados para outro navegador, use `Exportar JSON` e depois `Importar JSON`.

## Lógica de cálculo

A semana sempre vai de segunda-feira a domingo.

Cada filho pode receber R$ 50,00 na semana. Para ganhar esse valor base, precisa cumprir pelo menos 85% das tarefas válidas. Tarefas marcadas como "Não se aplica" não entram no cálculo.

Para cada ocorrência de Felipe ou Antonela, o próprio saldo semanal recebe desconto de R$ 1,00.

Para cada ocorrência de Luiz ou Giovana, cada filho recebe crédito de R$ 1,00. Uma multa do pai ou da mãe soma R$ 1,00 para Felipe e R$ 1,00 para Antonela.

Fórmula por filho:

```text
valor final = valor base atingido - multas do filho + multas dos pais
```

O valor final nunca fica abaixo de R$ 0,00.

## Funcionalidades

- Cards dos quatro participantes com foto, nome e saldo.
- Cadastro ou troca de foto por participante.
- Calendário semanal de segunda a domingo.
- Marcação diária das tarefas como feita, não feita ou não se aplica.
- Registro rápido de ocorrências negativas com confirmação.
- Observação opcional por ocorrência.
- Edição e exclusão manual de ocorrências.
- Desfazer último lançamento.
- Fechamento semanal com percentual, base, descontos, créditos e valor final.
- Histórico de semanas.
- Botão para iniciar nova semana.
- Exportação e importação de JSON.
- Medalhas automáticas: semana completa, nenhuma besteira e ajudante do dia.
