import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import { AnchorProvider } from "@project-serum/anchor";
const ATA_INIT_PROGRAM_ID = new PublicKey(
  "9tiP8yZcekzfGzSBmp7n9LaDHRjxP2w7wJj8tpPJtfG"
);

export class RawRarityInfo {
  constructor(
    public collection: string,
    public rarity: string,
    public mintList: PublicKey[] = []
  ) {}
}

interface nftMint {
  mint: string;
  url: string;
  name: string;
  attributes: attribute[];
}
interface attribute {
  trait_type: string;
  value: string;
}

export async function findAssociatedTokenAddress(
  walletAddress: PublicKey,
  tokenMintAddress: PublicKey
): Promise<PublicKey> {
  return (
    await PublicKey.findProgramAddress(
      [
        walletAddress.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        tokenMintAddress.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  )[0];
}

export async function createATAWithoutCheckIx(
  wallet: PublicKey,
  mint: PublicKey,
  payer?: PublicKey
): Promise<TransactionInstruction> {
  if (payer === undefined) {
    payer = wallet as PublicKey;
  }
  payer = payer as PublicKey;
  const ATA = await findAssociatedTokenAddress(wallet, mint);
  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: ATA, isSigner: false, isWritable: true },
    { pubkey: wallet, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({
    keys,
    programId: ATA_INIT_PROGRAM_ID,
  });
}

export function readMintFromJson(
  COLLECTION_SEED: string,
  RARITY_SEED: string,
  path: fs.PathOrFileDescriptor
) {
  const rawRarityInfo = [new RawRarityInfo(COLLECTION_SEED, RARITY_SEED)];

  const rawData = fs.readFileSync(path, "utf-8");
  const data: string[] = JSON.parse(rawData);
  data.forEach((element) => {
    rawRarityInfo[0].mintList.push(new PublicKey(element));
  });

  return rawRarityInfo;
}

export async function sendAndLog(
  txs: Transaction[],
  fileName: string,
  wallet: NodeWallet,
  provider: AnchorProvider,
  startIndex = 0
) {
  for (let [index, tx] of txs.entries()) {
    if (index >= startIndex) {
      tx.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      tx.feePayer = wallet.publicKey;

      fs.appendFileSync(`output/${fileName}.txt`, `index: ${index}\n`);
      fs.appendFileSync(`output/${fileName}.txt`, "base64:\n");
      fs.appendFileSync(
        `output/${fileName}.txt`,
        tx.serializeMessage().toString("base64") + "\n\n"
      );
      fs.appendFileSync(`output/${fileName}.txt`, "hex:\n");
      fs.appendFileSync(
        `output/${fileName}.txt`,
        tx.serializeMessage().toString("hex") + "\n\n"
      );

      const result = await provider.sendAndConfirm(tx, [wallet.payer]);
      console.log(`<${fileName}> ${result}`);
      fs.appendFileSync(`output/${fileName}.txt`, result);
      fs.appendFileSync(
        `output/${fileName}.txt`,
        "\n---------------------------------\n"
      );
    }
  }
}
