import { serverSupabaseClient } from "#supabase/server"
import type { TablesInsert } from "~/types/database.types"
import { requireAuthUserId } from "../../utils/require-auth-user"
import { validateBatchRow, type BatchRowInput } from "../../utils/batch-validation"

export default defineEventHandler(async (event) => {
  const userId = await requireAuthUserId(event)

  const body = await readBody<{ transactions?: BatchRowInput[] }>(event)
  const items = body?.transactions

  if (!Array.isArray(items) || items.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "transactions deve ser um array não-vazio",
    })
  }

  if (items.length > 200) {
    throw createError({
      statusCode: 400,
      statusMessage: "Máximo de 200 transações por importação",
    })
  }

  const client = await serverSupabaseClient(event)

  const { data: cats, error: catsErr } = await client
    .from("categories")
    .select("id, type")
    .eq("user_id", userId)

  if (catsErr) {
    throw createError({ statusCode: 500, statusMessage: catsErr.message })
  }

  const catMap = new Map((cats ?? []).map(c => [c.id, c.type] as const))

  const toInsert: TablesInsert<"transactions">[] = []
  const failed: Array<{ index: number; error: string }> = []

  for (let i = 0; i < items.length; i++) {
    const raw = items[i]!
    try {
      const row = validateBatchRow(raw, catMap as Map<string, string>)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toInsert.push({ ...row, category_id: row.category_id as any, user_id: userId })
    }
    catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      failed.push({ index: i, error: msg })
    }
  }

  let insertedCount = 0
  if (toInsert.length > 0) {
    const { data, error } = await client
      .from("transactions")
      .insert(toInsert)
      .select("id")

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    insertedCount = data?.length ?? 0
  }

  return { inserted: insertedCount, failed }
})
