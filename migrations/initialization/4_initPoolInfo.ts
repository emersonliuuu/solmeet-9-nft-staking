import * as anchor from "@project-serum/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { PublicKey, Transaction } from "@solana/web3.js";
import { createMint, mintTo, getAccount } from "@solana/spl-token";
import { assert } from "chai";
import { IDL as nftStakingIDL } from "../../target/types/nft_staking";
import {
  findAssociatedTokenAddress,
  createATAWithoutCheckIx,
} from "../../ts/v2/utils";
import * as nftFinanceSDK from "../../ts/v2";
import { PoolInfo, RarityInfo } from "../../ts/v2/poolInfos";
import {
  COLLECTION_SEED,
  RARITY_SEED,
  MINT_LIST_PATH,
  connection,
} from "../0_setting";

describe("initialize pool info", () => {
  const wallet = NodeWallet.local();
  const options = anchor.AnchorProvider.defaultOptions();
  const provider = new anchor.AnchorProvider(connection, wallet, options);

  const stakingProgram = new anchor.Program(
    nftStakingIDL,
    nftFinanceSDK.NFT_STAKING_PROGRAM_ID,
    provider
  );

  const MINT_LIST_LIMIT = 512; // stack has 4kb limit & heap has 32kb limit

  let rawRarityInfos: nftFinanceSDK.utils.RawRarityInfo[];
  const rarityInfos: RarityInfo[] = [];
  const poolInfos: PoolInfo[] = [];
  let proveTokenMintList: PublicKey[] = [];

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

        rarityInfo.findKeyAndSeed();
        rarityInfos.push(rarityInfo);

        total += subMintList.length;
      }
    }
  });

  it("create mint and mint to wallet", async () => {
    const ixArr: anchor.web3.TransactionInstruction[] = [];
    for (let [index, rawRarityInfo] of rawRarityInfos.entries()) {
      // create Mint, comment out if mint is created.
      const proveTokenMint = await createMint(
        provider.connection,
        wallet.payer,
        wallet.publicKey,
        null,
        0
      );
      proveTokenMintList.push(proveTokenMint);

      // if transaction failed, can hard code right here.
      // proveTokenMintList = [new PublicKey(0)];

      ixArr.push(
        await createATAWithoutCheckIx(
          wallet.publicKey,
          proveTokenMintList[index]
        )
      );

      console.log(
        `\ncollection:, ${rawRarityInfo.collection}, rarity: ${rawRarityInfo.rarity}`
      );
      console.log("amount:", rawRarityInfo.mintList.length);
      console.log("prove token mint:", proveTokenMintList[index].toString());
    }

    let txAta = new Transaction();
    for (let [index, ix] of ixArr.entries()) {
      txAta.add(ix);
      if (index % 4 == 0 || index == ixArr.length - 1) {
        const result = await provider.sendAndConfirm(txAta, [wallet.payer]);
        console.log("<create ATA>", result);
        txAta = new Transaction();
      }
    }

    for (let [index, rawRarityInfo] of rawRarityInfos.entries()) {
      const proveTokenMint = proveTokenMintList[index];
      // comment below if successfully minted.
      const walletProveTokenAta = await findAssociatedTokenAddress(
        wallet.publicKey,
        proveTokenMint
      );
      await mintTo(
        provider.connection,
        wallet.payer,
        proveTokenMint,
        walletProveTokenAta,
        wallet.payer,
        rawRarityInfo.mintList.length
      );

      let _walletProveTokenAta = await getAccount(
        provider.connection,
        walletProveTokenAta
      );

      console.log(
        `${rawRarityInfo.collection}, ${rawRarityInfo.rarity} mint: ${Number(
          _walletProveTokenAta.amount
        )}`
      );

      assert.ok(
        Number(_walletProveTokenAta.amount) == rawRarityInfo.mintList.length
      );
    }
  });

  it("initialize pool info", async () => {
    let allTxn: Transaction[] = [];

    for (let [index, rawRarityInfo] of rawRarityInfos.entries()) {
      for (let rarityInfo of rarityInfos) {
        const proveTokenMint = proveTokenMintList[index];
        if (
          rarityInfo.collection == rawRarityInfo.collection &&
          rarityInfo.rarity == rawRarityInfo.rarity
        ) {
          console.log(
            `${rarityInfo.collection}-${rarityInfo.rarity}-${rarityInfo.nonce}-${rarityInfo.mintList.length}`
          );

          const poolInfo = new PoolInfo(
            new PublicKey(0),
            wallet.publicKey,
            proveTokenMint,
            rarityInfo.key
          );

          await poolInfo.findKeyAndAuthorityAndVault();

          const txn = await nftFinanceSDK.txn.initiatePoolInfoTxn(
            poolInfo,
            rarityInfo,
            provider
          );
          allTxn = allTxn.concat(txn);
        }
      }
    }

    const resumeTxnIndex = 0; // change to the failed txn index
    await nftFinanceSDK.utils.sendAndLog(
      allTxn,
      COLLECTION_SEED + RARITY_SEED + "initializePoolInfo",
      wallet,
      provider,
      resumeTxnIndex
    );
  });

  it("check all pool info is correct", async () => {
    const fetchAllPoolInfo = await stakingProgram.account.poolInfo.all();

    let count = 0;
    for (let fetchPoolInfo of fetchAllPoolInfo) {
      for (let poolInfo of poolInfos) {
        if (fetchPoolInfo.publicKey.equals(poolInfo.key)) {
          assert.ok(
            fetchPoolInfo.account.proveTokenMint.equals(poolInfo.proveTokenMint)
          );
          assert.ok(
            fetchPoolInfo.account.rarityInfo.equals(poolInfo.rarityInfo)
          );
          assert.ok(
            fetchPoolInfo.account.proveTokenAuthority.equals(
              poolInfo.proveTokenAuthority
            )
          );
          assert.ok(
            fetchPoolInfo.account.proveTokenVault.equals(
              poolInfo.proveTokenVault
            )
          );

          const proveTokenVault = await getAccount(
            connection,
            poolInfo.proveTokenVault
          );
          assert.ok(
            Number(proveTokenVault.amount) ==
              fetchPoolInfo.account.mintListLength
          );
          count += 1;
        }
      }
    }
    assert.ok(count == poolInfos.length);
  });
});
