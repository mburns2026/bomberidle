# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/) e versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [1.1.1] - 2026-10-14
### Alterado
- Herois agora tem corpo inteiro estilo Bomberman: cabeca grande com o rosto do NFT, tronco, bracos, pernas e botas na cor da raridade.
- Animacao de caminhada (quadros de passo alternados) e sombra no chao; antena neon (aureola dourada no Super Lendario).
- Herois mais abaixo no mapa aparecem na frente dos que estao acima.

## [1.1.0] - 2026-10-14
### Adicionado
- 6 herois NFT (Lyra, Jax, Titan, Vex, Kira, Orion) com identidade propria: titulo, classe, equipamento, atributos, historia e habilidade unica.
- 6 raridades: Comum, Raro, Epico, Mitico, Lendario e Super Lendario (Orion). Baus tambem sorteiam as 6 raridades.
- Ficha do NFT: ao clicar num heroi abre a carta completa com todos os dados.
- Token redondo no mapa com o rosto do NFT e aura neon na cor da raridade (brilho extra para Lendario e Super Lendario).

### Alterado
- Visual cyberpunk futurista: piso de asfalto com circuitos, torres de dados, caixas de carga, predios neon na borda, bombas e explosoes de plasma, linhas de varredura e vinheta.
- Interface neon (roxo, ciano e magenta) com fontes Orbitron e Rajdhani.
- Arte procedural em resolucao 2x.
- Servidor: tipos de raridade e multiplicadores atualizados para as 6 raridades.

## [1.0.1] - 2026-10-14
### Alterado
- Novo visual: sprites com contorno, luz e sombra; borda do mapa com arvores e cercas vivas.
- Animacao de caminhada, explosoes com chamas e particulas, particulas ao abrir baus.
- Interface com moldura de madeira e dourado, icones e mapa ajustado a altura da tela.
- Arte continua 100% procedural e original (gerada por codigo), pronta para ser trocada por sprites reais.

## [1.0.0] - 2026-10-13
Primeira versao estavel do cliente e **base de todas as proximas versoes**.

### Adicionado
- Monorepo: programa Anchor (`programs/`), servidor Node/TS (`server/`) e cliente Vite + Phaser (`client/`).
- Cliente jogavel em modo demo: 4 herois (Comum, Raro, Epico, Lendario) com IA propria,
  bombas, baus de 4 raridades, stamina, mapa que se renova e painel de herois.
- Arte 100% procedural (sem assets de terceiros).
- Pontos de teste salvos em `localStorage`; conexao com carteira Phantom.
- Programa on-chain: `initialize`, `claim` (co-assinado pelo servidor, com nonce), `set_paused`,
  `set_max_claim`, `set_server_authority`.
- Servidor: simulacao de farming idle e montagem da transacao de claim.
- Deploy automatico no GitHub Pages (`.github/workflows/deploy.yml`) e CI.

### Limitacoes conhecidas
- Saque on-chain ainda nao integrado ao cliente (depende de servidor no ar e programa na devnet).
- Programa Anchor **nao auditado**. Nao usar em mainnet.
- Servidor com armazenamento em memoria e sem autenticacao.

## Roadmap
- 1.1: servidor no ar + programa na devnet + saque com token de teste
- 1.2: autenticacao (Sign-In With Solana) e banco de dados
- 1.3: herois NFT lidos on-chain (Metaplex Core)
- 2.0: ranking com pool, marketplace e auditoria
