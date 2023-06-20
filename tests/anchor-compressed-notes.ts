import * as anchor from "@coral-xyz/anchor"
import { Program } from "@coral-xyz/anchor"
import { AnchorCompressedNotes } from "../target/types/anchor_compressed_notes"
import {
  Keypair,
  Transaction,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js"
import {
  ValidDepthSizePair,
  createAllocTreeIx,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression"

describe("anchor-compressed-notes", () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const wallet = provider.wallet as anchor.Wallet
  const connection = provider.connection
  const program = anchor.workspace
    .AnchorCompressedNotes as Program<AnchorCompressedNotes>

  const merkleTree = Keypair.generate()

  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [merkleTree.publicKey.toBuffer()],
    program.programId
  )

  it("Create Note Tree", async () => {
    const maxDepthSizePair: ValidDepthSizePair = {
      maxDepth: 14,
      maxBufferSize: 64,
    }
    const canopyDepth = 0

    // instruction to create new account with required space for tree
    const allocTreeIx = await createAllocTreeIx(
      connection,
      merkleTree.publicKey,
      wallet.publicKey,
      maxDepthSizePair,
      canopyDepth
    )

    // Add your test here.
    const ix = await program.methods
      .createNoteTree(maxDepthSizePair.maxDepth, maxDepthSizePair.maxBufferSize)
      .accounts({
        merkleTree: merkleTree.publicKey,
        treeAuthority: treeAuthority,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      })
      .instruction()

    const tx = new Transaction().add(allocTreeIx, ix)

    const txSignature = await sendAndConfirmTransaction(
      connection,
      tx,
      [wallet.payer, merkleTree],
      {
        commitment: "confirmed",
      }
    )

    console.log("txSignature", txSignature)
  })

  it("Append Leaf", async () => {
    // Add your test here.
    const txSignature = await program.methods
      .appendNote("hello world")
      .accounts({
        merkleTree: merkleTree.publicKey,
        treeAuthority: treeAuthority,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      })
      .rpc()

    console.log("txSignature", txSignature)
  })

  it("Append Another Leaf", async () => {
    // Add your test here.
    const txSignature = await program.methods
      .appendNote("another leaf")
      .accounts({
        merkleTree: merkleTree.publicKey,
        treeAuthority: treeAuthority,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      })
      .rpc()

    console.log("txSignature", txSignature)
  })
})
