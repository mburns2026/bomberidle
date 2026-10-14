import { createHash } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

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
  const [userClaim] = PublicKey.findProgramAddressSync(
    [Buffer.from("claim"), user.toBuffer()],
    programId
  );
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

  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: user, recentBlockhash: blockhash }).add(ix);
  tx.partialSign(serverAuthority);
  return tx.serialize({ requireAllSignatures: false }).toString("base64");
}
