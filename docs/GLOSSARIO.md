# Glossário e identidade (v1.4.0)

Todos os nomes do Bomber Idle são próprios. Esta tabela é a referência para textos, UI e documentação.

## Tokens
| Uso | Símbolo |
|---|---|
| Moeda do jogo (recompensas, caixas, melhorias) | **$BOMBERSI** |
| Token do estúdio (itens premium, alojamentos Torre) | **$ASG** |

## Termos
| Termo do Bomber Idle | Função |
|---|---|
| Expedição | Modo principal: operadores trabalham no mapa, plantando bombas e abrindo baús |
| Operadores | Os personagens do jogador (coleção, níveis, melhorias) |
| Cápsula de Recruta | Caixa que sorteia um operador (raridade, stats e habilidade). 30.000 $BOMBERSI |
| Cápsula Premium | Caixa premium paga em $ASG |
| Alojamentos | Onde operadores em reserva recuperam stamina mais rápido (Casulo, Módulo, Torre) |
| Droide Zelador | Automação: recolhe operadores cansados e os devolve ao trabalho |
| Cofre de Recompensas | Saldo de $BOMBERSI a sacar (mínimo, taxa e histórico) |
| Bolsa | Mercado de operadores e alojamentos entre jogadores |
| Convites | Programa de indicação |
| Manual | Guia do jogo dentro do app |
| Resgates | Operadores ganhos por convites ou missões |
| Enviar todos / Recolher todos | Colocar todos para trabalhar / mandar todos descansar |
| Instância | Uma "fase" de um mapa (1 a 33). Ao limpar, o Auto avança para a próxima; HP e drop crescem a cada uma |
| Inimigo | Criatura que vaga pelo mapa; quem dá o golpe final ganha $BOMBERSI e XP (não conta nas missões de baú) |
| MVP | Inimigo-chefe, só na instância 33 de cada mapa: 5x o HP de um inimigo comum e recompensa maior |

## Raridades
Comum, Raro, Épico, Mítico, Lendário, Super lendário.

## Regras de identidade
- Arte 100% original (gerada por código ou criada por nós); nunca usar assets de outros jogos.
- Textos, números (preços, taxas, limites) e layout próprios; não copiar de outros projetos.
- Nome do jogo: **Bomber Idle**, por **AI Studios Games**.

## Economia do modo demo (v1.6.0)
| Item | Valor |
|---|---|
| Cápsula de Recruta | 30.000 $BOMBERSI |
| Coleção máxima | 500 operadores |
| Trabalhando ao mesmo tempo | 15 |
| Saldo inicial de teste | 60.000 $BOMBERSI |
| Chances | Comum 55%, Raro 24%, Épico 12%, Mítico 6%, Lendário 2,5%, Super lendário 0,5% |

Os valores ficam em `client/src/state.ts` (seção "economia").

## Alojamentos e Zelador (v1.7.0)
| Item | Preço | Vagas | Recuperação |
|---|---|---|---|
| Fora de alojamento | - | ilimitado | 6/min |
| Casulo | 150.000 $BOMBERSI | 3 | 15/min |
| Módulo | 600.000 $BOMBERSI | 5 | 30/min |
| Torre | em $ASG (em breve) | 8 | 60/min |
| Droide Zelador | 1.000.000 $BOMBERSI (demo) | - | recolhe a 15%, devolve a 80% |

## Baús com HP (v1.7.0)
| Raridade | HP | Bombas (Lyra / Titan) |
|---|---|---|
| Comum | 10 | 1 / 1 |
| Raro | 20 | 2 / 2 |
| Épico | 40 | 4 / 3 |
| Mítico | 80 | 8 / 5 |
| Lendário | 160 | 16 / 9 |
| Super lendário | 320 | 32 / 18 |

Ajuste o HP em `RARITIES` e o dano em `bombDamage`, ambos em `client/src/state.ts`.

## Mapas, instâncias e dificuldade (v1.7.1, valores em `client/src/maps.ts`)
| Item | Início (mapa 1, inst. 1) | Fim (mapa 50, inst. 33) |
|---|---|---|
| Chance de um bloco soltar baú | 5% | 55% |
| HP do bloco | 10 | 89 |
| HP do inimigo comum | 20 | 148 |
| HP do MVP | 100 | 740 |
| Inimigos por instância | 2 | 6 |
| Recompensa do inimigo comum | 600 | 1.200 |

O HP acompanha o dano esperado de um operador no ponto da progressão, então o número de bombas por alvo fica parecido ao longo do jogo; o que cresce de verdade é a chance de baú.

## Salvamento (v1.7.1)
Ficam no `localStorage` (`bomber-idle:v1`): saldo, operadores (nível, XP, melhorias, stamina, quem está trabalhando), alojamentos, Zelador, missões do dia, mapa/instância/Auto. Missões reiniciam à meia-noite do aparelho.

## Classes e habilidades (Bombers Overhaul 2.0)
| Termo | Significado |
|---|---|
| Classe de combate | Papel do operador, definido pela raridade: Lyra (suporte), Titan (tanque), Vex (hacker), Kira (velocidade), Jax (samurai), Orion (híbrido) |
| Passiva / Ativa | Passiva fica sempre ligada; ativa dispara sozinha por condição, tem duração, recarga e custo |
| Recarga | Tempo até a ativa poder disparar de novo. Não é salva: ao recarregar a página volta com 30% da recarga |
| Bônus de equipe | Bônus pequeno (máx. 10%) dado por Orion a aliados próximos; não soma entre fontes |
| Alvo resistente | Baú, ou bloco com HP máximo de 20 ou mais |

Parâmetros e limites: `client/src/game/bomberConfig.ts`. Visão geral: [BOMBERS-2.0.md](BOMBERS-2.0.md).
