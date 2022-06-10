use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::{self, CloseAccount, Mint, TokenAccount, Transfer};
use anchor_lang::solana_program::{hash::hash};
use nft_rarity::RarityInfo;

declare_id!("NFTS4eKECWLtMmzoo2FJH7Zkoj2jxU8PJicCViyuVGh");

#[program]
pub mod nft_staking {
    use super::*;

    const PROVE_TOKEN_VAULT_PDA_SEED: &[u8] = b"prove_token_vault";
    const NFT_VAULT_PDA_SEED: &[u8] = b"nft_vault";
    const RARITY_INFO_SEED: &str = "rarity_info";

    pub fn initialize(
        ctx: Context<Initialize>,
        collection: String,
        rarity: String,
        nonce: u64,
    ) -> Result<()> {
        // Store data to MintListAccount(PDA)
        let (prove_token_authority, _prove_token_authority_bump) =
            Pubkey::find_program_address(
                &[
                        &ctx.accounts.pool_info.to_account_info().key.to_bytes(),
                        PROVE_TOKEN_VAULT_PDA_SEED
                     ], ctx.program_id);
        if prove_token_authority != *ctx.accounts.prove_token_authority.to_account_info().key {
            return Err(ErrorCode::InvalidProveTokenAuthority.into());
        };
        
        let _prove_token_vault = get_associated_token_address(
            &prove_token_authority.clone(), 
            &ctx.accounts.prove_token_mint.key().clone()
        );

        if _prove_token_vault != *ctx.accounts.prove_token_vault.to_account_info().key {
            return Err(ErrorCode::InvalidProveTokenATA.into());
        }
        
        // verify rarity_info
        let seed = seedhash(collection.clone(), rarity.clone(), nonce, RARITY_INFO_SEED.to_string());
        let _rarity_info_account = Pubkey::create_with_seed(
            &ctx.accounts.admin.key(), &seed[..32], ctx.accounts.rarity_program.key
        );

        if ctx.accounts.rarity_info.key() != _rarity_info_account.unwrap(){
            return Err(ErrorCode::InvalidRarityInfoAccount.into());
        };
        
        // Store data to PoolInfo
        ctx.accounts.pool_info.admin = *ctx.accounts.admin.to_account_info().key;
        ctx.accounts.pool_info.prove_token_authority = prove_token_authority.clone();
        ctx.accounts.pool_info.prove_token_vault = _prove_token_vault.clone();
        ctx.accounts.pool_info.prove_token_mint = *ctx.accounts.prove_token_mint.to_account_info().key;
        ctx.accounts.pool_info.rarity_info = *ctx.accounts.rarity_info.to_account_info().key;
        // This field is deprecated.
        ctx.accounts.pool_info.mint_list_length = u64::from_le_bytes(ctx.accounts.rarity_info.mint_list.len().to_le_bytes());
        ctx.accounts.pool_info.total_locked = 0u64;

        token::transfer(
            ctx.accounts.transfer_prove_token_to_vault(), 
            u64::from_le_bytes(ctx.accounts.rarity_info.mint_list.len().to_le_bytes())
        )?;

        Ok(())
    }

    pub fn update_admin(
        ctx: Context<UpdateAdmin>, 
    ) -> Result<()> {
        ctx.accounts.pool_info.admin = ctx.accounts.new_admin.key();

        Ok(())
    }

    pub fn stake(
        ctx: Context<Stake>, 
    ) -> Result<()> {
        let (_prove_token_authority, _prove_token_authority_bump) =
            Pubkey::find_program_address(
                &[
                        &ctx.accounts.pool_info.to_account_info().key.to_bytes(), 
                        PROVE_TOKEN_VAULT_PDA_SEED
                    ], 
                ctx.program_id
            );
        
        let _prove_token_authority_seeds = &[
            &ctx.accounts.pool_info.to_account_info().key.to_bytes(), 
            PROVE_TOKEN_VAULT_PDA_SEED, 
            &[_prove_token_authority_bump]
            ];
        
        // Check NFT mint is listed in MintListAccount
        if !ctx.accounts.rarity_info.mint_list.contains(&ctx.accounts.nft_mint.key()) {
            return Err(ErrorCode::MintNotFound.into());
        };

        msg!("transfer nft to vault");
        // Transfer NFT to Vault
        token::transfer(
            ctx.accounts.tansfer_nft_to_vault(),
            1,
        )?;

        msg!("update NFT vault");
        // Update NftVaultAccount
        ctx.accounts.nft_vault_account.user = *ctx.accounts.user.to_account_info().key;
        ctx.accounts.nft_vault_account.pool_info = *ctx.accounts.pool_info.to_account_info().key;
        ctx.accounts.nft_vault_account.nft_mint = *ctx.accounts.nft_mint.to_account_info().key;
        
        msg!("transfer prove token to user");
        // Transfer prove token to User
        token::transfer(
            ctx.accounts.transfer_prove_token_to_user()
            .with_signer(&[&_prove_token_authority_seeds[..]]),
            1,
        )?;

        // Update PoolInfo
        ctx.accounts.pool_info.total_locked += 1;

        Ok(())
    }
    
    pub fn unstake(
        ctx: Context<Unstake>
    ) -> Result<()> {
        // Generate user specific nft vault
        let (_nft_vault_account, _nft_vault_account_bump) =
            Pubkey::find_program_address(
                &[
                    &ctx.accounts.nft_mint.to_account_info().key.to_bytes(), 
                    &ctx.accounts.pool_info.to_account_info().key.to_bytes(), 
                    NFT_VAULT_PDA_SEED,
                    ], 
                ctx.program_id);
        
        let _nft_vault_account_seeds = &[
            &ctx.accounts.nft_mint.to_account_info().key.to_bytes(),  
            &ctx.accounts.pool_info.to_account_info().key.to_bytes(), 
            NFT_VAULT_PDA_SEED, 
            &[_nft_vault_account_bump]
            ];

        let (_prove_token_authority, _prove_token_authority_bump) =
            Pubkey::find_program_address(
                &[
                        &ctx.accounts.pool_info.to_account_info().key.to_bytes(), 
                        PROVE_TOKEN_VAULT_PDA_SEED
                    ], 
                ctx.program_id
            );

        // Transfer NFT back to user
        token::transfer(
            ctx.accounts.transfer_nft_to_user()
            .with_signer(&[&_nft_vault_account_seeds[..]]), 
            1
        )?;

        // Close NftVaultAccount
        token::close_account(
            ctx.accounts
                .close_nft_vault_ata()
                .with_signer(&[&_nft_vault_account_seeds[..]]),
        )?;

        // Transfer prove token back to vault
        token::transfer(
            ctx.accounts.transfer_prove_token_to_vault(), 
            1
        )?;
        
        // Update PoolInfo
        ctx.accounts.pool_info.total_locked -= 1;

        Ok(())
    }
}


#[derive(Accounts)]
pub struct Initialize<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut, signer)]
    pub admin: AccountInfo<'info>,
    pub prove_token_mint: Account<'info, Mint>, // prove token mint
    #[account(mut)]
    pub admin_prove_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut, seeds = [pool_info.key().as_ref(), b"prove_token_vault".as_ref()], bump)]
    pub prove_token_authority: AccountInfo<'info>, 
    #[account(mut, constraint = prove_token_mint.to_account_info().key() == prove_token_vault.mint)]
    pub prove_token_vault: Box<Account<'info, TokenAccount>>, 
    #[account(
        init, 
        seeds = [rarity_info.key().as_ref(), b"pool_info".as_ref()],
        bump, 
        space = 184,    // 8 + 32 * 5 + 8 + 8
        payer = admin
    )]
    pub pool_info: Box<Account<'info, PoolInfo>>,
    pub rarity_info: Box<Account<'info, RarityInfo>>, 
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub rarity_program: AccountInfo<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub system_program: AccountInfo<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(signer)]
    pub admin: AccountInfo<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub new_admin: AccountInfo<'info>,
    #[account(
        mut,  
        constraint = pool_info.admin == admin.key()
    )]
    pub pool_info: Box<Account<'info, PoolInfo>>, 
}

#[derive(Accounts)]
pub struct Stake<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut, signer)]
    pub user: AccountInfo<'info>,
    #[account(
        mut, 
        seeds = [rarity_info.key().as_ref(), b"pool_info".as_ref()],
        bump,
        constraint = prove_token_mint.to_account_info().key() == pool_info.prove_token_mint
    )]
    pub pool_info: Box<Account<'info, PoolInfo>>, 
    pub prove_token_mint: Box<Account<'info, Mint>>,
    pub nft_mint: Box<Account<'info, Mint>>, 
    #[account(constraint = pool_info.rarity_info == rarity_info.key())]
    pub rarity_info: Box<Account<'info, RarityInfo>>, 
    #[account(mut, 
        constraint = nft_mint.to_account_info().key() == user_nft_account.mint, 
        constraint = user.to_account_info().key() == user_nft_account.owner)]
    pub user_nft_account: Box<Account<'info, TokenAccount>>, 
    #[account(mut, 
        constraint = nft_mint.to_account_info().key() == nft_vault_ata.mint, 
        constraint = nft_vault_account.to_account_info().key() == nft_vault_ata.owner)]
    pub nft_vault_ata: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = prove_token_mint.to_account_info().key() == user_prove_token_account.mint)]
    pub user_prove_token_account: Box<Account<'info, TokenAccount>>, 
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut, seeds = [pool_info.key().as_ref(), b"prove_token_vault".as_ref()], bump, 
        constraint = pool_info.prove_token_authority == prove_token_authority.to_account_info().key())]
    pub prove_token_authority: AccountInfo<'info>, 
    #[account(mut, 
        constraint = prove_token_mint.to_account_info().key() == prove_token_vault.mint, 
        constraint = prove_token_vault.owner == prove_token_authority.to_account_info().key())]
    pub prove_token_vault: Box<Account<'info, TokenAccount>>, 
    #[account(
        init,
        seeds = [
            nft_mint.key().as_ref(), 
            pool_info.key().as_ref(),
            b"nft_vault".as_ref()
            ], 
        bump,
        payer = user,
        space =  104 // 8 + 32 + 32 + 32
    )]
    pub nft_vault_account: Box<Account<'info, NftVaultAccount>>, 
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub system_program: AccountInfo<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut, signer)]
    pub user: AccountInfo<'info>,
    #[account(
        mut, 
        seeds = [rarity_info.key().as_ref(), b"pool_info".as_ref()],
        bump,
        constraint = prove_token_mint.to_account_info().key() == pool_info.prove_token_mint
    )]
    pub pool_info: Box<Account<'info, PoolInfo>>, 
    pub prove_token_mint: Account<'info, Mint>,
    pub nft_mint: Account<'info, Mint>, 
    #[account(constraint = pool_info.rarity_info == rarity_info.key())]
    pub rarity_info: Box<Account<'info, RarityInfo>>, 
    #[account(mut, 
        constraint = nft_mint.to_account_info().key() == user_nft_account.mint, 
        constraint = user.to_account_info().key() == user_nft_account.owner)]
    pub user_nft_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, 
        constraint = nft_mint.to_account_info().key() == nft_vault_ata.mint, 
        constraint = nft_vault_account.to_account_info().key() == nft_vault_ata.owner,
    )]
    pub nft_vault_ata: Box<Account<'info, TokenAccount>>, 
    #[account(mut, constraint = prove_token_mint.to_account_info().key() == user_prove_token_account.mint)]
    pub user_prove_token_account: Box<Account<'info, TokenAccount>>, 
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut, seeds = [pool_info.key().as_ref(), b"prove_token_vault".as_ref()], bump,
    constraint = pool_info.prove_token_authority == prove_token_authority.to_account_info().key())]
    pub prove_token_authority: AccountInfo<'info>, 
    #[account(mut, 
        constraint = prove_token_mint.to_account_info().key() == prove_token_vault.mint, 
        constraint = prove_token_vault.owner == prove_token_authority.to_account_info().key())]
    pub prove_token_vault: Box<Account<'info, TokenAccount>>, 
    #[account(
        mut,
        seeds = [
            nft_mint.key().as_ref(), 
            pool_info.key().as_ref(),
            b"nft_vault".as_ref()
            ], 
        bump,
        close = user
    )]
    pub nft_vault_account: Box<Account<'info, NftVaultAccount>>, 
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub token_program: AccountInfo<'info>,
}

// program account
#[account]
pub struct PoolInfo {
    pub admin: Pubkey, 
    pub prove_token_authority: Pubkey, 
    pub prove_token_vault: Pubkey,
    pub prove_token_mint: Pubkey, 
    pub rarity_info: Pubkey, 
    /// This field is deprecated.
    pub mint_list_length: u64, 
    pub total_locked: u64,
}

#[account]
pub struct NftVaultAccount {
    pub user: Pubkey,
    pub pool_info: Pubkey,
    pub nft_mint: Pubkey
}

#[error_code]
pub enum ErrorCode {
    #[msg("ProveTokenAuthority verification failed. Mismatch in findProgramAddress.")]
    InvalidProveTokenAuthority,
    #[msg("ProveTokenATA verification failed. Mismatch in findAssociatedTokenAddress.")]
    InvalidProveTokenATA,
    #[msg("RarityInfo verification failed. Mismatch in createWithSeed.")]
    InvalidRarityInfoAccount,
    #[msg("Mint not found in allowed mint list.")]
    MintNotFound,
}

// utils
impl<'info> Initialize<'info> {
    fn transfer_prove_token_to_vault(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self
                .admin_prove_token_account
                .to_account_info()
                .clone(),
            to: self
            .prove_token_vault
            .to_account_info()
            .clone(),
            authority: self.admin.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
}

impl<'info> Stake<'info> {
    fn tansfer_nft_to_vault(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self
                .user_nft_account
                .to_account_info()
                .clone(),
            to: self.nft_vault_ata.to_account_info().clone(),
            authority: self.user.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }

    fn transfer_prove_token_to_user(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self
                .prove_token_vault
                .to_account_info()
                .clone(),
            to: self
            .user_prove_token_account
            .to_account_info()
            .clone(),
            authority: self.prove_token_authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
}

impl<'info> Unstake<'info> {
    fn transfer_nft_to_user(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self
                .nft_vault_ata
                .to_account_info()
                .clone(),
            to: self.user_nft_account.to_account_info().clone(),
            authority: self.nft_vault_account.to_account_info().clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }

    fn transfer_prove_token_to_vault(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self
                .user_prove_token_account
                .to_account_info()
                .clone(),
            to: self.prove_token_vault.to_account_info().clone(),
            authority: self.user.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }

    fn close_nft_vault_ata(&self) -> CpiContext<'_, '_, '_, 'info, CloseAccount<'info>> {
        let cpi_accounts = CloseAccount {
            account: self.nft_vault_ata.to_account_info().clone(),
            destination: self.user.clone(),
            authority: self.nft_vault_account.to_account_info().clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
}

pub fn seedhash(collection: String, rarity: String, nonce: u64, rarity_info: String)
-> String {
    let mut _hash:String;
    _hash = hex::encode(
        hash(
            hex::encode(
                &[
                    collection.as_bytes(), 
                    rarity.as_bytes(),
                    &nonce.to_string().as_bytes(),
                    rarity_info.as_bytes()
                    ]
                .concat())
                .as_bytes()));
    _hash
}