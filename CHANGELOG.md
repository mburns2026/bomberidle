# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/) e versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [1.2.0] - 2026-10-14
### Alterado
- Fim do estilo cyberpunk no mundo: visual colorido de arcade com arte 100% original.
- 5 mapas com biomas, layouts, densidade e clima proprios: Campo Verde, Deserto Dourado, Montanha Nevada, Vulcao e Selva Antiga.
- Seletor de mapas no painel (modo Auto avanca para o proximo mapa ao limpar o atual).
- Herois com animacao de caminhada em 4 quadros, brilho por raridade e sombras refinadas.
- Baus de madeira com ferragens na cor da raridade, bomba classica e explosoes de fogo.

## [1.1.0] - 2026-10-14
### Adicionado
- Mundo cyberpunk neon (chao de circuitos, torres de servidor, caixas de dados, capsulas de energia).
- 6 herois com silhueta propria, um por raridade: Lyra (Comum), Titan (Raro), Vex (Epico), Kira (Mitico), Jax (Lendario), Orion (Super lendario).
- 6 raridades de heroi e de bau. Habilidades: regen (Lyra), bomba grande (Titan), sorte de bau (Vex), velocidade (Kira), corte sem bomba (Jax), bonus total (Orion).
- Cartas NFT como retrato no painel de herois.

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
- 1.3: herois como NFT
- 2.0: ranking com pool, marketplace e auditoria
