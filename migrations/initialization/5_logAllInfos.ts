import * as anchor from "@project-serum/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { PublicKey } from "@solana/web3.js";
import * as nftFinanceSDK from "../../ts/v2";
import { RarityInfo } from "../../ts/v2/poolInfos";
import {
  COLLECTION_SEED,
  RARITY_SEED,
  MINT_LIST_PATH,
  connection,
} from "../0_setting";

describe("log all infos", () => {
  const wallet = NodeWallet.local();
  const options = anchor.AnchorProvider.defaultOptions();
  const provider = new anchor.AnchorProvider(connection, wallet, options);

  const MINT_LIST_LIMIT = 512; // stack has 4kb limit & heap has 32kb limit

  let rawRarityInfos: nftFinanceSDK.utils.RawRarityInfo[];
  const rarityInfos: RarityInfo[] = [];

  it("Read Raw data", async () => {
    console.log(`\n\nread ${COLLECTION_SEED} data to mint list`);
    console.log(`\nStart ${COLLECTION_SEED} Initialization...\n`);

    // read raw data from PATH and pack as RawRarityInfo[]
    rawRarityInfos = nftFinanceSDK.utils.readMintFromJson(
      COLLECTION_SEED,
      RARITY_SEED,
      MINT_LIST_PATH
    );

    rawRarityInfos.map((rawRarityInfo) => {
      console.log("\ncollection:", rawRarityInfo.collection);
      console.log("rarity:", rawRarityInfo.rarity);
      console.log("amount:", rawRarityInfo.mintList.length);
    });

    console.log(`\n\nInit state for ${COLLECTION_SEED}`);

    let total = 0;
    for (let rawRarityInfo of rawRarityInfos) {
      for (
        let batch = 0;
        batch < rawRarityInfo.mintList.length / MINT_LIST_LIMIT;
        batch++
      ) {
        let subMintList: PublicKey[] = [];
        if (rawRarityInfo.mintList.length > MINT_LIST_LIMIT * (batch + 1)) {
          subMintList = rawRarityInfo.mintList.slice(
            batch * MINT_LIST_LIMIT,
            (batch + 1) * MINT_LIST_LIMIT
          );
        } else {
          subMintList = rawRarityInfo.mintList.slice(batch * MINT_LIST_LIMIT);
        }

        console.log(
          `${rawRarityInfo.collection}-${rawRarityInfo.rarity}-${batch} length: ${subMintList.length}`
        );

        const rarityInfo = new RarityInfo(
          new PublicKey(0),
          wallet.publicKey,
          rawRarityInfo.collection,
          rawRarityInfo.rarity,
          subMintList,
          batch
        );

        await rarityInfo.findKeyAndSeed();
        rarityInfos.push(rarityInfo);

        total += subMintList.length;
      }
      console.log(`total: ${total}`);
    }
  });

  it("log infos", async () => {
    const allInfos = await nftFinanceSDK.fetchAll(provider);
    let firstTime = true;
    let amount = 0;
    for (let allInfo of allInfos) {
      if (
        allInfo.rarityInfo.collection == COLLECTION_SEED &&
        allInfo.rarityInfo.rarity == RARITY_SEED
      ) {
        if (firstTime) {
          firstTime = false;
          console.log(
            `\nCollection: "${allInfo.rarityInfo.collection}"\nRarity: "${allInfo.rarityInfo.rarity}"`
          );
          console.log(
            `prove token mint: ${allInfo.poolInfo.proveTokenMint.toString()}`
          );

          console.log("pool info:");
        }

        console.log(allInfo.poolInfo.key.toString());

        amount += allInfo.rarityInfo.mintList.length;
      }
    }
    console.log("amount:", amount);
  });
});
