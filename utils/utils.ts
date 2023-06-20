import {
  SPL_NOOP_PROGRAM_ID,
  deserializeApplicationDataEvent,
} from "@solana/spl-account-compression"
import { Connection, PublicKey } from "@solana/web3.js"
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes"

export async function getApplicationData(
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

  let data: string
  for (let i = relevantInnerIxs.length - 1; i >= 0; i--) {
    try {
      // Try to decode and deserialize the instruction data
      const changeLogEvent = deserializeApplicationDataEvent(
        Buffer.from(bs58.decode(relevantInnerIxs[i]?.data!))
      )

      // Get the application data
      const applicationData = changeLogEvent.fields[0].applicationData

      // Remove the first 4 bytes
      // Otherwise returns "\u000b\u0000\u0000\u0000hello world"
      const cleanedData = applicationData.slice(4)

      const decoder = new TextDecoder("utf-8")
      data = decoder.decode(cleanedData)

      if (data !== undefined) {
        break
      }
    } catch (__) {}
  }

  return data
}
