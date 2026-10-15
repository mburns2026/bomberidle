# Bomber Idle (Solana) - v1.4.0

Jogo idle/play-to-earn estilo grade com bombas, baus e operadores NFT, na Solana.
Moeda do jogo: **$BOMBERSI**. Token do estudio: **$ASG**. Veja [docs/GLOSSARIO.md](docs/GLOSSARIO.md).

> **Status:** esqueleto inicial (MVP tecnico). Programa **nao auditado**. Nao use em mainnet.
> Use arte, nome e personagens proprios. Nao copie assets de outros jogos.

## Estrutura
```
programs/bomber_idle/  Programa Anchor (vault + claim com co-assinatura do servidor)
server/                API Node/TS: simulacao de farming e montagem de tx de claim
client/                Vite + Phaser: mapa, carteira Phantom, botao de saque
docs/TOKENOMICS.md     Rascunho de economia
```

## Modo demo (cliente)
O cliente roda sozinho: 4 herois (Comum a Lendario) exploram o mapa, plantam bombas, abrem baus de varias raridades e gastam stamina. Pontos ficam em `localStorage`. Toda a arte e gerada por codigo (sem assets de terceiros).

## Fluxo de saque
1. Servidor simula o farming off-chain e acumula `pending`.
2. `POST /claim` monta a tx `claim(amount, nonce)` e co-assina com `server_authority`.
3. Jogador assina e envia. O programa valida nonce, limite e transfere do vault.

## Rodando
```bash
npm install
cp server/.env.example server/.env
npm run dev:server   # :3001
npm run dev:client   # :5173
```

### Deploy do cliente (GitHub Pages)
1. Em `client/vite.config.ts`, ajuste `base` para `/NOME-DO-REPO/`.
2. GitHub: Settings > Pages > Source = **GitHub Actions**.
3. Push na `main` dispara `.github/workflows/deploy.yml`.
4. (Opcional) Settings > Variables > `VITE_API_URL` com a URL do servidor.

### On-chain (devnet)
```bash
solana-keygen new -o keys/server-authority.json   # nao commitar
anchor build && anchor keys sync && anchor build
anchor deploy --provider.cluster devnet
```
Depois: crie o mint SPL, chame `initialize(server_authority, max_claim)`,
financie o vault (PDA `["vault"]`) e preencha `server/.env`.

## Proximos passos
- [ ] Testes Anchor (`tests/`)
- [ ] Auth por assinatura de mensagem (Sign-In With Solana)
- [ ] PostgreSQL/Redis no lugar do store em memoria
- [ ] Confirmar tx on-chain antes de baixar `pending` (evitar perda em falhas)
- [ ] Herois como NFT (Metaplex Core) e leitura on-chain
- [ ] Ranking com Merkle distributor
- [ ] Anti-bot, auditoria e revisao juridica (CVM/Lei 14.478)

## Versoes
Veja o [CHANGELOG](CHANGELOG.md). A versao 1.0.0 e a base para todas as proximas.

## Licenca
MIT
