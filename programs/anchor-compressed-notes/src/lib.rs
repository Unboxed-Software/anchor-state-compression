use anchor_lang::{prelude::*, solana_program::keccak};
use spl_account_compression::{
    cpi::{
        accounts::{Initialize, Modify},
        append, init_empty_merkle_tree,
    },
    program::SplAccountCompression,
    wrap_application_data_v1, Noop,
};
declare_id!("TCxHVHUGREfiguKx9SuJsH9Dw6WQpFsRrEfHoXnNopT");

#[program]
pub mod anchor_compressed_notes {
    use super::*;

    pub fn create_note_tree(
        ctx: Context<CreateNoteTree>,
        max_depth: u32,
        max_buffer_size: u32,
    ) -> Result<()> {
        let merkle_tree = ctx.accounts.merkle_tree.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            merkle_tree.as_ref(),
            &[*ctx.bumps.get("tree_authority").unwrap()],
        ]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.compression_program.to_account_info(),
            Initialize {
                authority: ctx.accounts.tree_authority.to_account_info(),
                merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
                noop: ctx.accounts.log_wrapper.to_account_info(),
            },
            signer_seeds,
        );
        init_empty_merkle_tree(cpi_ctx, max_depth, max_buffer_size)?;
        Ok(())
    }
    pub fn append_note(ctx: Context<AppendNote>, message: String) -> Result<()> {
        let leaf_node = keccak::hashv(&[message.as_bytes()]).to_bytes();
        let note = NoteSchema::new(leaf_node.clone(), message);

        let merkle_tree = ctx.accounts.merkle_tree.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            merkle_tree.as_ref(),
            &[*ctx.bumps.get("tree_authority").unwrap()],
        ]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.compression_program.to_account_info(),
            Modify {
                authority: ctx.accounts.tree_authority.to_account_info(),
                merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
                noop: ctx.accounts.log_wrapper.to_account_info(),
            },
            signer_seeds,
        );
        append(cpi_ctx, leaf_node)?;

        wrap_application_data_v1(note.try_to_vec()?, &ctx.accounts.log_wrapper)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateNoteTree<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [merkle_tree.key().as_ref()],
        bump,
    )]
    pub tree_authority: SystemAccount<'info>,
    /// CHECK: This account must be all zeros
    pub merkle_tree: UncheckedAccount<'info>,
    pub log_wrapper: Program<'info, Noop>,
    pub compression_program: Program<'info, SplAccountCompression>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AppendNote<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [merkle_tree.key().as_ref()],
        bump,
    )]
    pub tree_authority: SystemAccount<'info>,
    /// CHECK: This account is validated in the SplAccountCompression program
    #[account(mut)]
    pub merkle_tree: UncheckedAccount<'info>,
    pub log_wrapper: Program<'info, Noop>,
    pub compression_program: Program<'info, SplAccountCompression>,
}

#[derive(AnchorSerialize)]
pub struct NoteSchema {
    leaf_node: [u8; 32],
    message: String,
}

impl NoteSchema {
    pub fn new(leaf_node: [u8; 32], message: String) -> Self {
        Self { leaf_node, message }
    }
}
