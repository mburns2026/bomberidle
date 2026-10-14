# Bomber Idle (Solana) - v1.1.1

Jogo idle/play-to-earn estilo grade com bombas, baus e herois NFT, na Solana.

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
O cliente roda sozinho: 6 herois NFT (um por raridade) exploram o mapa cyberpunk, plantam bombas, abrem baus de varias raridades e gastam stamina. Pontos ficam em `localStorage`. O cenario e gerado por codigo; os herois usam as imagens em `client/public/nft/`.

### Herois e raridades
| Heroi | Raridade | Habilidade |
|-------|----------|------------|
| Lyra - Bio-Mecanica | Comum | Reparo Rapido: stamina volta 2,5x mais rapido |
| Jax - Street Samurai | Raro | Corte Duplo: 25% de recompensa em dobro |
| Titan - Heavy Pilot | Epico | Carga Pesada: +1 de alcance nas bombas |
| Vex - Neural Hacker | Mitico | Hack Neural: 35% de bomba sem gastar stamina |
| Kira - Sleek Rogue | Lendario | Sombra Veloz: 20% de recompensa em dobro e 15% de bomba gratis |
| Orion - Supreme Divinity | Super Lendario | Onipotencia: regen 2x, +1 alcance, 30% de recompensa em dobro, 20% de bomba gratis |

Os dados dos herois ficam em `client/src/state.ts` (raridade, habilidade, historia). Para trocar a raridade de um heroi, altere o campo `rarity`.

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
