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

  it("general pool info", async () => {
    // find poolInfoAccount
    poolInfoKey = await nftFinanceSDK.getPoolInfoKeyFromSeed(
      wallet.publicKey,
      COLLECTION_SEED,
      RARITY_SEED,
      0
    );
  });

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
    const pairs = await nftFinanceSDK.rarityFilter(nftMintList, provider);

    const pairsClassify: Classify[] = [];
    for (let pair of pairs) {
      const nftTokenAccount = await findAssociatedTokenAddress(
        wallet.publicKey,
        pair.mint
      );
      const target = pairsClassify.filter((item) =>
        item.poolInfoKey.equals(pair.poolInfoKey)
      );
      if (target.length == 0) {
        pairsClassify.push({
          poolInfoKey: pair.poolInfoKey,
          NftTokenAccountList: [nftTokenAccount],
        });
      } else {
        target[0].NftTokenAccountList.push(nftTokenAccount);
      }
    }

    for (let classify of pairsClassify) {
      console.log(`poolInfo: ${classify.poolInfoKey.toString()}`);
      const stakeTxn = await nftFinanceSDK.stake(
        wallet.publicKey,
        classify.poolInfoKey,
        classify.NftTokenAccountList,
        provider
      );
      for (let txn of stakeTxn) {
        const result = await provider.sendAndConfirm(txn, [wallet.payer]);
        console.log("<Stake>", result);
      }
    }
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
    const userStakedNft = await nftFinanceSDK.getStakedNFTMint(
      wallet.publicKey,
      provider
    );

    const pairsClassify: Classify[] = [];
    for (let pair of userStakedNft) {
      const target = pairsClassify.filter((item) =>
        item.poolInfoKey.equals(pair.poolInfoKey)
      );
      if (target.length == 0) {
        pairsClassify.push({
          poolInfoKey: pair.poolInfoKey,
          NftTokenAccountList: [pair.nftMint],
        });
      } else {
        target[0].NftTokenAccountList.push(pair.nftMint);
      }
    }

    for (let classify of pairsClassify) {
      const unstakeTxn = await nftFinanceSDK.unstake(
        wallet.publicKey,
        classify.poolInfoKey,
        classify.NftTokenAccountList,
        provider
      );
      for (let txn of unstakeTxn) {
        const result = await provider.sendAndConfirm(txn, [wallet.payer]);
        console.log("<Unstake>", result);
      }
    }
  });
});
