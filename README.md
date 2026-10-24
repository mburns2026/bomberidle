# Backend Slither.Idle (testnet) — passo a passo

Tudo grátis (Cloudflare Workers + D1) e na rede de teste (devnet) da Solana. Rode os comandos no **PowerShell**, dentro desta pasta (`backend`).
**Nunca** suba para o GitHub: `ADMIN_KEY`, `JWT_SECRET` nem o arquivo da tesouraria (`treasury.json`). Esta pasta não precisa ficar no repositório do site.

## Parte A — Colocar o servidor no ar
1. Instale o **Node.js LTS** (nodejs.org). Depois: `npm install`
2. `npx wrangler login` (abre o navegador; crie a conta grátis na Cloudflare se precisar)
3. `npx wrangler d1 create slither` → copie o `database_id` mostrado e cole no `wrangler.toml`
4. **Banco novo (vazio):** `npx wrangler d1 execute slither --remote --file=schema.sql`
   **Banco que já existe:** NÃO rode o schema. Veja "Atualizando um banco existente" no final deste arquivo.
5. `npx wrangler secret put JWT_SECRET` → cole um texto longo e aleatório (30+ caracteres)
6. `npx wrangler secret put ADMIN_KEY` → outra senha longa (é a chave dos saques)
7. `npx wrangler deploy` → ele mostra a URL (ex.: `https://slither-idle-api.SEUUSUARIO.workers.dev`)
8. Teste abrindo `URL/health` no navegador: deve aparecer `{"ok":true,"testnet":true}`
9. No `config.js` do site coloque `API_URL: 'a URL do passo 7'` e envie ao GitHub.
   Em `wrangler.toml`, `ALLOW_ORIGIN` deve ser o endereço do seu site (já está o do GitHub Pages); se mudar, rode `npx wrangler deploy` de novo.

## Parte B — Token de teste na devnet (grátis)
Precisa da **Solana CLI** (siga o guia oficial de instalação em solana.com/docs).
```
solana config set --url devnet
solana-keygen new -o treasury.json          # guarde esse arquivo com cuidado
solana airdrop 2 -k treasury.json           # SOL de teste (se falhar, use faucet.solana.com)
spl-token create-token --decimals 6 --fee-payer treasury.json --mint-authority treasury.json
spl-token create-account <MINT> --owner treasury.json --fee-payer treasury.json
spl-token mint <MINT> 1000000000 --mint-authority treasury.json --fee-payer treasury.json
```
No `config.js`: `TOKEN_MINT: '<MINT>'`, `POOL_WALLET: '<endereço da treasury>'`, `NETWORK: 'devnet'`, `RPC: 'https://api.devnet.solana.com'`.
O painel de queima do site passa a mostrar os dados reais da devnet.

## Parte C — Pagar saques e queimar (rode quando quiser, ex.: 1x por dia)
```
$env:API="https://SUA-URL.workers.dev"; $env:ADMIN_KEY="sua-admin-key"
$env:MINT="<MINT>"; $env:KEYPAIR="C:\caminho\treasury.json"
node payout.mjs                        # SIMULAÇÃO (padrão): só mostra o que faria e o TOTAL
node payout.mjs --send --confirm=TOTAL # envia de verdade; TOTAL = soma exata mostrada na simulação
# Fora da devnet exige também --allow-mainnet e CONFIRM_MAINNET=YES (não use sem auditoria). Limite por execução: MAX_RUN (padrão 5000).
```
Teste primeiro com UM saque pequeno da sua própria carteira Phantom (configurada em **devnet**).

## Testes
`npm install` e depois `npm test` (Node >= 22.13; usa `node:sqlite` só nos testes). 42 testes: economia, concorrência, saques, idempotência, migrações, login Ed25519, payout seguro.
Os testes usam um D1 **simulado**; não substituem um teste real no Cloudflare.

## Atualizando um banco existente (produção/devnet já em uso)
1. **Backup:** `npx wrangler d1 export slither --remote --output=backup-$(date +%F).sql`
2. Confira as colunas: `npx wrangler d1 execute slither --remote --command "PRAGMA table_info(players)"`
   - Se `active_snake` e `afk_at` **já existem**, apague as duas linhas `ALTER` de `migrations/0001_snakes_afk.sql` antes de aplicar.
3. `npx wrangler d1 execute slither --remote --file=migrations/0001_snakes_afk.sql`
4. `npx wrangler d1 execute slither --remote --file=migrations/0002_economy_hardening.sql`
5. `npx wrangler deploy`
6. Verifique `URL/health` → `{"ok":true,"testnet":true,"v":2}`.
**Reversão:** `git checkout <commit-anterior> -- worker.js` + `npx wrangler deploy` (o worker v1 ignora as colunas/tabelas novas, então o banco migrado continua compatível). Os saldos NÃO são alterados pelas migrações; `earned_u` é uma estimativa conservadora (saldo − 100 + já sacado). Restaure o backup do passo 1 apenas se necessário.

## O que o servidor garante (e o que não)
- **Garante (v2):** login por assinatura da Phantom (sem mover fundos), saldo só no servidor com livro-caixa, teto diário de 300 **rígido**, farm AFK com cota de 40% do teto, limites por tempo real, compras e queima contabilizadas, saque só do que foi ganho jogando (idade mínima 24h, limite diário atômico), idempotência e rate limit.
- **Não garante:** que cada moeda foi realmente comida (o navegador informa isso). Por isso o ganho é limitado por tempo e por carteira. Contas suspeitas ficam marcadas no campo `sus` do banco.
- Antes de usar valor real: auditoria, limites ainda menores e revisão jurídica.
