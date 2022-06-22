import * as anchor from "@project-serum/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import { findAssociatedTokenAddress } from "../../ts/v1/utils";
import * as nftFinanceSDK from "../../ts/v1";
import {
  COLLECTION_SEED,
  RARITY_SEED,
  MINT_LIST_PATH,
  connection,
} from "../0_setting";

describe("nft staking v1", () => {
  const wallet = NodeWallet.local();
  const options = anchor.AnchorProvider.defaultOptions();
  const provider = new anchor.AnchorProvider(connection, wallet, options);
  anchor.setProvider(provider);

  interface Classify {
    poolInfoKey: PublicKey;
    NftTokenAccountList: PublicKey[];
  }

  let poolInfoKey: PublicKey;
  let poolInfos: PublicKey[];
  let nftMintList: PublicKey[] = [];

  it("read nft mint", async () => {
    const rawData = fs.readFileSync(MINT_LIST_PATH, "utf-8");
    const data: string[] = JSON.parse(rawData);
    data.forEach((element) => {
      nftMintList.push(new PublicKey(element));
    });
  });

  it("staked status: before stake", async () => {
    console.log("staked status: before stake");

    const poolInfos = await nftFinanceSDK.getPoolInfo([poolInfoKey], provider);

    console.log(
      `staking rate: ${(poolInfos[0].totalLocked / nftMintList.length) * 100}%`
    );
    console.log(`# of nft staked: ${poolInfos[0].totalLocked}`);
  });

  it("stake nft", async () => {
    // TODO
  });

  it("staked status: after stake", async () => {
    console.log("staked status: after stake");

    const poolInfos = await nftFinanceSDK.getPoolInfo([poolInfoKey], provider);

    console.log(
      `staking rate: ${(poolInfos[0].totalLocked / nftMintList.length) * 100}%`
    );
    console.log(`# of nft staked: ${poolInfos[0].totalLocked}`);
  });

  it("unstake nft", async () => {
    // TODO
  });
});
