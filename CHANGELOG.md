# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/) e versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [1.7.1] - 2026-10-21
Revisão geral: correções, testes e documentação. Veja os detalhes e o que ainda falta em [docs/REVISAO-1.7.1.md](docs/REVISAO-1.7.1.md).
### Corrigido
- **Progresso do mapa se perdia ao recarregar a página**: mapa, instância e modo Auto agora ficam salvos (são 50 mapas x 33 instâncias, e a dificuldade e o drop dependem disso).
- **Stamina voltava cheia ao recarregar**: agora é salva junto com o operador.
- **Missões diárias reiniciavam às 21h no Brasil** (usavam a data UTC): agora usam a data do aparelho.
- **A lista de operadores pulava e perdia o scroll** sempre que alguém ia trabalhar/descansar (o Zelador fazia isso a cada poucos segundos). Ela só é refeita quando a coleção muda.
- **Escolher um mapa na mão apagava o progresso do Auto**: o botão Auto agora volta para a instância em que você estava.
- Cápsulas apareciam como "em breve" no menu mesmo estando disponíveis desde a 1.6.0.
- Manual dizia "cinco mapas" e não citava inimigos, MVP nem instâncias; textos atualizados.
- Janelas (Cápsulas, Alojamentos, Cofre) abriam por um instante com valores vazios.
- Contador de $BOMBERSI começava em "0.00" mas o jogo usa números inteiros.
- Botão de saque escondia o motivo real da falha atrás de uma mensagem única; agora distingue cancelamento, servidor fora do ar e erro do servidor.
- **Deploy no GitHub Pages**: o `base` do Vite era fixo (`/bomber-idle/`), então o site publicado ficava em branco se o repositório tivesse outro nome. O workflow agora define `VITE_BASE` pelo nome do repositório.
- `README` mandava copiar `server/.env.example`, que não existia.
### Segurança (servidor)
- **`/claim` não exigia prova de posse da carteira**: qualquer pessoa podia pedir o saque da carteira de outra e zerar o saldo pendente dela. Agora a carteira assina uma mensagem com data/hora (`signMessage`) e o servidor valida (`server/src/auth.ts`).
- Saque perdido: se o jogador não assinasse/enviasse a transação, o saldo reservado sumia. Agora a reserva é mantida e a mesma transação (mesmo valor e nonce) é reconstruída no próximo pedido.
- Reiniciar o servidor zerava o nonce em memória e todo saque passava a falhar (`InvalidNonce`). Agora o nonce é lido da cadeia (`UserClaim.last_nonce`).
- Primeiro saque falhava quando o jogador não tinha conta de token: a transação agora cria a conta (idempotente).
- Saques maiores que o `max_claim` do programa falhavam on-chain depois de o saldo já ter sido zerado: o servidor agora divide em vários (`MAX_CLAIM`).
- Limite de requisições por IP, corpo de requisição limitado a 10 kB, CORS configurável (`CORS_ORIGIN`) e erro interno sem vazar detalhes.
### Adicionado
- Testes automatizados (`npm test`): assinatura do saque, save/load, data local, cápsulas, mapas. Rodam no CI e antes do deploy.
- Lista de operadores paginada (30 por vez): com 500 operadores a página inteira era construída de uma vez.
- Aviso quando nenhum operador está em campo e mensagem de boas-vindas na primeira visita.
- Salvamento a cada 10 s e ao esconder/fechar a página.
- `.gitignore` (inclui `.env` e `keys/`), `server/.env.example`, `package-lock.json`.
- O Phaser agora é um arquivo separado no build (cache entre versões).
### Documentado (já estava no código, faltava aqui)
- **50 mapas x 33 instâncias** (1.650 etapas). Cada etapa aumenta o HP de blocos, baús e inimigos e a chance de um bloco soltar baú (5% no início, 55% no fim).
- **Inimigos** que vagam pelo mapa e pagam $BOMBERSI e XP; **MVP** na instância 33 de cada mapa. O mapa só avança quando não restam blocos, baús nem inimigos.
- Detalhes na seção de balanceamento do glossário.

## [1.7.0] - 2026-10-15
### Adicionado
- **Baús com HP** por raridade: Comum 10, Raro 20, Épico 40, Mítico 80, Lendário 160, Super lendário 320. Os operadores agora atacam os baús (bomba ou golpe corpo a corpo); o dano fica acumulado, barra de vida aparece ao ser atingido e quem dá o golpe final leva a recompensa.
- Dano da bomba = 8 + 2 x poder + 0,4 x (nível - 1). Jax golpeia o baú com 40% desse dano, gastando 0,3 de stamina.
- **Enviar todos / Recolher todos** e botão Enviar/Recolher por operador (máximo 15 trabalhando).
- **Alojamentos**: Casulo (150.000, 3 vagas, 15/min), Módulo (600.000, 5 vagas, 30/min); Torre (8 vagas, 60/min) vendida em $ASG, em breve. Fora de alojamento a reserva recupera 6/min. Os mais raros ocupam as melhores vagas.
- **Droide Zelador** (1.000.000 $BOMBERSI no demo): recolhe quem cai abaixo de 15% de stamina e devolve ao trabalho quem chega a 80%.
### Alterado
- **Operadores maiores em campo** (1,5x), com barras de stamina e efeitos reposicionados.
- O mapa só avança quando não há mais blocos nem baús.
- Quem trabalha agora é uma escolha salva (antes eram sempre os 15 melhores).

## [1.6.0] - 2026-10-15
### Adicionado
- **Cápsula de Recruta**: 30.000 $BOMBERSI cada (x1) ou 150.000 (x5). Sorteia raridade, atributos e pequenas variações individuais. Chances: Comum 55%, Raro 24%, Épico 12%, Mítico 6%, Lendário 2,5%, Super lendário 0,5%.
- Coleção de até 500 operadores, com filtro por raridade, numeração (#1, #2...) e indicação de quem está em reserva.
- Os 15 melhores operadores (raridade, depois nível) entram em campo automaticamente; novos operadores aparecem no mapa sem recarregar.
- Save novo começa com 1 operador Comum e 60.000 $BOMBERSI de teste (2 cápsulas).
### Alterado
- Economia reescalada (x100) para que a cápsula seja alcançável: recompensas de baús, missões e custo das melhorias.
- Saves antigos migram sozinhos: os 6 operadores fixos viram #1 a #6 com nível, XP e melhorias preservados.
- Números grandes formatados com separador de milhar.
### Observação
- O sorteio roda no navegador (modo demo). Na economia on-chain ele precisa rodar no servidor.

## [1.5.0] - 2026-10-15
### Adicionado
- Hub com menu inferior: Operadores, Cápsulas, Alojamentos, Bolsa, Cofre, Convites, Manual e Config.
- Janela modal reutilizável (fecha com Esc, clique fora ou no X).
- Cofre mostra o saldo de $BOMBERSI e baús abertos ao vivo; Manual com o passo a passo do jogo; Config com carteira, rede e botão para apagar o progresso local.
- Cápsulas, Alojamentos, Bolsa e Convites aparecem como "em breve" com a descrição do que virá.
### Alterado
- Área do mapa e painel lateral ajustados para caber acima do menu.

## [1.4.0] - 2026-10-15
### Alterado
- Identidade propria: "Herois" passam a se chamar **Operadores**; moeda do jogo **$BOMBERSI**; token do estudio **$ASG**.
- Botao de saque agora "Cofre - Sacar" (prepara o Cofre de Recompensas).
- Textos da interface, README e TOKENOMICS atualizados.
### Adicionado
- `docs/GLOSSARIO.md` com a tabela oficial de nomes do jogo.
### Roadmap (etapas)
- 1.4: nomenclatura e identidade (esta versao)
- 1.5: hub com menu inferior
- 1.6: Capsula de Recruta, colecao e roster
- 1.7: Alojamentos, Droide Zelador, Enviar/Recolher todos
- 1.8: Cofre de Recompensas (minimo, taxa, historico)
- 2.0: Bolsa, Convites, Manual e Staking

## [1.3.0] - 2026-10-14
### Adicionado
- Herois em campo no estilo chibi "bomber-bots" (cabecao, visor, moeda no peito), com o visual de cada carta NFT.
- Progressao: XP e nivel dos herois (ate 30), 3 melhorias por heroi (Stamina, Velocidade, Sorte) pagas com pontos, o que cria um sumidouro na economia.
- Missoes diarias com resgate de pontos; painel com abas (Herois, Missoes, Mapas).
### Corrigido
- Herois aguardando explosao deixam de aparecer como "Sem caminho" e nao contam como presos.
- Velocidade de cada heroi agora acompanha as melhorias em tempo real.

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
