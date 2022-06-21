//=======================================================
//
// Make sure the config is correct before initialization.
//
//=======================================================
import { Connection, Commitment } from "@solana/web3.js";

// Initialize setting
export const COLLECTION_SEED = "MyCollection"; // must <= 16 characters
export const RARITY_SEED = "SSR"; // must <= 16 characters
export const TOTAL_AMOUNT_OF_MINTS = 10;
export const MINT_LIST_PATH = "./mintList/nft_mints.json";

// Configure connection
export const commitment: Commitment = "processed";

// ENDPOINT: mainnet beta
// export const connection = new Connection("https://ssc-dao.genesysgo.net", {
//   commitment,
//   confirmTransactionInitialTimeout: 300 * 1000,
// });
// export const connection = new Connection("https://solana-api.tt-prod.net", {
//   commitment,
//   confirmTransactionInitialTimeout: 300 * 1000,
// });
// ENDPOINT: localnet
export const connection = new Connection("http://127.0.0.1:8899", {
  commitment,
  wsEndpoint: "ws://127.0.0.1:8900/",
});
// ENDPOINT: dappio-mf
// export const connection = new Connection("https://rpc-mainnet-fork.dappio.xyz", {
//   commitment,
//   wsEndpoint: "wss://rpc-mainnet-fork.dappio.xyz/ws",
// });
// ENDPOINT: epochs.studio-mf
// export const connection = new Connection(
//   "https://rpc-mainnet-fork.epochs.studio",
//   {
//     commitment,
//     wsEndpoint: "wss://rpc-mainnet-fork.epochs.studio/ws",
//   }
// );
