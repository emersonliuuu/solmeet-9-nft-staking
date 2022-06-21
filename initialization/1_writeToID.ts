import * as anchor from "@project-serum/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import { findAssociatedTokenAddress } from "../ts-v1/utils";
import * as nftFinanceSDK from "../ts-v1";
import {
  COLLECTION_SEED,
  RARITY_SEED,
  MINT_LIST_PATH,
  connection,
} from "./0_setting";
import { hex } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { hash } from "@project-serum/anchor/dist/cjs/utils/sha256";
import { NFT_RARITY_PROGRAM_ID, NFT_STAKING_PROGRAM_ID } from "../ts-v1";

describe("write pool info to ids.ts", () => {
  const wallet = NodeWallet.local();
  const options = anchor.AnchorProvider.defaultOptions();
  const provider = new anchor.AnchorProvider(connection, wallet, options);
  anchor.setProvider(provider);

  const MINT_LIST_LIMIT = 512;

  let poolInfoKey: PublicKey;
  let poolInfoKeyList: PublicKey[] = [];
  let nftMintList: PublicKey[] = [];

  it("read nft mint", async () => {
    const rawData = fs.readFileSync(MINT_LIST_PATH, "utf-8");
    const data: string[] = JSON.parse(rawData);
    data.forEach((element) => {
      nftMintList.push(new PublicKey(element));
    });
  });

  it("general and write pool info to id", async () => {
    const numberOfPoolInfo = Math.ceil(nftMintList.length / MINT_LIST_LIMIT);
    for (let index = 0; index < numberOfPoolInfo; index++) {
      let SEED = hex.encode(
        Buffer.from(COLLECTION_SEED + RARITY_SEED + index + "rarity_info")
      );
      SEED = hash(SEED.substring(2));

      const rarityInfo = await PublicKey.createWithSeed(
        wallet.publicKey,
        SEED.substring(0, 32),
        NFT_RARITY_PROGRAM_ID
      );

      // find poolInfoAccount
      poolInfoKey = (
        await PublicKey.findProgramAddress(
          [rarityInfo.toBuffer(), Buffer.from("pool_info")],
          NFT_STAKING_PROGRAM_ID
        )
      )[0];

      poolInfoKeyList.push(poolInfoKey);
    }

    fs.appendFileSync("./ts-v1/ids.ts", `\nexport const ALL_POOL_INFOS = [`);
    for (let _poolInfoKey of poolInfoKeyList) {
      fs.appendFileSync(
        "./ts-v1/ids.ts",
        `\n  new PublicKey("${poolInfoKey.toString()}"),`
      );
    }
    fs.appendFileSync("./ts-v1/ids.ts", `\n];`);
  });
});
