import * as anchor from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { IDL as nftStakingIDL } from "../target/types/nft_staking";
import { IDL as nftRarityIDL } from "../target/types/nft_rarity";
import { findAssociatedTokenAddress, createATAWithoutCheckIx } from "./utils";
import { NFT_STAKING_PROGRAM_ID, NFT_RARITY_PROGRAM_ID } from "./ids";
import { PoolInfo, RarityInfo } from "./poolInfos";

const NFT_VAULT_SEED = "nft_vault";

const MINT_LIST_LIMIT = 512; // stack has 4kb limit & heap has 32kb limit
const MINT_LIST_PER_BATCH = 28; // 1232 bytes transaction limit

// Rarity Program

export async function initiateRarityInfoIx(
  rarityInfo: RarityInfo,
  provider: anchor.AnchorProvider
) {
  const nftRarityProgram = new anchor.Program(
    nftRarityIDL,
    NFT_RARITY_PROGRAM_ID,
    provider
  );

  const rarityIntIx = await nftRarityProgram.methods
    .initialize(
      rarityInfo.collection,
      rarityInfo.rarity,
      new anchor.BN(rarityInfo.nonce)
    )
    .accounts({
      admin: rarityInfo.admin,
      rarityInfo: rarityInfo.key,
    })
    .instruction();

  return rarityIntIx;
}

export async function updateRarityInfoAdminIx(
  rarityInfo: RarityInfo,
  newAdmin: PublicKey,
  provider: anchor.AnchorProvider
) {
  const nftRarityProgram = new anchor.Program(
    nftRarityIDL,
    NFT_RARITY_PROGRAM_ID,
    provider
  );

  const updateRarityInfoAdminIx = await nftRarityProgram.methods
    .updateAdmin()
    .accounts({
      admin: rarityInfo.admin,
      newAdmin,
      rarityInfo: rarityInfo.key,
    })
    .instruction();

  return updateRarityInfoAdminIx;
}

export async function appendMintToRarityInfoIx(
  rarityInfo: RarityInfo,
  mintList: PublicKey[],
  provider: anchor.AnchorProvider
) {
  const nftRarityProgram = new anchor.Program(
    nftRarityIDL,
    NFT_RARITY_PROGRAM_ID,
    provider
  );

  if (rarityInfo.mintList.length + mintList.length <= MINT_LIST_LIMIT) {
    console.log(
      `Already have ${rarityInfo.mintList.length} mints in list, append ${
        mintList.length
      } mints now. (${
        rarityInfo.mintList.length + mintList.length
      } mints in total)`
    );
  } else {
    console.log(
      `WARNING: ${rarityInfo.mintList.length}(on-chain) + ${
        mintList.length
      }(append) = ${
        rarityInfo.mintList.length + mintList.length
      } > ${MINT_LIST_LIMIT}(limit), transaction might failed!`
    );
  }

  const allIx: anchor.web3.TransactionInstruction[] = [];
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
    const appendTx = await nftRarityProgram.methods
      .appendList(subMintList)
      .accounts({
        admin: rarityInfo.admin,
        rarityInfo: rarityInfo.key,
      })
      .instruction();

    allIx.push(appendTx);
  }

  return allIx;
}

// Staking program

export async function initiatePoolInfoIx(
  poolInfo: PoolInfo,
  rarityInfo: RarityInfo,
  provider: anchor.AnchorProvider
) {
  const nftStakingProgram = new anchor.Program(
    nftStakingIDL,
    NFT_STAKING_PROGRAM_ID,
    provider
  );

  // if (!rarityInfo.key.equals(poolInfo.rarityInfo)) {
  //   rarityInfo.findKeyAndSeed();
  // } else {
  //   rarityInfo.findNonceAndSeed();
  // }
  // poolInfo.findKeyAndAuthorityAndVault();

  // find admin prove token account
  const adminProveTokenAccount = await findAssociatedTokenAddress(
    poolInfo.admin,
    poolInfo.proveTokenMint
  );

  // const createAtaIx = await createATAWithoutCheckIx(
  //   poolInfo.proveTokenAuthority,
  //   poolInfo.proveTokenMint,
  //   poolInfo.admin
  // );

  // Initialize
  const initIx = await nftStakingProgram.methods
    .initialize(
      rarityInfo.collection,
      rarityInfo.rarity,
      new anchor.BN(rarityInfo.nonce)
    )
    .accounts({
      admin: poolInfo.admin,
      proveTokenMint: poolInfo.proveTokenMint,
      adminProveTokenAccount,
      proveTokenAuthority: poolInfo.proveTokenAuthority,
      proveTokenVault: poolInfo.proveTokenVault,
      poolInfo: poolInfo.key,
      rarityInfo: rarityInfo.key,
      rarityProgram: NFT_RARITY_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return initIx;
}

export async function updatePoolInfoAdminIx(
  newAdmin: PublicKey,
  poolInfo: PoolInfo,
  provider: anchor.AnchorProvider
) {
  const nftStakingProgram = new anchor.Program(
    nftStakingIDL,
    NFT_STAKING_PROGRAM_ID,
    provider
  );

  const updatePoolInfoAdminIx = await nftStakingProgram.methods
    .updateAdmin()
    .accounts({
      admin: poolInfo.admin,
      newAdmin,
      poolInfo: poolInfo.key,
    })
    .instruction();

  return updatePoolInfoAdminIx;
}

export async function stakeIx(
  poolInfo: PoolInfo,
  user: PublicKey,
  userNftAccount: PublicKey,
  provider: anchor.AnchorProvider
) {
  const nftStakingProgram = new anchor.Program(
    nftStakingIDL,
    NFT_STAKING_PROGRAM_ID,
    provider
  );

  // create user prove token ATA
  const userProveTokenAccount = await findAssociatedTokenAddress(
    user,
    poolInfo.proveTokenMint
  );
  const createProveTokenAtaIx = await createATAWithoutCheckIx(
    user,
    poolInfo.proveTokenMint
  );

  const IxArr: anchor.web3.TransactionInstruction[] = [];
  IxArr.push(createProveTokenAtaIx);

  const nftAccount = await getAccount(provider.connection, userNftAccount);
  const nftMint = nftAccount.mint;

  const nftVaultAccount = (
    await PublicKey.findProgramAddress(
      [
        nftMint.toBuffer(),
        poolInfo.key.toBuffer(),
        Buffer.from(NFT_VAULT_SEED),
      ],
      NFT_STAKING_PROGRAM_ID
    )
  )[0];

  // create nft vault ATA
  let nftVaultAta = await findAssociatedTokenAddress(nftVaultAccount, nftMint);
  const createAtaIx = await createATAWithoutCheckIx(
    nftVaultAccount,
    nftMint,
    user
  );

  IxArr.push(createAtaIx);

  const stakeIx = await nftStakingProgram.methods
    .stake()
    .accounts({
      user,
      poolInfo: poolInfo.key,
      nftMint,
      userNftAccount,
      nftVaultAta,
      userProveTokenAccount,
      nftVaultAccount,
      proveTokenMint: poolInfo.proveTokenMint,
      rarityInfo: poolInfo.rarityInfo,
      proveTokenAuthority: poolInfo.proveTokenAuthority,
      proveTokenVault: poolInfo.proveTokenVault,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  IxArr.push(stakeIx);

  return IxArr;
}

export async function unstakeIx(
  poolInfo: PoolInfo,
  user: PublicKey,
  nftMint: PublicKey,
  provider: anchor.AnchorProvider
) {
  const nftStakingProgram = new anchor.Program(
    nftStakingIDL,
    NFT_STAKING_PROGRAM_ID,
    provider
  );

  // create user prove token ATA
  const userProveTokenAccount = await findAssociatedTokenAddress(
    user,
    poolInfo.proveTokenMint
  );

  const nftVaultAccount = (
    await PublicKey.findProgramAddress(
      [
        nftMint.toBuffer(),
        poolInfo.key.toBuffer(),
        Buffer.from(NFT_VAULT_SEED),
      ],
      NFT_STAKING_PROGRAM_ID
    )
  )[0];

  let userNftAccount = await findAssociatedTokenAddress(user, nftMint);

  // create nft vault ATA
  let nftVaultAta = await findAssociatedTokenAddress(nftVaultAccount, nftMint);

  const unstakeIx = nftStakingProgram.methods
    .unstake()
    .accounts({
      user,
      poolInfo: poolInfo.key,
      nftMint,
      userNftAccount,
      nftVaultAta,
      userProveTokenAccount,
      nftVaultAccount,
      proveTokenMint: poolInfo.proveTokenMint,
      rarityInfo: poolInfo.rarityInfo,
      proveTokenAuthority: poolInfo.proveTokenAuthority,
      proveTokenVault: poolInfo.proveTokenVault,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return unstakeIx;
}
