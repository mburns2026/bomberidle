# Revisão 1.7.1: o que foi corrigido, o que falta e dicas

Revisão feita lendo todo o código (cliente, servidor e programa Anchor), compilando e rodando os testes.
Números abaixo foram calculados a partir do próprio código (`client/src/state.ts` e `maps.ts`); estimativas estão marcadas como tal.

> **Limite desta revisão:** a cena do jogo (Phaser) e a interface foram verificadas por compilação e leitura, não rodando num navegador. As partes de save/load, cápsulas, mapas e assinatura do saque têm testes automatizados (`npm test`). O programa Anchor **não foi compilado nem testado** aqui (não há toolchain Solana no ambiente), e o fluxo on-chain do servidor só foi checado por compilação.

## 1. Corrigido na 1.7.1
Resumo; a lista completa está no [CHANGELOG](../CHANGELOG.md).

| Problema | Impacto |
|---|---|
| Mapa/instância/Auto não eram salvos | Recarregar a página voltava ao mapa 1, instância 1, perdendo dificuldade e drop acumulados (1.650 etapas) |
| Stamina não era salva | Recarregar enchia a stamina de todos: burlava descanso, Alojamentos e Zelador |
| Missões usavam data UTC | No Brasil reiniciavam às 21h, não à meia-noite |
| Lista de operadores refeita a cada troca de trabalho | Scroll pulava; com Zelador acontecia o tempo todo |
| Escolher mapa na mão zerava o progresso do Auto | Um clique errado voltava à instância 1 |
| `/claim` sem prova de posse da carteira | Qualquer pessoa zerava o saldo pendente de outra carteira |
| Reserva do saque perdida se a tx não fosse enviada | Jogador perdia o saldo reservado |
| Nonce só em memória | Reiniciar o servidor fazia todo saque falhar |
| Conta de token inexistente | Primeiro saque de qualquer jogador falhava |
| Saque acima de `max_claim` | Falhava on-chain com o saldo já zerado no servidor |
| `base` do Vite fixo | Deploy no GitHub Pages ficava em branco com outro nome de repositório |

## 2. O que ainda falta (por prioridade)

### Antes de qualquer valor real (bloqueadores)
1. **Cliente e servidor têm duas economias separadas.** O que você ganha no navegador fica só no `localStorage`; o botão Sacar usa o saldo do *servidor*, que simula um único operador "starter" com 4 raridades (o cliente tem 6). Hoje não existe caminho entre o que o jogador ganhou e o que ele saca. A decisão central é: o servidor passa a ser a fonte da verdade (simula ou valida lotes de eventos) e o cliente só exibe.
2. **O jogador consegue editar o próprio saldo.** Tudo está no `localStorage`; qualquer um abre o console e define `pending`. Aceitável no demo, impossível com token real. Vale também para o sorteio da Cápsula (hoje roda no navegador).
3. **Servidor sem banco.** Saldo, reservas e operadores vivem em memória; reiniciar perde tudo. A leitura nonce-na-cadeia ajuda, mas o saldo pendente ainda se perde. Postgres (+ Redis para limites).
4. **A stamina do servidor nunca regenera** (`server/src/game/farming.ts` só subtrai). Depois de `maxStamina` horas de farming acumuladas o operador paga 0 para sempre. Precisa de uma regra de regeneração, que é decisão de design.
5. **Autenticação só no saque.** Foi adicionada assinatura de mensagem em `/claim`. `/player` ainda é público e não há sessão (Sign-In With Solana completo está nos próximos passos do README).
6. **Programa Anchor sem testes, sem ID real e sem auditoria.** `Anchor.toml` e `declare_id!` usam o ID do System Program (placeholder; `anchor keys sync` resolve). O script de teste aponta para uma pasta `tests/` que não existe. O programa também não limita saques por usuário/dia: se a chave do `server_authority` vazar, o vault pode ser esvaziado até o `max_claim` por transação, sem limite de transações. Sugestão: teto diário por usuário e/ou do vault, e chave do servidor em HSM/KMS.
7. **Revisão jurídica** (já citada no README: CVM e Lei 14.478) antes de qualquer token com valor.

### Jogo
- **Não há progresso offline.** Operadores só trabalham com o jogo aberto, e navegadores pausam o `requestAnimationFrame` em aba oculta, então o loop do jogo para até quando você só troca de aba. Para um idle, o padrão é calcular "o que teria acontecido" ao voltar (servidor ou simulação por estimativa, com teto de horas).
- **Nenhum som.** Nem efeito de bomba/baú, nem música. É o maior ganho de "sensação de jogo" por esforço.
- **Sem tutorial** além do Manual e de uma mensagem de boas-vindas.
- **Sem escolha de instância.** Só dá para escolher o mapa (começa na instância 1) ou voltar ao Auto.
- **Cofre (1.8)**, **Bolsa, Convites, Torre e Cápsula Premium** continuam "em breve", como no roadmap.
- **Duas abas abertas sobrescrevem o save uma da outra.** Falta travar com `BroadcastChannel`/`storage` event.
- **Assets não usados** (~1 MB no deploy): `nft/*_card.webp` (~665 KB), `nft/*_face.webp` (~141 KB) e `sprites/*.png` (220 KB) não são referenciados pelo código; a arte do campo é procedural. Ou entram no jogo ou saem do `public/` (não mexi neles: podem ser material para as cartas NFT).
- **Mobile**: o layout em coluna funciona, mas o menu inferior com 8 botões fica apertado em telas pequenas.

## 3. Dicas de balanceamento
Valores medidos no código com 1 operador Comum nível 1. As rendas por instância são **estimativas** (blocos × chance de drop × valor médio do baú, mais inimigos); não incluem o tempo que cada instância leva.

| Ponto do jogo | Blocos | Drop | Baús | Inimigos | Renda estimada/instância |
|---|---|---|---|---|---|
| Mapa 1, inst. 1 | ~151 | 5% | ~7,6 | 2 x 600 | ~3.250 |
| Mapa 5, inst. 17 | ~192 | 5,4% | ~10 | 2 x 654 | ~4.100 |
| Mapa 26, inst. 17 | ~165 | 18% | ~30 | 4 x 906 | ~11.700 |
| Mapa 50, inst. 33 | ~223 | 55% | ~123 | 6 x 1.200 | ~40.600 |

1. **A renda cresce ~12x do início ao fim, quase toda pela chance de drop** (5% → 55%): o valor por baú é praticamente fixo, enquanto o HP do baú quase triplica (x2,96). O jogador do fim ganha mais por ter *mais* baús, não baús melhores. Se quiser que mapas avançados "sintam" mais valiosos, escale o valor do baú com `mapProgress`.
2. **O inimigo comum paga 600 no início, ~2,2x o valor médio de um baú (~272).** No começo os inimigos são a principal fonte de renda, e a "fantasia do baú" fica em segundo plano. Se não for intencional, reduza a recompensa do inimigo ou suba o drop inicial.
3. **Preços de referência** (compare com a renda da tabela): 1ª melhoria de um operador = 10.000; Cápsula = 30.000 (~9 instâncias); Casulo = 150.000; Módulo = 600.000; Zelador = 1.000.000; maximizar os 3 atributos de **um** operador = ~3,4 milhões (~113 cápsulas). Com 0,5% de chance, um Super lendário custa em média 200 cápsulas = **6 milhões**.
4. **Dormir em campo é mais rápido que a reserva.** A regeneração em campo é por *tick* (depende da velocidade do operador); a da reserva é por segundo. Em campo: Lyra 40/min, Kira 32/min, Jax 34/min, Vex 21/min, Titan 13/min, Orion 60/min. Reserva sem alojamento: 6/min; Casulo 15; Módulo 30; Torre 60. Ou seja, mandar alguém descansar sem Alojamento é uma *piora* grande, e o Zelador sem Alojamentos pode reduzir o rendimento (ele manda para a reserva lenta quem cairia no sono em campo). O Manual agora avisa: "compre um Casulo antes do Zelador". Se a ideia é o Alojamento valer a pena, regenere em campo por segundo (e não por tick) com valor próximo da reserva sem alojamento.
5. **Missão "Visitar 3 mapas" é fácil demais:** clicar em 3 mapas na aba Mapas conta como visita e paga 6.000 (20% de uma cápsula, todo dia). Sugestão: contar só mapas alcançados pelo Auto, ou trocar por "limpar N instâncias".
6. **"Recarregar stamina de todos (teste)"** dá stamina infinita e anula Alojamentos, Zelador e descanso. Esconda atrás de `import.meta.env.DEV` ou `?debug` antes de publicar.
7. **Instâncias travadas**: o jogo avança sozinho quando todos ficam ociosos por muitos ciclos (inimigo preso entre blocos, por exemplo). Funciona como válvula de segurança, mas vale medir num teste longo quantas instâncias terminam assim em vez de limpas.

## 4. Melhorias sugeridas (ordem de custo-benefício)
1. Sons básicos (bomba, baú, subir de nível, cápsula). Alto impacto, baixo esforço.
2. Progresso offline limitado (ex.: até 8 h, a 50% da taxa) para dar motivo de voltar.
3. Mostrar no painel quanto cada operador rende por minuto (e o "melhor próximo upgrade"): hoje o jogador não vê o retorno de uma melhoria.
4. Animação/destaque na abertura de cápsula (revelar uma a uma, brilho por raridade), já que é o momento "jackpot" do jogo.
5. Seletor de instância e histórico do melhor mapa/instância alcançados.
6. Estatísticas (baús/hora, $BOMBERSI/hora) para o jogador comparar estratégias.
7. Sincronizar abas e exportar/importar save (útil também para suporte).
8. Trocar `localStorage` por servidor autoritativo (item 1 da seção 2): destrava Bolsa, Convites, ranking e saque real.
