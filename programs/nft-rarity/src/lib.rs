use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

declare_id!("NFTRnyHzbhLx7XWc9PBKJyP68zFsjwNbUtmYTHc1ow3");

#[program]
pub mod nft_rarity {
    use super::*;

    const RARITY_INFO_SEED: &str = "rarity_info";

    pub fn initialize(
        ctx: Context<Initialize>,
        collection: String,
        rarity: String,
        nonce: u64,
    ) -> Result<()> {
        let seed = seedhash(
            collection.clone(),
            rarity.clone(),
            nonce,
            RARITY_INFO_SEED.to_string(),
        );

        let _rarity_info_account =
            Pubkey::create_with_seed(&ctx.accounts.admin.key(), &seed[..32], ctx.program_id);

        if ctx.accounts.rarity_info.key() != _rarity_info_account.unwrap() {
            return Err(ErrorCode::InvalidAccount.into());
        };

        ctx.accounts.rarity_info.admin = ctx.accounts.admin.key();
        ctx.accounts.rarity_info.collection = tofixlength(collection.clone());
        ctx.accounts.rarity_info.rarity = tofixlength(rarity.clone());

        Ok(())
    }

    pub fn update_admin(ctx: Context<UpdateAdmin>) -> Result<()> {
        ctx.accounts.rarity_info.admin = ctx.accounts.new_admin.key();

        Ok(())
    }

    pub fn append_list(ctx: Context<AppendList>, append_mint_list: Vec<Pubkey>) -> Result<()> {
        for mint in append_mint_list {
            ctx.accounts.rarity_info.mint_list.push(mint);
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    pub admin: Signer<'info>,
    #[account(zero)]
    pub rarity_info: Box<Account<'info, RarityInfo>>,
}

#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    pub admin: Signer<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub new_admin: AccountInfo<'info>,
    #[account(mut, constraint = rarity_info.admin == admin.key())]
    pub rarity_info: Box<Account<'info, RarityInfo>>,
}

#[derive(Accounts)]
pub struct AppendList<'info> {
    pub admin: Signer<'info>,
    #[account(mut, constraint = rarity_info.admin == admin.key())]
    pub rarity_info: Box<Account<'info, RarityInfo>>,
}

#[account]
pub struct RarityInfo {
    pub admin: Pubkey,
    pub collection: [u8; 16],
    pub rarity: [u8; 16],
    pub mint_list: Vec<Pubkey>,
}

pub fn seedhash(collection: String, rarity: String, nonce: u64, rarity_info: String) -> String {
    let mut _hash: String;
    _hash = hex::encode(hash(
        hex::encode(
            &[
                collection.as_bytes(),
                rarity.as_bytes(),
                &nonce.to_string().as_bytes(),
                rarity_info.as_bytes(),
            ]
            .concat(),
        )
        .as_bytes(),
    ));
    _hash
}

pub fn tofixlength(txt: String) -> [u8; 16] {
    let src = txt.as_bytes();
    let mut data = [0u8; 16];
    data[..src.len()].copy_from_slice(src);
    data
}

#[error_code]
pub enum ErrorCode {
    #[msg("RarityInfo verification failed. Mismatch in createWithSeed.")]
    InvalidAccount,
}
