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
  getAllChangeLogEventV1FromTransaction,
  ChangeLogEventV1,
  ConcurrentMerkleTreeAccount,
} from "@solana/spl-account-compression"
import { getHash, getNoteLog } from "../utils/utils"
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

  // Generate a new keypair for the merkle tree account
  const merkleTree = Keypair.generate()
  let changeLogEvent: ChangeLogEventV1[];

  const ogNote = "hello world"
  const ammendedNote = "hello world 2"
  const note = "0".repeat(917)

  // Derive the PDA to use as the tree authority for the merkle tree account
  // This is a PDA derived from the Note program, which allows the program to sign for appends instructions to the tree
  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [merkleTree.publicKey.toBuffer()],
    program.programId
  )

  it("Create Note Tree", async () => {
    const maxDepthSizePair: ValidDepthSizePair = {
      maxDepth: 3,
      maxBufferSize: 8,
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

    // instruction to initialize the tree through the Note program
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

    const txSignature = await program.methods
      .appendNote(ogNote)
      .accounts({
        merkleTree: merkleTree.publicKey,
        treeAuthority: treeAuthority,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      })
      .rpc()

    const noteLog = await getNoteLog(connection, txSignature)
        
    const hash = getHash(ogNote, provider.publicKey)
    const transactionResponse = await connection.getTransaction(txSignature);
    changeLogEvent = getAllChangeLogEventV1FromTransaction(transactionResponse);
    assert(hash === Buffer.from(noteLog.leafNode).toString("hex"))
    assert(ogNote === noteLog.note)

  })

  it("Append Another Leaf, Max Note Size", async () => {
    // Size of note is limited by max transaction size of 1232 bytes, minus additional data required for the instruction
   

    const txSignature = await program.methods
      .appendNote(note)
      .accounts({
        merkleTree: merkleTree.publicKey,
        treeAuthority: treeAuthority,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      })
      .rpc()

    const noteLog = await getNoteLog(connection, txSignature)
    const hash = getHash(note, provider.publicKey)
    assert(hash === Buffer.from(noteLog.leafNode).toString("hex"))
    assert(note === noteLog.note)

    console.log(note)
  })

  it("Change Leaf", async () => {

    const merkleTreeAccount = await ConcurrentMerkleTreeAccount.fromAccountAddress(
      connection,
      merkleTree.publicKey,
    )

    const index = changeLogEvent[0].index;
    const rootKey = merkleTreeAccount.tree.changeLogs[index].root
    const root = Array.from(rootKey.toBuffer());

    const txSignature = await program.methods
    .updateNote(
      index,
      root,
      ogNote,
      ammendedNote
    )
    .accounts({
      merkleTree: merkleTree.publicKey,
      treeAuthority: treeAuthority,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    })
    .rpc()
    const noteLog = await getNoteLog(connection, txSignature);
    console.log(noteLog);

  })
})
