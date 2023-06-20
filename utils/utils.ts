import {
  SPL_NOOP_PROGRAM_ID,
  deserializeApplicationDataEvent,
} from "@solana/spl-account-compression"
import { Connection, PublicKey } from "@solana/web3.js"
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes"
import { deserialize } from "borsh"

export async function getNote(
  connection: Connection,
  txSignature: string,
  programId: PublicKey
) {
  // Confirm the transaction, otherwise the getTransaction sometimes returns null
  const latestBlockHash = await connection.getLatestBlockhash()
  await connection.confirmTransaction({
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    signature: txSignature,
  })

  // Get the transaction info using the tx signature
  const txInfo = await connection.getTransaction(txSignature, {
    maxSupportedTransactionVersion: 0,
  })

  // Function to check the program Id of an instruction
  const isProgramId = (instruction, programId) =>
    txInfo?.transaction.message.staticAccountKeys[
      instruction.programIdIndex
    ].toBase58() === programId

  // Find the index of the program instruction
  const relevantIndex =
    txInfo!.transaction.message.compiledInstructions.findIndex((instruction) =>
      isProgramId(instruction, programId.toBase58())
    )

  // If there's no matching instruction, exit
  if (relevantIndex < 0) {
    return
  }

  // Get the inner instructions related to the program instruction
  const relevantInnerInstructions =
    txInfo!.meta?.innerInstructions?.[relevantIndex].instructions

  // Filter out the instructions that aren't no-ops
  const relevantInnerIxs = relevantInnerInstructions.filter((instruction) =>
    isProgramId(instruction, SPL_NOOP_PROGRAM_ID.toBase58())
  )

  let note: NoteSchema
  for (let i = relevantInnerIxs.length - 1; i >= 0; i--) {
    try {
      // Try to decode and deserialize the instruction data
      const applicationDataEvent = deserializeApplicationDataEvent(
        Buffer.from(bs58.decode(relevantInnerIxs[i]?.data!))
      )

      // Get the application data
      const applicationData = applicationDataEvent.fields[0].applicationData

      // Deserialize the application data into NoteSchema
      note = deserialize(
        NoteSchemaSchema,
        NoteSchema,
        Buffer.from(applicationData)
      )

      if (note !== undefined) {
        break
      }
    } catch (__) {}
  }

  return note
}

class NoteSchema {
  leaf_node: Uint8Array
  message: string

  constructor(properties: { leaf_node: Uint8Array; message: string }) {
    this.leaf_node = properties.leaf_node
    this.message = properties.message
  }
}

const NoteSchemaSchema = new Map([
  [
    NoteSchema,
    {
      kind: "struct",
      fields: [
        ["leaf_node", [32]], // Array of 32 `u8`
        ["message", "string"],
      ],
    },
  ],
])
