import * as anchor from "@project-serum/anchor";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { hex } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { hash } from "@project-serum/anchor/dist/cjs/utils/sha256";
import { IDL as nftStakingIDL } from "../target/types/nft_staking";
import { IDL as rarityIDL } from "../target/types/nft_rarity";
import { findAssociatedTokenAddress, createATAWithoutCheckIx } from "./utils";
import { NFT_STAKING_PROGRAM_ID, NFT_RARITY_PROGRAM_ID } from "./ids";

const PROVE_TOKEN_VAULT_SEED = "prove_token_vault";
const RARITY_INFO_SEED = "rarity_info";
const NFT_VAULT_SEED = "nft_vault";
const POOL_INFO_SEED = "pool_info";

const MINT_LIST_LIMIT = 512; // stack has 4kb limit & heap has 32kb limit
const MINT_LIST_PER_BATCH = 28; // 1232 bytes transaction limit
const ATA_TX_PER_BATCH = 4;

// Rarity Program

export async function rarityInit(
  admin: PublicKey,
  collection: string,
  rarity: string,
  nonce: number,
  provider: anchor.Provider
) {
  const rarityProgram = new anchor.Program(
    rarityIDL,
    NFT_RARITY_PROGRAM_ID,
    provider
  );

  let SEED = hex.encode(
    Buffer.from(collection + rarity + nonce + RARITY_INFO_SEED)
  );
  SEED = hash(SEED.substring(2));

  const rarityInfo = await PublicKey.createWithSeed(
    admin,
    SEED.substring(0, 32),
    NFT_RARITY_PROGRAM_ID
  );

  let config = {
    basePubkey: admin,
    fromPubkey: admin,
    lamports: 115452480, // 116120640,
    newAccountPubkey: rarityInfo,
    programId: NFT_RARITY_PROGRAM_ID,
    seed: SEED.substring(0, 32),
    space: 16460, // 8 + 32 + 32 + 4 + 512*32 //16556, // 8 + 32 + 64 + 64 + 4 + 512*32
  };
  let createAccountWithSeedIx = SystemProgram.createAccountWithSeed(config);

  const rarityIntTx = rarityProgram.transaction.initialize(
    collection,
    rarity,
    new anchor.BN(nonce),
    {
      accounts: {
        admin,
        rarityInfo,
      },
      preInstructions: [createAccountWithSeedIx],
    }
  );

  return rarityIntTx;
}

export async function updateRarityInfoAdmin(
  admin: PublicKey,
  newAdmin: PublicKey,
  collection: string,
  rarity: string,
  mintList: PublicKey[],
  provider: anchor.Provider
) {
  const rarityProgram = new anchor.Program(
    rarityIDL,
    NFT_RARITY_PROGRAM_ID,
    provider
  );

  const allTx: Transaction[] = [];
  for (let batch = 0; batch < mintList.length / MINT_LIST_LIMIT; batch++) {
    let SEED = hex.encode(
      Buffer.from(collection + rarity + batch + RARITY_INFO_SEED)
    );
    SEED = hash(SEED.substring(2));

    const rarityInfo = await PublicKey.createWithSeed(
      admin,
      SEED.substring(0, 32),
      NFT_RARITY_PROGRAM_ID
    );

    const txUpdateRarityInfoAdmin = rarityProgram.transaction.updateAdmin({
      accounts: {
        admin,
        newAdmin,
        rarityInfo,
      },
    });

    allTx.push(txUpdateRarityInfoAdmin);
  }

  return allTx;
}

export async function rarityAppend(
  admin: PublicKey,
  collection: string,
  rarity: string,
  nonce: number,
  mintList: PublicKey[],
  provider: anchor.Provider
) {
  const rarityProgram = new anchor.Program(
    rarityIDL,
    NFT_RARITY_PROGRAM_ID,
    provider
  );
  let SEED = hex.encode(
    Buffer.from(collection + rarity + nonce + RARITY_INFO_SEED)
  );
  SEED = hash(SEED.substring(2));

  const rarityInfo = await PublicKey.createWithSeed(
    admin,
    SEED.substring(0, 32),
    NFT_RARITY_PROGRAM_ID
  );

  console.log(
    `Please make sure the mint list appending right now won't exceed ${MINT_LIST_LIMIT} mints in total.`
  );

  const allTx: Transaction[] = [];
  for (let batch = 0; batch < mintList.length / MINT_LIST_PER_BATCH; batch++) {
    let subMintList: PublicKey[] = [];
    if (mintList.length > MINT_LIST_PER_BATCH * (batch + 1)) {
      subMintList = mintList.slice(
        batch * MINT_LIST_PER_BATCH,
        (batch + 1) * MINT_LIST_PER_BATCH
      );
    } else {
      subMintList = mintList.slice(batch * MINT_LIST_PER_BATCH);
    }
    const appendTx = rarityProgram.transaction.appendList(subMintList, {
      accounts: {
        admin,
        rarityInfo,
      },
    });
    allTx.push(appendTx);
  }

  return allTx;
}

export async function rarityInitAndAppend(
  admin: PublicKey,
  collection: string,
  rarity: string,
  mintList: PublicKey[],
  provider: anchor.Provider
) {
  let allTx: Transaction[] = [];
  for (let batch = 0; batch < mintList.length / MINT_LIST_LIMIT; batch++) {
    let subMintList: PublicKey[] = [];
    if (mintList.length > MINT_LIST_LIMIT * (batch + 1)) {
      subMintList = mintList.slice(
        batch * MINT_LIST_LIMIT,
        (batch + 1) * MINT_LIST_LIMIT
      );
    } else {
      subMintList = mintList.slice(batch * MINT_LIST_LIMIT);
    }

    const txInit = await rarityInit(admin, collection, rarity, batch, provider);
    allTx.push(txInit);

    const txAppend = await rarityAppend(
      admin,
      collection,
      rarity,
      batch,
      subMintList,
      provider
    );
    allTx = allTx.concat(txAppend);
  }
  return allTx;
}

// Staking program

export async function nftStakingInit(
  admin: PublicKey,
  proveTokenMint: PublicKey,
  collection: string,
  rarity: string,
  nonce: number,
  provider: anchor.Provider
) {
  const NftStakingProgram = new anchor.Program(
    nftStakingIDL,
    NFT_STAKING_PROGRAM_ID,
    provider
  );
  // create rarityInfo with seed
  let SEED = hex.encode(
    Buffer.from(collection + rarity + nonce + RARITY_INFO_SEED)
  );
  SEED = hash(SEED.substring(2));

  const rarityInfo = await PublicKey.createWithSeed(
    admin,
    SEED.substring(0, 32),
    NFT_RARITY_PROGRAM_ID
  );

  // find poolInfoAccount
  const [poolInfo, _] = await PublicKey.findProgramAddress(
    [rarityInfo.toBuffer(), Buffer.from(POOL_INFO_SEED)],
    NftStakingProgram.programId
  );
  console.log(`${collection} ${rarity} poolInfo: ${poolInfo.toString()}`);

  // find admin prove token account
  const adminProveTokenAccount = await findAssociatedTokenAddress(
    admin,
    proveTokenMint
  );

  // create prove token vault (PDA & ATA)
  const [proveTokenAuthority, bump] = await PublicKey.findProgramAddress(
    [poolInfo.toBuffer(), Buffer.from(PROVE_TOKEN_VAULT_SEED)],
    NftStakingProgram.programId
  );

  const proveTokenVault = await findAssociatedTokenAddress(
    proveTokenAuthority,
    proveTokenMint
  );

  const createAtaIx = await createATAWithoutCheckIx(
    proveTokenAuthority,
    proveTokenMint,
    admin
  );

  // Initialize
  const initTx = NftStakingProgram.transaction.initialize(
    collection,
    rarity,
    new anchor.BN(nonce),
    {
      accounts: {
        admin,
        proveTokenMint,
        adminProveTokenAccount,
        proveTokenAuthority,
        proveTokenVault,
        poolInfo,
        rarityInfo,
        rarityProgram: NFT_RARITY_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      preInstructions: [createAtaIx],
    }
  );

  return initTx;
}

export async function updatePoolInfosAdmin(
  admin: PublicKey,
  newAdmin: PublicKey,
  poolInfos: PublicKey[],
  provider: anchor.Provider
) {
  anchor.setProvider(provider);
  const NftStakingProgram = new anchor.Program(
    nftStakingIDL,
    NFT_STAKING_PROGRAM_ID,
    provider
  );

  const allTx: Transaction[] = [];
  for (let poolInfo of poolInfos) {
    const txUpdatePoolInfoAdmin = NftStakingProgram.transaction.updateAdmin({
      accounts: {
        admin,
        newAdmin,
        poolInfo,
      },
    });

    allTx.push(txUpdatePoolInfoAdmin);
  }

  return allTx;
}

export async function stake(
  user: PublicKey,
  poolInfo: PublicKey,
  nftAccountList: PublicKey[],
  provider: anchor.Provider
) {
  anchor.setProvider(provider);
  const NftStakingProgram = new anchor.Program(
    nftStakingIDL,
    NFT_STAKING_PROGRAM_ID,
    provider
  );

  // fetch poolInfo
  const poolInfoAccount = await NftStakingProgram.account.poolInfo.fetch(
    poolInfo
  );

  // create user prove token ATA
  const userProveTokenAccount = await findAssociatedTokenAddress(
    user,
    poolInfoAccount.proveTokenMint
  );
  const createProveTokenAtaIx = await createATAWithoutCheckIx(
    user,
    poolInfoAccount.proveTokenMint
  );

  const createAtaIxArr: anchor.web3.TransactionInstruction[] = [];
  createAtaIxArr.push(createProveTokenAtaIx);

  const stakeTxArr: Transaction[] = [];
  for (let userNftAccount of nftAccountList) {
    const nftAccount = await getAccount(provider.connection, userNftAccount);
    const nftMint = nftAccount.mint;

    const [nftVaultAccount, _] = await PublicKey.findProgramAddress(
      [nftMint.toBuffer(), poolInfo.toBuffer(), Buffer.from(NFT_VAULT_SEED)],
      NftStakingProgram.programId
    );

    // create nft vault ATA
    let nftVaultAta = await findAssociatedTokenAddress(
      nftVaultAccount,
      nftMint
    );
    const createAtaIx = await createATAWithoutCheckIx(
      nftVaultAccount,
      nftMint,
      user
    );

    createAtaIxArr.push(createAtaIx);

    const StakeTx = NftStakingProgram.transaction.stake({
      accounts: {
        user,
        poolInfo,
        nftMint,
        userNftAccount,
        nftVaultAta,
        userProveTokenAccount,
        nftVaultAccount,
        proveTokenMint: poolInfoAccount.proveTokenMint,
        rarityInfo: poolInfoAccount.rarityInfo,
        proveTokenAuthority: poolInfoAccount.proveTokenAuthority,
        proveTokenVault: poolInfoAccount.proveTokenVault,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });
    stakeTxArr.push(StakeTx);
  }

  const createAtaTxArr: Transaction[] = [];
  let tx = new Transaction();
  for (let [index, ix] of createAtaIxArr.entries()) {
    tx.add(ix);
    if (
      (index + 1) % ATA_TX_PER_BATCH == 0 ||
      index == createAtaIxArr.length - 1
    ) {
      createAtaTxArr.push(tx);
      tx = new Transaction();
    }
  }
  const allTx = createAtaTxArr.concat(stakeTxArr);

  return allTx;
}

export async function unstake(
  user: PublicKey,
  poolInfo: PublicKey,
  nftList: PublicKey[],
  provider: anchor.Provider
) {
  anchor.setProvider(provider);
  const NftStakingProgram = new anchor.Program(
    nftStakingIDL,
    NFT_STAKING_PROGRAM_ID,
    provider
  );

  // fetch poolInfo
  const poolInfoAccount = await NftStakingProgram.account.poolInfo.fetch(
    poolInfo
  );

  // create user prove token ATA
  const userProveTokenAccount = await findAssociatedTokenAddress(
    user,
    poolInfoAccount.proveTokenMint
  );

  const unstakeTxPromises = nftList.map(async (nftMint) => {
    const [nftVaultAccount, _] = await PublicKey.findProgramAddress(
      [nftMint.toBuffer(), poolInfo.toBuffer(), Buffer.from(NFT_VAULT_SEED)],
      NftStakingProgram.programId
    );

    let userNftAccount = await findAssociatedTokenAddress(user, nftMint);
    const createAtaIx = await createATAWithoutCheckIx(user, nftMint);

    // create nft vault ATA
    let nftVaultAta = await findAssociatedTokenAddress(
      nftVaultAccount,
      nftMint
    );

    const UnstakeTx = NftStakingProgram.transaction.unstake({
      accounts: {
        user,
        poolInfo,
        nftMint,
        userNftAccount,
        nftVaultAta,
        userProveTokenAccount,
        nftVaultAccount,
        proveTokenMint: poolInfoAccount.proveTokenMint,
        rarityInfo: poolInfoAccount.rarityInfo,
        proveTokenAuthority: poolInfoAccount.proveTokenAuthority,
        proveTokenVault: poolInfoAccount.proveTokenVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      preInstructions: [createAtaIx],
    });

    return UnstakeTx;
  });

  return Promise.all(unstakeTxPromises);
}
