import * as anchor from "@project-serum/anchor";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createATAWithoutCheckIx } from "./utils";
import { NFT_RARITY_PROGRAM_ID } from "./ids";
import { PoolInfo, RarityInfo } from "./poolInfos";
import * as ix from "./instruction";

const ATA_TX_PER_BATCH = 4;

enum StakeIxStatus {
  createUserProveTokenAtaIx,
  createNFTVaultAtaIx,
  stakeIx,
}
// Rarity Program

export async function initiateRarityInfoTxn(
  rarityInfo: RarityInfo,
  provider: anchor.AnchorProvider
) {
  await rarityInfo.findKeyAndSeed();

  let config = {
    basePubkey: rarityInfo.admin,
    fromPubkey: rarityInfo.admin,
    lamports: 115452480,
    newAccountPubkey: rarityInfo.key,
    programId: NFT_RARITY_PROGRAM_ID,
    seed: rarityInfo.seed.substring(0, 32),
    space: 16460, // 8 + 32 + 16 + 16 + 4 + 512*32
  };
  let createAccountWithSeedIx = SystemProgram.createAccountWithSeed(config);

  const initiateRarityInfoIx = await ix.initiateRarityInfoIx(
    rarityInfo,
    provider
  );
  const txn = new Transaction();
  txn.add(createAccountWithSeedIx);
  txn.add(initiateRarityInfoIx);
  return txn;
}

export async function updateRarityInfoAdminTxn(
  rarityInfo: RarityInfo,
  newAdmin: PublicKey,
  provider: anchor.AnchorProvider
) {
  const txn = new Transaction();
  const updateRarityInfoAdminIx = await ix.updateRarityInfoAdminIx(
    rarityInfo,
    newAdmin,
    provider
  );
  txn.add(updateRarityInfoAdminIx);
  return txn;
}

export async function appendMintToRarityInfoTxn(
  rarityInfo: RarityInfo,
  mintList: PublicKey[],
  provider: anchor.AnchorProvider
) {
  const allTxn: Transaction[] = [];
  const appendMintToRarityInfoIxArr = await ix.appendMintToRarityInfoIx(
    rarityInfo,
    mintList,
    provider
  );
  for (let instruction of appendMintToRarityInfoIxArr) {
    const txn = new Transaction();
    txn.add(instruction);
    allTxn.push(txn);
  }

  return allTxn;
}

// Staking program

export async function initiatePoolInfoTxn(
  poolInfo: PoolInfo,
  rarityInfo: RarityInfo,
  provider: anchor.AnchorProvider
) {
  if (!rarityInfo.key.equals(poolInfo.rarityInfo)) {
    await rarityInfo.findKeyAndSeed();
  } else {
    await rarityInfo.findNonceAndSeed();
  }
  await poolInfo.findKeyAndAuthorityAndVault();

  const createAtaIx = await createATAWithoutCheckIx(
    poolInfo.proveTokenAuthority,
    poolInfo.proveTokenMint,
    poolInfo.admin
  );

  // Initialize
  const initiatePoolInfoIx = await ix.initiatePoolInfoIx(
    poolInfo,
    rarityInfo,
    provider
  );

  const txn = new Transaction();
  txn.add(createAtaIx);
  txn.add(initiatePoolInfoIx);

  return txn;
}

export async function updatePoolInfoAdminTxn(
  newAdmin: PublicKey,
  poolInfo: PoolInfo,
  provider: anchor.AnchorProvider
) {
  const updatePoolInfoAdminIx = await ix.updatePoolInfoAdminIx(
    newAdmin,
    poolInfo,
    provider
  );
  const txn = new Transaction();
  txn.add(updatePoolInfoAdminIx);

  return txn;
}

export async function stakeTxn(
  poolInfo: PoolInfo,
  user: PublicKey,
  userNftAccountList: PublicKey[],
  provider: anchor.AnchorProvider
) {
  const ixArr: anchor.web3.TransactionInstruction[] = [];
  const createAtaTxnArr: Transaction[] = [];
  const stakeTxnArr: Transaction[] = [];
  for (let [index, userNftAccount] of userNftAccountList.entries()) {
    const StakeIxArr = await ix.stakeIx(
      poolInfo,
      user,
      userNftAccount,
      provider
    );
    if (index == 0) {
      ixArr.push(StakeIxArr[StakeIxStatus.createUserProveTokenAtaIx]);
    }
    ixArr.push(StakeIxArr[StakeIxStatus.createNFTVaultAtaIx]);
    const stakeTx = new Transaction();
    stakeTx.add(StakeIxArr[StakeIxStatus.stakeIx]);
    stakeTxnArr.push(stakeTx);
  }
  let txn = new Transaction();
  for (let [index, instruction] of ixArr.entries()) {
    txn.add(instruction);
    if ((index + 1) % ATA_TX_PER_BATCH == 0 || index == ixArr.length - 1) {
      createAtaTxnArr.push(txn);
      txn = new Transaction();
    }
  }

  const allTxn = createAtaTxnArr.concat(stakeTxnArr);

  return allTxn;
}

export async function unstakeTxn(
  poolInfo: PoolInfo,
  user: PublicKey,
  nftMintList: PublicKey[],
  provider: anchor.AnchorProvider
) {
  const allTxn: Transaction[] = [];

  for (let nftMint of nftMintList) {
    const createAtaIx = await createATAWithoutCheckIx(user, nftMint);
    const unstakeIx = await ix.unstakeIx(poolInfo, user, nftMint, provider);
    const txn = new Transaction();
    txn.add(createAtaIx);
    txn.add(unstakeIx);
    allTxn.push(txn);
  }

  return allTxn;
}
