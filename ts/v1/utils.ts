import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  Connection,
  SYSVAR_RENT_PUBKEY,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { ATA_INIT_PROGRAM_ID } from "./ids";
import * as fs from "fs";

export class Category {
  public admin: PublicKey;
  public adminProveTokenAta: PublicKey;

  public collection: string;
  public rarity: string;
  public mintList: PublicKey[];
  public proveTokenMint: PublicKey;
  public numberOfPool: number;
  public poolInfos: PublicKey[];
  public farmInfos: PublicKey[];
  public farmTokenMint: PublicKey;
  public farmAuthority: PublicKey;
  public rewardVault: PublicKey;

  constructor(collection: string, rarity: string) {
    this.collection = collection;
    this.rarity = rarity;
    this.mintList = [];
    this.poolInfos = [];
    this.farmInfos = [];
  }
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

export async function signAndSendAll(
  allTx: Transaction,
  connection: Connection,
  wallet: Keypair[]
): Promise<string> {
  const walletPublicKey = wallet[0].publicKey;
  const tx = new Transaction();
  tx.add(allTx);
  const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.recentBlockhash = recentBlockhash;
  tx.feePayer = walletPublicKey;
  const result = sendAndConfirmTransaction(connection, tx, wallet);
  return result;
}

export function readDapgJson(path: fs.PathOrFileDescriptor): Category[] {
  const categoryList: Category[] = [];
  const DAPG_SEED = "DappieGang";
  categoryList.push(new Category(DAPG_SEED, "common"));
  categoryList.push(new Category(DAPG_SEED, "legendaryZombie"));
  categoryList.push(new Category(DAPG_SEED, "legendaryPattern"));
  categoryList.push(new Category(DAPG_SEED, "legendaryRobot"));
  categoryList.push(new Category(DAPG_SEED, "legendaryAlien"));
  categoryList.push(new Category(DAPG_SEED, "genesis"));

  const rawData = fs.readFileSync(path, "utf-8");
  const data: nftMint[] = JSON.parse(rawData);
  data.forEach((element) => {
    const body = element.attributes.find((f) => f.trait_type === "body")!;
    const genesis = element.attributes.find((f) => f.trait_type === "genesis")!;

    let trait: string;
    if (genesis.value !== "none") {
      trait = "genesis";
    } else if (body.value.includes("alien")) {
      trait = "legendaryAlien";
    } else if (body.value.includes("robot")) {
      trait = "legendaryRobot";
    } else if (body.value.includes("pattern")) {
      trait = "legendaryPattern";
    } else if (body.value.includes("zombie")) {
      trait = "legendaryZombie";
    } else {
      trait = "common";
    }

    for (let target of categoryList) {
      if (target.rarity == trait) {
        target.mintList.push(new PublicKey(element.mint));
        break;
      }
    }
  });

  return categoryList;
}
