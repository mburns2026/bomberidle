# Bomber Idle (Solana) - v1.7.1

Jogo idle/play-to-earn estilo grade com bombas, baus e operadores NFT, na Solana.
Moeda do jogo: **$BOMBERSI**. Token do estudio: **$ASG**. Veja [docs/GLOSSARIO.md](docs/GLOSSARIO.md).

> **Status:** MVP técnico. O cliente é jogável em modo demo; o saque on-chain ainda não está integrado de ponta a ponta. Programa **não auditado**: não use em mainnet. Veja a [revisão 1.7.1](docs/REVISAO-1.7.1.md) com o que falta.
> Use arte, nome e personagens proprios. Nao copie assets de outros jogos.

## Estrutura
```
programs/bomber_idle/  Programa Anchor (vault + claim com co-assinatura do servidor)
server/                API Node/TS: simulacao de farming e montagem de tx de claim
client/                Vite + Phaser: mapa, carteira Phantom, botao de saque
docs/TOKENOMICS.md     Rascunho de economia
```

## Modo demo (cliente)
O cliente roda sozinho. Até 15 operadores (6 raridades, de Comum a Super lendário) exploram o mapa, plantam bombas, atacam baús (que têm HP) e inimigos, e gastam stamina. Há 50 mapas com 33 instâncias cada (a dificuldade cresce a cada instância e há um MVP na 33), Cápsulas de Recruta, Alojamentos, Droide Zelador, melhorias e missões diárias. Tudo fica no `localStorage` do navegador. Toda a arte é gerada por código (sem assets de terceiros).

## Fluxo de saque
1. Servidor simula o farming off-chain e acumula `pending`.
2. O jogador assina uma mensagem (`signMessage`) provando que é dono da carteira; `POST /claim` valida a assinatura, reserva o saldo e monta a tx `claim(amount, nonce)` co-assinada pelo `server_authority` (cria a conta de token se faltar).
3. Jogador assina e envia. O programa valida nonce, limite e transfere do vault.
4. Se a tx não for enviada, a reserva continua e o próximo pedido reconstrói a mesma tx. O servidor lê o último nonce da cadeia, então reiniciar não quebra os saques.

## Rodando
```bash
npm install
cp server/.env.example server/.env   # opcional: sem as chaves on-chain o servidor responde 503 ao saque
npm run dev:server   # :3001
npm run dev:client   # :5173
npm test             # testes do servidor e do cliente
```

### Deploy do cliente (GitHub Pages)
1. GitHub: Settings > Pages > Source = **GitHub Actions**.
2. Push na `main` dispara `.github/workflows/deploy.yml`, que roda os testes e publica em `/NOME-DO-REPO/` (o `base` é definido sozinho por `VITE_BASE`).
3. (Opcional) Settings > Variables > `VITE_API_URL` com a URL do servidor.
4. Para publicar em outro caminho (ex.: `/bomber-idle/` no site do estúdio): `VITE_BASE=/bomber-idle/ npm run build -w client`.

### On-chain (devnet)
```bash
solana-keygen new -o keys/server-authority.json   # nao commitar
anchor build && anchor keys sync && anchor build
anchor deploy --provider.cluster devnet
```
Depois: crie o mint SPL, chame `initialize(server_authority, max_claim)`,
financie o vault (PDA `["vault"]`) e preencha `server/.env` (use o mesmo `max_claim` em `MAX_CLAIM`).

## Próximos passos
Detalhes e prioridades em [docs/REVISAO-1.7.1.md](docs/REVISAO-1.7.1.md).
- [ ] Unificar as economias: servidor autoritativo (hoje o cliente e o servidor têm saldos separados)
- [ ] PostgreSQL/Redis no lugar do store em memória
- [ ] Regeneração de stamina no servidor (hoje nunca regenera)
- [ ] Testes Anchor (`tests/`), ID real do programa e teto de saque por usuário/dia
- [ ] Sign-In With Solana completo (hoje só o saque exige assinatura)
- [ ] Sorteio da Cápsula no servidor
- [ ] Progresso offline e sons
- [ ] Cofre com mínimo, taxa e histórico (1.8)
- [ ] Heróis como NFT (Metaplex Core) e leitura on-chain
- [ ] Ranking com Merkle distributor
- [ ] Anti-bot, auditoria e revisão jurídica (CVM/Lei 14.478)

## Versões
Veja o [CHANGELOG](CHANGELOG.md).

## Licença
MIT
