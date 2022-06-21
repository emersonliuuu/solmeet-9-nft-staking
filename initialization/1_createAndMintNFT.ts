import * as anchor from "@project-serum/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { PublicKey, Transaction } from "@solana/web3.js";
import { createMint, mintTo, getAccount } from "@solana/spl-token";
import * as fs from "fs";
import { assert } from "chai";
import {
  findAssociatedTokenAddress,
  createATAWithoutCheckIx,
} from "../ts/utils";
import { MINT_LIST_PATH, TOTAL_AMOUNT_OF_MINTS, connection } from "./0_setting";
import { fstat } from "fs";

describe("create nft mint and mint to wallet", () => {
  const wallet = NodeWallet.local();
  const options = anchor.AnchorProvider.defaultOptions();
  const provider = new anchor.AnchorProvider(connection, wallet, options);

  const proveTokenMintList: PublicKey[] = [];

  it("create and mint to wallet", async () => {
    const ixArr: anchor.web3.TransactionInstruction[] = [];
    for (let index = 0; index < TOTAL_AMOUNT_OF_MINTS; index++) {
      // create Mint, comment out if mint is created.
      const nftMint = await createMint(
        provider.connection,
        wallet.payer,
        wallet.publicKey,
        null,
        0
      );
      proveTokenMintList.push(nftMint);

      ixArr.push(
        await createATAWithoutCheckIx(
          wallet.publicKey,
          proveTokenMintList[index]
        )
      );

      console.log("nft mint:", proveTokenMintList[index].toString());
    }

    let txAta = new Transaction();
    for (let [index, ix] of ixArr.entries()) {
      txAta.add(ix);
      if (index % 4 == 0 || index == ixArr.length - 1) {
        const result = await provider.sendAndConfirm(txAta, [wallet.payer]);
        // console.log("<create ATA>", result);
        txAta = new Transaction();
      }
    }

    for (let index = 0; index < TOTAL_AMOUNT_OF_MINTS; index++) {
      const proveTokenMint = proveTokenMintList[index];
      // comment below if successfully minted.
      const walletProveTokenAta = await findAssociatedTokenAddress(
        wallet.publicKey,
        proveTokenMint
      );
      const txn = await mintTo(
        provider.connection,
        wallet.payer,
        proveTokenMint,
        walletProveTokenAta,
        wallet.payer,
        1
      );
      console.log("<mint nft>", txn);
    }

    fs.writeFileSync(MINT_LIST_PATH, "[");
    for (let index = 0; index < TOTAL_AMOUNT_OF_MINTS; index++) {
      fs.appendFileSync(
        MINT_LIST_PATH,
        `\n  "${proveTokenMintList[index].toString()}"`
      );
      if (index != TOTAL_AMOUNT_OF_MINTS - 1) {
        fs.appendFileSync(MINT_LIST_PATH, ",");
      }
    }
    fs.appendFileSync(MINT_LIST_PATH, "\n]");
  });
});
