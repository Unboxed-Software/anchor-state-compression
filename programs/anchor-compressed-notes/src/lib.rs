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

    // Instruction for creating a new note tree.
    pub fn create_note_tree(
        ctx: Context<CreateNoteTree>,
        max_depth: u32,
        max_buffer_size: u32,
    ) -> Result<()> {
        // Get the key for the merkle tree account
        let merkle_tree = ctx.accounts.merkle_tree.key();
        // Define the seeds for pda signing
        let signer_seeds: &[&[&[u8]]] = &[&[
            merkle_tree.as_ref(),
            &[*ctx.bumps.get("tree_authority").unwrap()],
        ]];

        // Create cpi context for init_empty_merkle_tree instruction.
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.compression_program.to_account_info(),
            Initialize {
                authority: ctx.accounts.tree_authority.to_account_info(),
                merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
                noop: ctx.accounts.log_wrapper.to_account_info(),
            },
            signer_seeds,
        );

        // CPI to initialize an empty merkle tree with given max depth and buffer size
        init_empty_merkle_tree(cpi_ctx, max_depth, max_buffer_size)?;

        Ok(())
    }

    // Instruction for appending a note to a tree.
    pub fn append_note(ctx: Context<AppendNote>, message: String) -> Result<()> {
        // Get hash of the message to be used as leaf node
        let leaf_node = keccak::hashv(&[message.as_bytes()]).to_bytes();
        // Create a new "note" from the leaf node and message.
        let note = NoteSchema::new(leaf_node.clone(), message);
        // Log the "note" data using noop program
        wrap_application_data_v1(note.try_to_vec()?, &ctx.accounts.log_wrapper)?;

        // Get the key for the merkle tree account
        let merkle_tree = ctx.accounts.merkle_tree.key();
        // Define the seeds for pda signing
        let signer_seeds: &[&[&[u8]]] = &[&[
            merkle_tree.as_ref(),
            &[*ctx.bumps.get("tree_authority").unwrap()],
        ]];

        // Create a new cpi context and append the leaf node to the merkle tree.
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.compression_program.to_account_info(),
            Modify {
                authority: ctx.accounts.tree_authority.to_account_info(),
                merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
                noop: ctx.accounts.log_wrapper.to_account_info(),
            },
            signer_seeds,
        );
        // CPI to append the leaf node to the merkle tree
        append(cpi_ctx, leaf_node)?;

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

// Define a schema for data that will be logged using noop program
#[derive(AnchorSerialize)]
pub struct NoteSchema {
    leaf_node: [u8; 32],
    message: String,
}

impl NoteSchema {
    // Constructs a new note from given leaf node and message
    pub fn new(leaf_node: [u8; 32], message: String) -> Self {
        Self { leaf_node, message }
    }
}
