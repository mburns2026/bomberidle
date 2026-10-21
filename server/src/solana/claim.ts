import { createHash } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";

const discriminator = (name: string) =>
  createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);

const u64 = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};

export interface ClaimEnv {
  connection: Connection;
  programId: PublicKey;
  rewardMint: PublicKey;
  serverAuthority: Keypair;
}

const claimPda = (programId: PublicKey, user: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("claim"), user.toBuffer()], programId)[0];

/**
 * Ultimo nonce que o programa registrou para este jogador (0 se ele nunca sacou).
 * Layout da conta UserClaim: 8 bytes de discriminador + user (32) + last_nonce (u64 LE).
 * O servidor guarda o nonce so em memoria; sem consultar a cadeia, um reinicio faria
 * todo saque falhar com InvalidNonce.
 */
export async function fetchLastNonce(env: ClaimEnv, user: PublicKey): Promise<bigint> {
  const info = await env.connection.getAccountInfo(claimPda(env.programId, user));
  if (!info || info.data.length < 8 + 32 + 8) return 0n;
  return info.data.readBigUInt64LE(8 + 32);
}

/**
 * Monta a transacao de claim ja assinada pelo servidor.
 * O jogador so precisa assinar e enviar (ele paga as taxas).
 */
export async function buildClaimTx(
  env: ClaimEnv,
  user: PublicKey,
  amount: bigint,
  nonce: bigint
): Promise<string> {
  const { programId, rewardMint, serverAuthority, connection } = env;
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault")], programId);
  const userClaim = claimPda(programId, user);
  const userToken = getAssociatedTokenAddressSync(rewardMint, user);

  // A ordem das contas deve seguir a struct `Claim` do programa.
  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: userClaim, isSigner: false, isWritable: true },
      { pubkey: userToken, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: serverAuthority.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([discriminator("claim"), u64(amount), u64(nonce)]),
  });

  // Cria a conta de token do jogador se ela ainda nao existir (idempotente); sem isso o primeiro saque falha.
  const createAta = createAssociatedTokenAccountIdempotentInstruction(user, userToken, user, rewardMint);

  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: user, recentBlockhash: blockhash }).add(createAta, ix);
  tx.partialSign(serverAuthority);
  return tx.serialize({ requireAllSignatures: false }).toString("base64");
}
