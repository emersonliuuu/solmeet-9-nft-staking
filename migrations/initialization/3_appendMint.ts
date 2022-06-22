import * as anchor from "@project-serum/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { PublicKey, Transaction } from "@solana/web3.js";
import { assert } from "chai";
import { IDL as nftRarityIDL } from "../../target/types/nft_rarity";
import * as nftFinanceSDK from "../../ts/v2";
import { RarityInfo } from "../../ts/v2/poolInfos";
import {
  COLLECTION_SEED,
  RARITY_SEED,
  MINT_LIST_PATH,
  connection,
} from "../0_setting";

describe("append mint to rarity info", () => {
  const wallet = NodeWallet.local();
  const options = anchor.AnchorProvider.defaultOptions();
  const provider = new anchor.AnchorProvider(connection, wallet, options);

  const rarityProgram = new anchor.Program(
    nftRarityIDL,
    nftFinanceSDK.NFT_RARITY_PROGRAM_ID,
    provider
  );

  const MINT_LIST_LIMIT = 512; // stack has 4kb limit & heap has 32kb limit

  let rawRarityInfos: nftFinanceSDK.utils.RawRarityInfo[];
  const rarityInfos: RarityInfo[] = [];

  it("Read Raw data", async () => {
    // read raw data from PATH and pack as RawRarityInfo[]
    rawRarityInfos = nftFinanceSDK.utils.readMintFromJson(
      COLLECTION_SEED,
      RARITY_SEED,
      MINT_LIST_PATH
    );

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
    }
  });

  it("append NFT mint to mint list", async () => {
    let allTxn: Transaction[] = [];

    for (let rarityInfo of rarityInfos) {
      const txn = await nftFinanceSDK.txn.appendMintToRarityInfoTxn(
        rarityInfo,
        rarityInfo.mintList,
        provider
      );
      allTxn = allTxn.concat(txn);
    }

    const resumeTxnIndex = 0; // change to the failed txn index
    await nftFinanceSDK.utils.sendAndLog(
      allTxn,
      COLLECTION_SEED + RARITY_SEED + "appendMint",
      wallet,
      provider,
      resumeTxnIndex
    );
  });

  it("check all append is correct", async () => {
    const fetchAllRarityInfo = await rarityProgram.account.rarityInfo.all();

    let count = 0;
    for (let fetchRarityInfo of fetchAllRarityInfo) {
      for (let rarityInfo of rarityInfos) {
        if (fetchRarityInfo.publicKey.equals(rarityInfo.key)) {
          assert.deepEqual(
            fetchRarityInfo.account.mintList,
            rarityInfo.mintList
          );
          count += 1;
        }
      }
    }
    assert.ok(count == rarityInfos.length);
  });
});
