import * as anchor from "@coral-xyz/anchor"
import { Program } from "@coral-xyz/anchor"
import { AnchorCompressedNotes } from "../target/types/anchor_compressed_notes"
import {
  Keypair,
  Transaction,
  PublicKey,
  sendAndConfirmTransaction,
  Connection,
  clusterApiUrl,
} from "@solana/web3.js"
import {
  ValidDepthSizePair,
  createAllocTreeIx,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression"
import { getNote } from "../utils/utils"
import { assert } from "chai"
import { keccak256 } from "js-sha3"

describe("anchor-compressed-notes", () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const connection = new Connection("http://localhost:8899", "confirmed")
  // const connection = new Connection(clusterApiUrl("devnet"), "confirmed")

  const wallet = provider.wallet as anchor.Wallet
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

    const txSignature = await sendAndConfirmTransaction(connection, tx, [
      wallet.payer,
      merkleTree,
    ])

    console.log("txSignature", txSignature)
  })

  it("Append Leaf", async () => {
    const message = "hello world"

    const txSignature = await program.methods
      .appendNote(message)
      .accounts({
        merkleTree: merkleTree.publicKey,
        treeAuthority: treeAuthority,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      })
      .rpc()

    const note = await getNote(connection, txSignature, program.programId)
    const hash = keccak256(message)
    assert(hash === Buffer.from(note.leaf_node).toString("hex"))
    assert(message === note.message)

    console.log(note)
  })

  it("Append Another Leaf", async () => {
    const message = "another leaf"

    const txSignature = await program.methods
      .appendNote(message)
      .accounts({
        merkleTree: merkleTree.publicKey,
        treeAuthority: treeAuthority,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      })
      .rpc()

    const note = await getNote(connection, txSignature, program.programId)
    const hash = keccak256(message)
    assert(hash === Buffer.from(note.leaf_node).toString("hex"))
    assert(message === note.message)

    console.log(note)
  })
})
