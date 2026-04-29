export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
}

function tokenize(s: string): Set<string> {
  return new Set(s.split(/\s+/).filter(Boolean))
}

function bigrams(s: string): Set<string> {
  const result = new Set<string>()
  const clean = s.replace(/\s+/g, " ")
  for (let i = 0; i < clean.length - 1; i++) {
    result.add(clean.slice(i, i + 2))
  }
  return result
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0)
    return 1
  let intersection = 0
  for (const v of a) {
    if (b.has(v))
      intersection++
  }
  return intersection / (a.size + b.size - intersection)
}

export function fuzzyMatchCategory(
  name: string | null | undefined,
  type: string,
  categories: Array<{ id: string; name: string | null | undefined; type: string }>,
): string | null {
  if (!name || !name.trim())
    return null

  const normName = normalize(String(name))
  const nameTokens = tokenize(normName)
  const nameBigrams = bigrams(normName)

  const candidates = categories.filter(c => c.type === type)
  if (candidates.length === 0)
    return null

  let bestId: string | null = null
  let bestScore = 0

  for (const cat of candidates) {
    const normCat = normalize(cat.name ? String(cat.name) : "")
    const catTokens = tokenize(normCat)
    const catBigrams = bigrams(normCat)

    const tokenScore = jaccard(nameTokens, catTokens)
    const bigramScore = jaccard(nameBigrams, catBigrams)
    const score = tokenScore * 0.6 + bigramScore * 0.4

    if (score > bestScore) {
      bestScore = score
      bestId = cat.id
    }
  }

  return bestScore > 0.5 ? bestId : null
}
