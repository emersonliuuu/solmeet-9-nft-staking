# SolMeet 9 NFT Staking

This is a tutorial for refactoring SDK, if you want to run it directly please `checkout` to `final` branch and run the script below.

Or you can learn more about the concept [here](https://book.solmeet.dev/notes/walk-through-solana-sdk-design) and follow the note step by step to finish.

## Setup

### Run local validator

Restart local validator, and clone a useful program for creating ATA from Mainnet. See more about the program [here](https://github.com/mercurial-finance/create-ata-if-missing-program)

```bash=
# run local validator
$ solana-test-validator -r -c 9tiP8yZcekzfGzSBmp7n9LaDHRjxP2w7wJj8tpPJtfG -u https://api.mainnet-beta.solana.com
```

open another console to confirm the setting is same as the one we are going to use later

```bash=
$ solana config get

# config solana setting to target wallet and network
$ solana config set -k ~/.config/solana/id.json -u <Localnet URL>

# check balance
$ solana balance

# request airdrop
$ solana airdrop 5

$ git clone git@github.com:Dappio-emerson/solmeet-9-nft-staking.git
```

### Install dependency and replace program key

Make sure you have replace program keys for all files below.

1. `programs/nft-rarity/src/lib.rs`
2. `programs/nft-staking/src/lib.rs`
3. `ts/v1/ids.ts`
4. `Anchor.toml`

```bash=
#cd solmeet-9-nft-staking
$ yarn

# generate program key
$ anchor keys list
```

## Run Program

### Build and deploy

Build and deploy program with anchor command. Programs will deploy to localnet by default, can change the setting in `Anchor.toml`. Once the cluster is changed, update the endpoint in 1) `migrations/0_setting.ts` 2) `tests/0_setting.ts` corresponding to what you have changed.

```bash=
$ anchor build
$ anchor deploy
```

### Initialize State

This command is user defined script, it run all scripts under `migration/initialization/` for initializing NFT mint list to Rarity Info and Initialize Pool info.

```bash=
# run user defined scripts to initialize
$ anchor run initializeState
```

### Stake with SDK v1

Run test script which implement staking with v1 SDK (`ts/v1`), the script is under `tests/v1`.

```bash=
# run user defined scripts
$ anchor run testV1
```

### Stake with SDK v1

Run test script which implement staking with v2 SDK (`ts/v2`), the script is under `tests/v2`.

```bash=
# run user defined scripts
$ anchor run testV2
```
