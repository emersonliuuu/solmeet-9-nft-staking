import * as anchor from "@project-serum/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import { findAssociatedTokenAddress } from "../../ts/v2/utils";
import * as nftFinanceSDK from "../../ts/v2";
import { AllInfo } from "../../ts/v2/poolInfos";
import {
  COLLECTION_SEED,
  RARITY_SEED,
  MINT_LIST_PATH,
  connection,
} from "../0_setting";

describe("nft staking v2", () => {
  const wallet = NodeWallet.local();
  const options = anchor.AnchorProvider.defaultOptions();
  const provider = new anchor.AnchorProvider(connection, wallet, options);
  anchor.setProvider(provider);

  interface Classify {
    allInfo: AllInfo;
    NftTokenAccountList: PublicKey[];
  }

  let allInfos: AllInfo[];
  let nftMintList: PublicKey[] = [];

  it("read nft mint", async () => {
    const rawData = fs.readFileSync(MINT_LIST_PATH, "utf-8");
    const data: string[] = JSON.parse(rawData);
    data.forEach((element) => {
      nftMintList.push(new PublicKey(element));
    });
  });

  it("staked status: before stake", async () => {
    allInfos = await nftFinanceSDK.fetchAll(provider);
    console.log("staked status: before stake");

    const percentage = nftFinanceSDK.getStakedPercentage(
      allInfos,
      COLLECTION_SEED
    );
    console.log(`staking rate: ${percentage * 100}%`);
    const amount = nftFinanceSDK.getStakedAmount(allInfos, COLLECTION_SEED);
    console.log(`# of nft staked: ${amount}`);
  });

  it("stake nft", async () => {
    const pairs = nftFinanceSDK.infoAndNftMatcher(allInfos, nftMintList);

    const pairsClassify: Classify[] = [];
    for (let pair of pairs) {
      const nftTokenAccount = await findAssociatedTokenAddress(
        wallet.publicKey,
        pair.nftMint
      );
      const target = pairsClassify.filter((item) =>
        item.allInfo.poolInfo.key.equals(pair.allInfo.poolInfo.key)
      );
      if (target.length == 0) {
        pairsClassify.push({
          allInfo: pair.allInfo,
          NftTokenAccountList: [nftTokenAccount],
        });
      } else {
        target[0].NftTokenAccountList.push(nftTokenAccount);
      }
    }

    for (let classify of pairsClassify) {
      const stakeTxn = await nftFinanceSDK.txn.stakeTxn(
        classify.allInfo.poolInfo,
        wallet.publicKey,
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
    allInfos = await nftFinanceSDK.fetchAll(provider);

    const percentage = nftFinanceSDK.getStakedPercentage(
      allInfos,
      COLLECTION_SEED
    );
    console.log(`staking rate: ${percentage * 100}%`);
    const amount = nftFinanceSDK.getStakedAmount(allInfos, COLLECTION_SEED);
    console.log(`# of nft staked: ${amount}`);
  });

  it("get user info", async () => {
    const userInfo = await nftFinanceSDK.fetchUser(wallet.publicKey, provider);

    console.log(`user address: ${userInfo.wallet.toString()}`);
    console.log(`# of user staked nft: ${userInfo.staked.length}`);
  });

  it("unstake nft", async () => {
    const userInfo = await nftFinanceSDK.fetchUser(wallet.publicKey, provider);
    const pairsClassify: Classify[] = [];
    for (let pair of userInfo.staked) {
      const target = pairsClassify.filter((item) =>
        item.allInfo.poolInfo.key.equals(pair.poolInfoKey)
      );
      if (target.length == 0) {
        pairsClassify.push({
          allInfo: nftFinanceSDK.getAllInfoFromPoolInfoKey(
            allInfos,
            pair.poolInfoKey
          ),
          NftTokenAccountList: [pair.nftMint],
        });
      } else {
        target[0].NftTokenAccountList.push(pair.nftMint);
      }
    }

    for (let classify of pairsClassify) {
      const unstakeTxn = await nftFinanceSDK.txn.unstakeTxn(
        classify.allInfo.poolInfo,
        wallet.publicKey,
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
