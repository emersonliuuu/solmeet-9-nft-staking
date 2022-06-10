import BN from "bn.js";
import * as anchor from "@project-serum/anchor";
import {
  PublicKey,
  MemcmpFilter,
  GetProgramAccountsConfig,
  DataSizeFilter,
} from "@solana/web3.js";
import { NFT_RARITY_PROGRAM_ID, NFT_STAKING_PROGRAM_ID } from "./ids";
import { find, min } from "lodash";
import { IDL as nftStakingIDL } from "../target/types/nft_staking";
import { IDL as nftRarityIDL } from "../target/types/nft_rarity";
import { IDL as nftMiningIDL } from "../target/types/nft_mining";
import { AllInfo } from "./poolInfos";

export class NFTVault {
  constructor(
    public key: PublicKey,
    public user: PublicKey,
    public poolInfoKey: PublicKey,
    public nftMint: PublicKey
  ) {}
}

export class UserInfo {
  constructor(public wallet: PublicKey, public staked: NFTVault[] = []) {}
}

export async function fetchUser(wallet: PublicKey, provider: anchor.Provider) {
  const nftStakingProgram = new anchor.Program(
    nftStakingIDL,
    NFT_STAKING_PROGRAM_ID,
    provider
  );

  const ownerIdMemcmp: MemcmpFilter = {
    memcmp: {
      offset: 8,
      bytes: wallet.toString(),
    },
  };
  const nftVaultSizeFilter: DataSizeFilter = {
    dataSize: nftStakingProgram.account.nftVaultAccount.size,
  };
  let filters = [ownerIdMemcmp, nftVaultSizeFilter];
  // console.log("fetch NFT vault");
  const allNftVaults = await nftStakingProgram.account.nftVaultAccount.all(
    filters
  );

  const userInfo = new UserInfo(wallet);
  for (let nftVault of allNftVaults) {
    userInfo.staked.push(
      new NFTVault(
        nftVault.publicKey,
        nftVault.account.user,
        nftVault.account.poolInfo,
        nftVault.account.nftMint
      )
    );
  }

  return userInfo;
}

export async function fetchAllNFTVault(
  provider: anchor.Provider,
  poolInfoKey: PublicKey
) {
  const nftStakingProgram = new anchor.Program(
    nftStakingIDL,
    NFT_STAKING_PROGRAM_ID,
    provider
  );
  const ownerIdMemcmp: MemcmpFilter = {
    memcmp: {
      offset: 40,
      bytes: poolInfoKey.toString(),
    },
  };
  const nftVaultSizeFilter: DataSizeFilter = {
    dataSize: nftStakingProgram.account.nftVaultAccount.size,
  };
  let filters = [ownerIdMemcmp, nftVaultSizeFilter];
  const allNftVaults = await nftStakingProgram.account.nftVaultAccount.all(
    filters
  );
  let staked: NFTVault[] = [];
  for (let nftVault of allNftVaults) {
    staked.push(
      new NFTVault(
        nftVault.publicKey,
        nftVault.account.user,
        nftVault.account.poolInfo,
        nftVault.account.nftMint
      )
    );
  }
  return staked;
}
