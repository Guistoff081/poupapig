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

export const VISION_MODEL = "google/gemini-2.0-flash-001" as const
export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions" as const
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export type ExtractedTransaction = {
  amount: number
  date: string
  type: "income" | "expense"
  description: string | null
  suggestedCategory: string | null
}

export type ExtractionResult = {
  transactions: ExtractedTransaction[]
}

const SYSTEM_PROMPT = `
Você é um analisador de documentos financeiros para um app de finanças pessoais brasileiro (poupapig).
Entrada: uma imagem (recibo, nota fiscal, screenshot) OU um PDF (extrato bancário, fatura de cartão).
Saída: APENAS um objeto JSON com este formato:
{ "transactions": Array<{
    "amount": number,
    "date": "YYYY-MM-DD",
    "type": "income" | "expense",
    "description": string | null,
    "suggestedCategory": string | null
}> }

Regras:
- Retorne SEMPRE um array, mesmo para um único recibo (length 1).
- Créditos/depósitos/recebimentos = "income"; débitos/cobranças/pagamentos = "expense".
- amount deve ser > 0, um número decimal simples (sem "R$", sem ponto de milhar, ponto como separador decimal).
- date deve ser "YYYY-MM-DD"; se só DD/MM estiver visível, use o ano corrente.
- Ignore totais/subtotais/saldos; emita apenas os lançamentos individuais.
- suggestedCategory: nome curto da categoria em português, ex.: "Alimentação", "Transporte". null se não for possível determinar.
- description: descrição curta do estabelecimento/lançamento, máx 120 chars. null se não houver.
- Se o documento não for financeiro ou não contiver lançamentos identificáveis, retorne { "transactions": [] }.
- NÃO use markdown. NÃO adicione comentários. Apenas o JSON.
`.trim()

export function normalizeDate(s: string, now = new Date()): string | null {
  const s2 = s.trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(s2))
    return s2

  const dmyMatch = s2.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmyMatch) {
    const d = dmyMatch[1]!.padStart(2, "0")
    const m = dmyMatch[2]!.padStart(2, "0")
    const y = dmyMatch[3]
    return `${y}-${m}-${d}`
  }

  const dmMatch = s2.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (dmMatch) {
    const d = dmMatch[1]!.padStart(2, "0")
    const m = dmMatch[2]!.padStart(2, "0")
    const y = now.getFullYear()
    return `${y}-${m}-${d}`
  }

  return null
}

export function parseExtractionPayload(json: string): ExtractionResult {
  let stripped = json.trim()
  if (stripped.startsWith("```")) {
    stripped = stripped.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  }
  catch {
    throw new Error("IA retornou formato inválido")
  }

  if (
    !parsed
    || typeof parsed !== "object"
    || !Array.isArray((parsed as Record<string, unknown>).transactions)
  ) {
    throw new Error("IA retornou formato inválido")
  }

  const raw = (parsed as { transactions: unknown[] }).transactions
  const now = new Date()
  const transactions: ExtractedTransaction[] = []

  for (const item of raw) {
    if (!item || typeof item !== "object")
      continue
    const row = item as Record<string, unknown>

    const amount = parseAmount(row.amount)
    if (!Number.isFinite(amount) || amount <= 0)
      continue

    const rawDate = typeof row.date === "string" ? row.date : ""
    const date = normalizeDate(rawDate, now)
    if (!date)
      continue

    const type = row.type === "income" || row.type === "expense" ? row.type : null
    if (!type)
      continue

    const description
      = typeof row.description === "string" && row.description.trim()
        ? row.description.trim().slice(0, 120)
        : null

    const suggestedCategory
      = typeof row.suggestedCategory === "string" && row.suggestedCategory.trim()
        ? row.suggestedCategory.trim()
        : null

    transactions.push({ amount, date, type, description, suggestedCategory })
  }

  return { transactions }
}

export async function extractTransactionsFromDataUrl(dataUrl: string): Promise<ExtractionResult> {
  const config = useRuntimeConfig()
  const apiKey = config.openrouterApiKey as string | undefined
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: "IA não configurada" })
  }

  let response: { choices?: Array<{ message?: { content?: string } }> }
  try {
    response = await $fetch<{ choices?: Array<{ message?: { content?: string } }> }>(
      OPENROUTER_ENDPOINT,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://poupapig.app",
          "X-Title": "poupapig",
        },
        timeout: 60_000,
        body: {
          model: VISION_MODEL,
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: 4096,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: "Extraia as transações deste documento." },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        },
      },
    )
  }
  catch (err: unknown) {
    const h3err = err as { statusCode?: number } | null
    if (h3err?.statusCode && h3err.statusCode >= 400 && h3err.statusCode < 600) {
      throw createError({ statusCode: 502, statusMessage: "Falha ao chamar IA" })
    }
    throw createError({ statusCode: 502, statusMessage: "Falha ao chamar IA" })
  }

  const content = response?.choices?.[0]?.message?.content
  if (!content) {
    throw createError({ statusCode: 422, statusMessage: "IA retornou formato inválido" })
  }

  try {
    return parseExtractionPayload(content)
  }
  catch (e) {
    throw createError({
      statusCode: 422,
      statusMessage: e instanceof Error ? e.message : "IA retornou formato inválido",
    })
  }
}
