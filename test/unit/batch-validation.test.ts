import { describe, expect, it } from "vitest"
import { validateBatchRow } from "~/server/utils/batch-validation"

const catMap = new Map([
  ["cat-expense-1", "expense"],
  ["cat-income-1", "income"],
])

describe("validateBatchRow", () => {
  const validExpense = {
    amount: 42.5,
    category_id: "cat-expense-1",
    date: "2026-03-15",
    description: "Mercado",
    type: "expense",
  }

  it("returns a valid row for a correct expense", () => {
    const result = validateBatchRow(validExpense, catMap)
    expect(result).toMatchObject({
      amount: 42.5,
      category_id: "cat-expense-1",
      date: "2026-03-15",
      description: "Mercado",
      type: "expense",
    })
  })

  it("returns a valid row for a correct income", () => {
    const result = validateBatchRow(
      { amount: 5000, category_id: "cat-income-1", date: "2026-03-01", description: "Salário", type: "income" },
      catMap,
    )
    expect(result.type).toBe("income")
    expect(result.amount).toBe(5000)
  })

  it("allows null category_id", () => {
    const result = validateBatchRow({ ...validExpense, category_id: null }, catMap)
    expect(result.category_id).toBeNull()
  })

  it("allows empty string category_id (treated as null)", () => {
    const result = validateBatchRow({ ...validExpense, category_id: "" }, catMap)
    expect(result.category_id).toBeNull()
  })

  it("trims description and returns null when empty", () => {
    const result = validateBatchRow({ ...validExpense, description: "   " }, catMap)
    expect(result.description).toBeNull()
  })

  it("returns null description when field is absent", () => {
    const result = validateBatchRow({ ...validExpense, description: undefined }, catMap)
    expect(result.description).toBeNull()
  })

  it("throws on missing amount", () => {
    expect(() => validateBatchRow({ ...validExpense, amount: undefined }, catMap)).toThrow("amount inválido")
  })

  it("throws on zero amount", () => {
    expect(() => validateBatchRow({ ...validExpense, amount: 0 }, catMap)).toThrow("amount inválido")
  })

  it("throws on negative amount", () => {
    expect(() => validateBatchRow({ ...validExpense, amount: -10 }, catMap)).toThrow("amount inválido")
  })

  it("accepts string amounts with comma as decimal separator", () => {
    const result = validateBatchRow({ ...validExpense, amount: "1234,56" }, catMap)
    expect(result.amount).toBe(1234.56)
  })

  it("throws on invalid type", () => {
    expect(() => validateBatchRow({ ...validExpense, type: "transfer" }, catMap)).toThrow("type inválido")
    expect(() => validateBatchRow({ ...validExpense, type: undefined }, catMap)).toThrow("type inválido")
  })

  it("throws on invalid date format", () => {
    expect(() => validateBatchRow({ ...validExpense, date: "15/03/2026" }, catMap)).toThrow("YYYY-MM-DD")
    expect(() => validateBatchRow({ ...validExpense, date: "not-a-date" }, catMap)).toThrow("YYYY-MM-DD")
    expect(() => validateBatchRow({ ...validExpense, date: undefined }, catMap)).toThrow("YYYY-MM-DD")
  })

  it("throws when category_id is not in the user's categories", () => {
    expect(() => validateBatchRow({ ...validExpense, category_id: "nonexistent-id" }, catMap)).toThrow(
      "Categoria não encontrada",
    )
  })

  it("throws when category type does not match transaction type", () => {
    expect(() =>
      validateBatchRow({ ...validExpense, category_id: "cat-income-1", type: "expense" }, catMap),
    ).toThrow("Categoria não corresponde ao tipo da transação")
  })

  it("accepts numeric string amounts without comma", () => {
    const result = validateBatchRow({ ...validExpense, amount: "99.99" }, catMap)
    expect(result.amount).toBe(99.99)
  })
})
