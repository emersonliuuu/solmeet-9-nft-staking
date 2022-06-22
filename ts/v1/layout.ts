import { publicKey, struct } from "@project-serum/borsh";

export const NFT_VAULT_LAYOUT = struct([
  publicKey("user"),
  publicKey("poolInfo"),
  publicKey("nftMint"),
]);
