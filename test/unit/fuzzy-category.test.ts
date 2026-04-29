import { describe, expect, it } from "vitest"
import { fuzzyMatchCategory, normalize } from "~/app/utils/fuzzy-category"

const categories = [
  { id: "cat-1", name: "Alimentação", type: "expense" as const },
  { id: "cat-2", name: "Transporte", type: "expense" as const },
  { id: "cat-3", name: "Salário", type: "income" as const },
  { id: "cat-4", name: "Saúde", type: "expense" as const },
  { id: "cat-5", name: "Lazer", type: "expense" as const },
]

describe("normalize", () => {
  it("lowercases input", () => {
    expect(normalize("ALIMENTAÇÃO")).toBe("alimentacao")
  })

  it("strips accents", () => {
    expect(normalize("Saúde")).toBe("saude")
    expect(normalize("Alimentação")).toBe("alimentacao")
    expect(normalize("Transação")).toBe("transacao")
  })

  it("trims whitespace", () => {
    expect(normalize("  salário  ")).toBe("salario")
  })
})

describe("fuzzyMatchCategory", () => {
  it("returns id for exact match", () => {
    expect(fuzzyMatchCategory("Alimentação", "expense", categories)).toBe("cat-1")
  })

  it("matches despite accent differences", () => {
    expect(fuzzyMatchCategory("alimentacao", "expense", categories)).toBe("cat-1")
    expect(fuzzyMatchCategory("saude", "expense", categories)).toBe("cat-4")
  })

  it("matches despite case differences", () => {
    expect(fuzzyMatchCategory("TRANSPORTE", "expense", categories)).toBe("cat-2")
    expect(fuzzyMatchCategory("salário", "income", categories)).toBe("cat-3")
  })

  it("filters by type — income suggestion only matches income categories", () => {
    expect(fuzzyMatchCategory("Salário", "income", categories)).toBe("cat-3")
    expect(fuzzyMatchCategory("Salário", "expense", categories)).toBeNull()
  })

  it("returns null when no good match exists", () => {
    expect(fuzzyMatchCategory("Criptomoedas", "expense", categories)).toBeNull()
  })

  it("returns null for null input", () => {
    expect(fuzzyMatchCategory(null, "expense", categories)).toBeNull()
  })

  it("returns null for empty string input", () => {
    expect(fuzzyMatchCategory("", "expense", categories)).toBeNull()
  })

  it("returns null when candidate list is empty", () => {
    expect(fuzzyMatchCategory("Alimentação", "expense", [])).toBeNull()
  })

  it("returns null when no candidates match the given type", () => {
    const incomeOnly = [{ id: "cat-3", name: "Salário", type: "income" as const }]
    expect(fuzzyMatchCategory("Salário", "expense", incomeOnly)).toBeNull()
  })

  it("handles undefined category names gracefully", () => {
    const withNull = [
      ...categories,
      { id: "cat-x", name: undefined as unknown as string, type: "expense" as const },
    ]
    expect(fuzzyMatchCategory("Alimentação", "expense", withNull)).toBe("cat-1")
  })
})
