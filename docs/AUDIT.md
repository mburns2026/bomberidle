# Auditoria — Solana Slither.Idle (Fases 1 e 2)

Escopo lido integralmente: 17 arquivos (play/store/index.html, save/skins/api/wallet/config/i18n.js, worker.js, schema.sql, payout.mjs, wrangler.toml, README, package.json).
Método: leitura de código + **execução do worker real** contra um D1 simulado (SQLite) para provar ou descartar cada suspeita.

## 1. Problemas encontrados (versão original)

### Provados por execução
| # | Gravidade | Problema | Evidência |
|---|---|---|---|
| 1 | **Crítica** | `schema.sql` não tem as tabelas `snakes`/`gacha_log` nem as colunas `active_snake`/`afk_at`, mas o worker as usa em TODA escrita. Seguindo o README, `/sync`, `/shop`, `/gacha`, `/farm/claim` e `/withdraw` respondem **500**. | `no such column: active_snake` |
| 2 | **Crítica** | O "teto diário" (300) não era teto: `pago = bruto × (1 − hoje/300)` usa a taxa ANTES de somar. Um único claim de AFK com 8 cobras épicas após 24h pagou **1.536 (512% do teto)**. O comentário do código afirmava "nunca emite fora do CAP". | teste AFK |
| 3 | **Crítica (mainnet)** | Carteira nova ganha `START_BAL=100` e o saque mínimo é `WD_MIN=100`: criar carteiras (grátis) e sacar 100 cada, sem jogar. Faucet idem em testnet. | teste sybil |
| 4 | Alta | Gacha cobra e só depois cria a cobra, em passos separados. Falha no meio = jogador perde 400 e recebe erro. | teste de falha injetada |
| 5 | Alta | `play.html` chama `act()` (gacha, selecionar, melhorar cobra) mas ela só existe em `store.html` → `ReferenceError`; a UI de cobras do jogo não funcionava. | análise estática |
| 6 | Média | `payout.mjs`: se o script cair entre a transferência on-chain e `/admin/done`, o saque continua `pending` e **a próxima execução paga de novo**. Erro após a transmissão era tratado como falha e devolvia o saldo (risco de pagamento duplo). `--send` sem confirmação adicional. | análise de código |
| 7 | Média | Sem rate limit em nenhum endpoint (inclui `/auth/nonce`, que insere linhas ilimitadas). Comparação de `X-Admin-Key` e assinatura do token sem tempo constante. CORS devolvia a 1ª origem permitida a origens não autorizadas. | análise de código |
| 8 | Média | `/admin/failed` marcava `failed` e só depois reembolsava (se o reembolso falhasse por conflito, o dinheiro sumia); `/admin/burned` aceitava qualquer valor. | análise de código |
| 9 | Baixa | 7 chaves de i18n sem tradução (UI de farm/cobras em português fixo para todos). Upgrade "soma 30% da taxa base" no comentário, mas o código compunha sobre a taxa atual. Sem nível máximo. | script de varredura |

### Suspeitos NÃO reproduzidos (não afirmo que existam)
Corridas em saque (limite diário), upgrade (preço antigo) e gacha (saldo para 1) em requisições paralelas **não se manifestaram** no simulador. O código lia→decidia→gravava em passos separados, então o risco é plausível em produção, mas não está provado. A v2 elimina o padrão por desenho (ver §2) e os testes ficam como guarda de regressão.

### Limitações que continuam (por natureza, não corrigidas)
- O navegador informa moedas/abates: o servidor só **limita** por tempo real e teto (`sus` registra sinais). Não existe prova de que a moeda foi comida. Só o PvP servidor-autoritativo (Fase 5) resolve isso.
- Boost pago é "honor system" do cliente (`paidBoost` informado por ele).
- Skins com `magnet` dão bônus de gameplay calculado no cliente (9 skins; ver Fase 3/4).

## 2. O que a Fase 2 mudou (worker.js v2)
- **Atomicidade:** `mutate()` grava jogador + livro-caixa + estatísticas + linhas dependentes num único `DB.batch` (transação), com versão otimista e *guards* SQL avaliados junto do UPDATE (limite diário de saque, nível da cobra).
- **Livro-caixa (`ledger`)** em toda mutação; invariante testado: `SUM(delta) == saldo`.
- **Teto rígido** (`min(pago, CAP − hoje)`); **cota AFK = 40% do teto** (`AFK_SHARE`).
- **Saque:** só sai o que foi *ganho jogando* (`earned_u − wd_total_u`); bônus inicial (só testnet) e faucet não são sacáveis; idade mínima da conta (24h); limite diário atômico; contas com `sus ≥ 5` vão para `review` (revisão humana, nunca punição automática).
- **Fluxo de pagamento:** `pending → processing → sent | failed`; reembolso uma única vez (índice único no ledger); queima limitada ao pendente.
- **Idempotência** (`Idempotency-Key`) e **rate limit** em D1; comparações em tempo constante; CORS estrito.
- Upgrade linear sobre taxa base + nível máx. 10; sorteio do gacha com `crypto`.

## 3. Parâmetros alterados (precisam de validação na Fase 6)
`AFK_SHARE=0.4`, `UPG_MAX_LVL=10`, upgrade linear, `WD_MIN_AGE_H=24`, `START_BAL` só em testnet. **São decisões de design minhas, não resultado de simulação econômica** — a ferramenta de simulação (Fase 6) ainda não existe. Valores originais (CAP 300, preços, WD 100/1000…) foram mantidos.

## 4. Pendências reais (não feitas)
Fase 3 (render HD/curvas/DPR/câmera), Fase 4 (gameplay/missões), Fase 5 (multiplayer: **exige Durable Objects**, D1 não mantém conexões), Fase 6 (simulador econômico, monetização, validação on-chain), Fase 7 (UI/acessibilidade), Fase 8 (E2E em navegador). Nada disso foi testado com carteira Phantom real, Cloudflare real nem Solana devnet real (sem rede/credenciais neste ambiente).
