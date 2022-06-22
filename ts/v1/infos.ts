import BN from "bn.js";
import * as anchor from "@project-serum/anchor";
import {
  PublicKey,
  MemcmpFilter,
  GetProgramAccountsConfig,
  DataSizeFilter,
} from "@solana/web3.js";
import { NFT_VAULT_LAYOUT } from "./layout";
import * as ID from "./ids";
import { find } from "lodash";
import { hex } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { hash } from "@project-serum/anchor/dist/cjs/utils/sha256";
import { IDL as nftStakingIDL } from "../../target/types/nft_staking";
import { IDL as rarityIDL } from "../../target/types/nft_rarity";

class PoolInfo {
  constructor(
    public poolInfoAddr: PublicKey,
    public admin: PublicKey,
    public proveTokenVaultPda: PublicKey,
    public proveTokenVaultAta: PublicKey,
    public proveTokenMint: PublicKey,
    public rarityInfo: rarityInfo,
    public mintListLength: BN,
    public totalLocked: BN
  ) {}
}

class NFTVault {
  constructor(
    public user: PublicKey,
    public poolInfoKey: PublicKey,
    public nftMint: PublicKey
  ) {}
}

interface rarityInfo {
  address: PublicKey;
  collection: string;
  rarity: string;
  mintList: PublicKey[];
}

interface mintInfo {
  collection: string;
  rarity: string;
  mint: PublicKey;
  poolInfoKey: PublicKey;
}

export async function parseNFTVault(data: any): Promise<NFTVault> {
  const dataBuffer = data as Buffer;
  const infoData = dataBuffer.slice(8);
  const newNftVault = NFT_VAULT_LAYOUT.decode(infoData);
  const { user, poolInfo, nftMint } = newNftVault;
  return new NFTVault(user, poolInfo, nftMint);
}

export async function getStakedNFTMint(
  owner: PublicKey,
  provider: anchor.Provider,
  poolInfo?: PublicKey
) {
  const NftStakingProgram = new anchor.Program(
    nftStakingIDL,
    ID.NFT_STAKING_PROGRAM_ID,
    provider
  );
  const ownerIdMemcmp: MemcmpFilter = {
    memcmp: {
      offset: 8,
      bytes: owner.toString(),
    },
  };

  const sizeFilter: DataSizeFilter = {
    dataSize: 104,
  };
  let filters = [ownerIdMemcmp, sizeFilter];
  if (poolInfo) {
    const poolIdMemcmp: MemcmpFilter = {
      memcmp: {
        offset: 40,
        bytes: poolInfo.toString(),
      },
    };
    filters = [ownerIdMemcmp, poolIdMemcmp, sizeFilter];
  }
  const config: GetProgramAccountsConfig = { filters };
  const allNFTVaultAccount = await provider.connection.getProgramAccounts(
    NftStakingProgram.programId,
    config
  );
  const allStakedNFTMint: NFTVault[] = [];
  for (const account of allNFTVaultAccount) {
    const currentNFTVault = await parseNFTVault(account.account.data);
    allStakedNFTMint.push(currentNFTVault);
  }
  return allStakedNFTMint;
}

export async function rarityFilter(
  mintList: PublicKey[],
  provider: anchor.Provider
) {
  const rarityProgram = new anchor.Program(
    rarityIDL,
    ID.NFT_RARITY_PROGRAM_ID,
    provider
  );
  const NftStakingProgram = new anchor.Program(
    nftStakingIDL,
    ID.NFT_STAKING_PROGRAM_ID,
    provider
  );

  // fetch all poolInfo
  const allPoolInfo = await getPoolInfo(ID.ALL_POOL_INFOS, provider);

  let result: mintInfo[] = [];
  for (let mint of mintList) {
    for (let pool of allPoolInfo) {
      if (
        find(pool.rarityInfo.mintList, (allowedMint) => {
          return allowedMint.toString() == mint.toString();
        })
      ) {
        result.push({
          collection: pool.rarityInfo.collection,
          rarity: pool.rarityInfo.rarity,
          mint: mint,
          poolInfoKey: new PublicKey(pool.poolInfoAddr),
        });
        break;
      }
    }
  }

  return result;
}

export async function getPoolInfo(
  poolInfos: PublicKey[],
  provider: anchor.Provider
) {
  const rarityProgram = new anchor.Program(
    rarityIDL,
    ID.NFT_RARITY_PROGRAM_ID,
    provider
  );
  const NftStakingProgram = new anchor.Program(
    nftStakingIDL,
    ID.NFT_STAKING_PROGRAM_ID,
    provider
  );

  const poolInfoReqs = poolInfos.map(async (poolInfo) => {
    const _poolInfo = await NftStakingProgram.account.poolInfo.fetch(poolInfo);
    const rarityInfo = await rarityProgram.account.rarityInfo.fetch(
      _poolInfo.rarityInfo
    );
    return new PoolInfo(
      poolInfo,
      _poolInfo.admin,
      _poolInfo.proveTokenAuthority,
      _poolInfo.proveTokenVault,
      _poolInfo.proveTokenMint,
      {
        address: _poolInfo.rarityInfo,
        collection: Buffer.from(rarityInfo.collection)
          .toString("utf-8")
          .split("\x00")[0],
        rarity: Buffer.from(rarityInfo.rarity)
          .toString("utf-8")
          .split("\x00")[0],
        mintList: rarityInfo.mintList,
      },
      _poolInfo.mintListLength,
      _poolInfo.totalLocked
    );
  });

  return Promise.all(poolInfoReqs);
}

export async function getStakedAmount(
  poolInfos: PublicKey[],
  provider: anchor.Provider
) {
  const _poolInfos = await getPoolInfo(poolInfos, provider);
  let staked_amount = 0;
  _poolInfos.map((pool) => {
    staked_amount = staked_amount + pool.totalLocked.toNumber();
  });

  return staked_amount;
}

export async function getPoolInfoKeyFromSeed(
  admin: PublicKey,
  COLLECTION_SEED: string,
  RARITY_SEED: string,
  nonce: number
) {
  let SEED = hex.encode(
    Buffer.from(COLLECTION_SEED + RARITY_SEED + nonce + "rarity_info")
  );
  SEED = hash(SEED.substring(2));

  const rarityInfo = await PublicKey.createWithSeed(
    admin,
    SEED.substring(0, 32),
    ID.NFT_RARITY_PROGRAM_ID
  );

  // find poolInfoKey
  const poolInfoKey = (
    await PublicKey.findProgramAddress(
      [rarityInfo.toBuffer(), Buffer.from("pool_info")],
      ID.NFT_STAKING_PROGRAM_ID
    )
  )[0];

  return poolInfoKey;
}
