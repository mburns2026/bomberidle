//! Bomber Idle reward program.
//!
//! O servidor do jogo calcula as recompensas off-chain. Para sacar, o jogador
//! assina a transacao E o `server_authority` co-assina, autorizando o valor.
//! Um nonce crescente por jogador impede replay.
//!
//! STATUS: esqueleto inicial, NAO auditado. Nao use em mainnet sem auditoria.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

// Rode `anchor keys sync` para gerar e substituir este ID.
declare_id!("11111111111111111111111111111111");

#[program]
pub mod bomber_idle {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        server_authority: Pubkey,
        max_claim: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.server_authority = server_authority;
        config.reward_mint = ctx.accounts.reward_mint.key();
        config.max_claim = max_claim;
        config.paused = false;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn set_server_authority(ctx: Context<AdminOnly>, new_authority: Pubkey) -> Result<()> {
        ctx.accounts.config.server_authority = new_authority;
        Ok(())
    }

    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }

    pub fn set_max_claim(ctx: Context<AdminOnly>, max_claim: u64) -> Result<()> {
        ctx.accounts.config.max_claim = max_claim;
        Ok(())
    }

    /// Saca `amount` tokens do vault. Requer assinatura do jogador e do servidor.
    pub fn claim(ctx: Context<Claim>, amount: u64, nonce: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.paused, BomberError::Paused);
        require!(amount > 0 && amount <= config.max_claim, BomberError::InvalidAmount);

        let user_claim = &mut ctx.accounts.user_claim;
        require!(nonce > user_claim.last_nonce, BomberError::InvalidNonce);
        user_claim.user = ctx.accounts.user.key();
        user_claim.last_nonce = nonce;
        user_claim.total_claimed = user_claim
            .total_claimed
            .checked_add(amount)
            .ok_or(BomberError::Overflow)?;

        let bump = config.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"config", &[bump]]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        emit!(Claimed {
            user: ctx.accounts.user.key(),
            amount,
            nonce,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    pub reward_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = admin,
        seeds = [b"vault"],
        bump,
        token::mint = reward_mint,
        token::authority = config
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = server_authority)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserClaim::INIT_SPACE,
        seeds = [b"claim", user.key().as_ref()],
        bump
    )]
    pub user_claim: Account<'info, UserClaim>,
    #[account(
        mut,
        constraint = user_token.mint == config.reward_mint @ BomberError::InvalidMint,
        constraint = user_token.owner == user.key() @ BomberError::InvalidOwner
    )]
    pub user_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub server_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub server_authority: Pubkey,
    pub reward_mint: Pubkey,
    pub max_claim: u64,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserClaim {
    pub user: Pubkey,
    pub last_nonce: u64,
    pub total_claimed: u64,
}

#[event]
pub struct Claimed {
    pub user: Pubkey,
    pub amount: u64,
    pub nonce: u64,
}

#[error_code]
pub enum BomberError {
    #[msg("Program is paused")]
    Paused,
    #[msg("Invalid claim amount")]
    InvalidAmount,
    #[msg("Nonce must be greater than the last used nonce")]
    InvalidNonce,
    #[msg("Token account has the wrong mint")]
    InvalidMint,
    #[msg("Token account has the wrong owner")]
    InvalidOwner,
    #[msg("Math overflow")]
    Overflow,
}
