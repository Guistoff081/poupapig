function parseAmount(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw))
    return raw
  if (typeof raw === "string") {
    const normalized = raw.trim().replace(",", ".")
    const n = Number(normalized)
    if (Number.isFinite(n))
      return n
  }
  return Number.NaN
}

export type BatchRowInput = {
  amount?: unknown
  category_id?: string | null
  date?: string
  description?: string | null
  type?: string
}

export type ValidatedRow = {
  amount: number
  category_id: string | null
  date: string
  description: string | null
  type: "income" | "expense"
}

export function validateBatchRow(
  raw: BatchRowInput,
  catMap: Map<string, string>,
): ValidatedRow {
  const amount = parseAmount(raw.amount)
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("amount inválido")

  const type = raw.type
  if (type !== "income" && type !== "expense")
    throw new Error("type inválido")

  const date = raw.date?.trim()
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("date deve estar no formato YYYY-MM-DD")

  const category_id
    = raw.category_id === undefined || raw.category_id === null || raw.category_id === ""
      ? null
      : String(raw.category_id).trim() || null

  if (category_id) {
    const catType = catMap.get(category_id)
    if (!catType)
      throw new Error("Categoria não encontrada")
    if (catType !== type)
      throw new Error("Categoria não corresponde ao tipo da transação")
  }

  const description
    = raw.description === undefined || raw.description === null
      ? null
      : String(raw.description).trim() || null

  return { amount, category_id, date, description, type }
}
