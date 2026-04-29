import { describe, expect, it } from "vitest"
import { normalizeDate, parseExtractionPayload } from "~/server/utils/ai-extraction"

describe("normalizeDate", () => {
  const fixedNow = new Date("2026-04-28")

  it("accepts YYYY-MM-DD unchanged", () => {
    expect(normalizeDate("2026-03-15", fixedNow)).toBe("2026-03-15")
  })

  it("converts DD/MM/YYYY to ISO", () => {
    expect(normalizeDate("15/03/2026", fixedNow)).toBe("2026-03-15")
    expect(normalizeDate("01/01/2025", fixedNow)).toBe("2025-01-01")
  })

  it("converts D/M/YYYY (single digits) to ISO", () => {
    expect(normalizeDate("5/3/2026", fixedNow)).toBe("2026-03-05")
  })

  it("converts DD/MM (no year) using the injected current year", () => {
    expect(normalizeDate("15/03", fixedNow)).toBe("2026-03-15")
    expect(normalizeDate("01/01", fixedNow)).toBe("2026-01-01")
  })

  it("returns null for unrecognised formats", () => {
    expect(normalizeDate("not a date", fixedNow)).toBeNull()
    expect(normalizeDate("", fixedNow)).toBeNull()
    expect(normalizeDate("15-03-2026", fixedNow)).toBeNull()
  })
})

describe("parseExtractionPayload", () => {
  it("parses a valid single-transaction payload", () => {
    const json = JSON.stringify({
      transactions: [
        {
          amount: 42.5,
          date: "2026-03-15",
          type: "expense",
          description: "Padaria São Jorge",
          suggestedCategory: "Alimentação",
        },
      ],
    })
    const result = parseExtractionPayload(json)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0]).toMatchObject({
      amount: 42.5,
      date: "2026-03-15",
      type: "expense",
      description: "Padaria São Jorge",
      suggestedCategory: "Alimentação",
    })
  })

  it("parses multiple transactions", () => {
    const json = JSON.stringify({
      transactions: [
        { amount: 10, date: "2026-03-01", type: "expense", description: null, suggestedCategory: null },
        { amount: 5000, date: "2026-03-05", type: "income", description: "Salário", suggestedCategory: "Salário" },
      ],
    })
    const result = parseExtractionPayload(json)
    expect(result.transactions).toHaveLength(2)
  })

  it("returns empty array when transactions is empty", () => {
    const json = JSON.stringify({ transactions: [] })
    const result = parseExtractionPayload(json)
    expect(result.transactions).toHaveLength(0)
  })

  it("strips markdown code fences before parsing", () => {
    const inner = JSON.stringify({ transactions: [{ amount: 10, date: "2026-03-01", type: "expense", description: null, suggestedCategory: null }] })
    const json = `\`\`\`json\n${inner}\n\`\`\``
    const result = parseExtractionPayload(json)
    expect(result.transactions).toHaveLength(1)
  })

  it("skips rows with invalid amount", () => {
    const json = JSON.stringify({
      transactions: [
        { amount: -5, date: "2026-03-01", type: "expense", description: null, suggestedCategory: null },
        { amount: 0, date: "2026-03-01", type: "expense", description: null, suggestedCategory: null },
        { amount: "not a number", date: "2026-03-01", type: "expense", description: null, suggestedCategory: null },
        { amount: 20, date: "2026-03-01", type: "expense", description: null, suggestedCategory: null },
      ],
    })
    const result = parseExtractionPayload(json)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0]!.amount).toBe(20)
  })

  it("handles comma-as-decimal amounts from AI output", () => {
    const json = JSON.stringify({
      transactions: [
        { amount: "1234,56", date: "2026-03-01", type: "expense", description: null, suggestedCategory: null },
      ],
    })
    const result = parseExtractionPayload(json)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0]!.amount).toBe(1234.56)
  })

  it("skips rows with invalid date", () => {
    const json = JSON.stringify({
      transactions: [
        { amount: 10, date: "not-a-date", type: "expense", description: null, suggestedCategory: null },
        { amount: 20, date: "2026-03-15", type: "expense", description: null, suggestedCategory: null },
      ],
    })
    const result = parseExtractionPayload(json)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0]!.amount).toBe(20)
  })

  it("skips rows with invalid type", () => {
    const json = JSON.stringify({
      transactions: [
        { amount: 10, date: "2026-03-01", type: "transfer", description: null, suggestedCategory: null },
        { amount: 20, date: "2026-03-01", type: "income", description: null, suggestedCategory: null },
      ],
    })
    const result = parseExtractionPayload(json)
    expect(result.transactions).toHaveLength(1)
  })

  it("clamps description to 120 characters", () => {
    const longDesc = "A".repeat(200)
    const json = JSON.stringify({
      transactions: [{ amount: 10, date: "2026-03-01", type: "expense", description: longDesc, suggestedCategory: null }],
    })
    const result = parseExtractionPayload(json)
    expect(result.transactions[0]!.description).toHaveLength(120)
  })

  it("throws on invalid JSON", () => {
    expect(() => parseExtractionPayload("not json at all")).toThrow("IA retornou formato inválido")
  })

  it("throws when payload is not an object with transactions array", () => {
    expect(() => parseExtractionPayload(JSON.stringify({ transactions: "oops" }))).toThrow(
      "IA retornou formato inválido",
    )
    expect(() => parseExtractionPayload(JSON.stringify([1, 2, 3]))).toThrow(
      "IA retornou formato inválido",
    )
    expect(() => parseExtractionPayload(JSON.stringify(null))).toThrow(
      "IA retornou formato inválido",
    )
  })

  it("converts DD/MM/YYYY dates found in AI output", () => {
    const json = JSON.stringify({
      transactions: [{ amount: 10, date: "15/03/2026", type: "expense", description: null, suggestedCategory: null }],
    })
    const result = parseExtractionPayload(json)
    expect(result.transactions[0]!.date).toBe("2026-03-15")
  })
})
