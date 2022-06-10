# SolMeet 9 NFT Staking

## Setup

### Run local validator and clone repo

```bash=
# run local validator
solana-test-validator -r -c 9tiP8yZcekzfGzSBmp7n9LaDHRjxP2w7wJj8tpPJtfG -u https://api.mainnet-beta.solana.com

solana config get

# config solana setting to target wallet and network
solana config set -k ~/.config/solana/id.json -u <Localnet URL>

# check balance
solana balance

git clone git@github.com:emersonliuuu/solmeet-9-nft-staking.git
```

### Install dependency and replace program key in

1. `programs/nft-rarity/src/lib.rs`
2. `programs/nft-staking/src/lib.rs`
3. `ts-v1/ids.ts`
4. `Anchor.toml`

```bash=
#cd solmeet-9-nft-staking
yarn

# generate program key
anchor keys list

mkdir tests output
```

## Run Program

### Build and deploy program to localnet

```bash=
anchor build

anchor deploy
```

### Initialize NFT mint list to Rarity Info and Initialize Pool info

```bash=
cp tests-deploy/{0_setting.ts,1_writeToID.ts,1_createAndMintNFT.ts,2_initRarityInfo.ts,3_appendMint.ts,4_initPoolInfo.ts,5_logAllInfos.ts} tests/

# start initialize
anchor test --skip-build --skip-deploy
```

### Run SDK v1

```bash=
rm tests/{1_writeToID.ts,1_createAndMintNFT.ts,2_initRarityInfo.ts,3_appendMint.ts,4_initPoolInfo.ts,5_logAllInfos.ts}

cp tests-v1/1_nft-staking-v1.ts tests/

# start stake/unstake
anchor test --skip-build --skip-deploy
```

### Run SDK v1

```bash=
rm tests/1_nft-staking-v1.ts

cp tests-v2/1_nft-staking-v2.ts tests/

# start stake/unstake
anchor test --skip-build --skip-deploy
```
