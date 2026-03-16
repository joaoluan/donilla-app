function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeSearchText(value) {
  const normalized = normalizeSearchText(value)
  return normalized ? normalized.split(' ').filter(Boolean) : []
}

function getDistanceTolerance(token) {
  if (token.length <= 3) return 0
  if (token.length <= 6) return 1
  return 2
}

function boundedLevenshtein(left, right, maxDistance) {
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1

  const previous = new Array(right.length + 1)
  const current = new Array(right.length + 1)

  for (let index = 0; index <= right.length; index += 1) {
    previous[index] = index
  }

  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row
    let minInRow = current[0]

    for (let col = 1; col <= right.length; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1
      current[col] = Math.min(
        previous[col] + 1,
        current[col - 1] + 1,
        previous[col - 1] + cost,
      )
      if (current[col] < minInRow) minInRow = current[col]
    }

    if (minInRow > maxDistance) return maxDistance + 1

    for (let col = 0; col <= right.length; col += 1) {
      previous[col] = current[col]
    }
  }

  return previous[right.length]
}

function scoreSearchMatch(search, values = []) {
  const normalizedSearch = normalizeSearchText(search)
  if (!normalizedSearch) return 1

  const normalizedValues = (Array.isArray(values) ? values : [values])
    .map((value) => normalizeSearchText(value))
    .filter(Boolean)

  if (!normalizedValues.length) return -1

  const fullMatch = normalizedValues.find((value) => value === normalizedSearch)
  if (fullMatch) {
    return 2600 - Math.min(fullMatch.length, 80)
  }

  const startsWith = normalizedValues.find((value) => value.startsWith(normalizedSearch))
  if (startsWith) {
    return 2200 - Math.min(startsWith.length, 200)
  }

  const contains = normalizedValues.find((value) => value.includes(normalizedSearch))
  if (contains) {
    return 1900 - Math.min(contains.indexOf(normalizedSearch), 500)
  }

  const searchTokens = tokenizeSearchText(normalizedSearch)
  const candidateTokens = [...new Set(normalizedValues.flatMap((value) => tokenizeSearchText(value)))]

  if (!searchTokens.length || !candidateTokens.length) return -1

  let score = 1200

  for (const token of searchTokens) {
    const prefixMatch = candidateTokens.find((candidate) => candidate.startsWith(token))
    if (prefixMatch) {
      score += 180
      continue
    }

    const containsToken = candidateTokens.find((candidate) => candidate.includes(token))
    if (containsToken) {
      score += 130
      continue
    }

    const tolerance = getDistanceTolerance(token)
    if (tolerance > 0) {
      const fuzzyMatch = candidateTokens.find((candidate) => boundedLevenshtein(token, candidate, tolerance) <= tolerance)
      if (fuzzyMatch) {
        score += 90
        continue
      }
    }

    return -1
  }

  return score - Math.min(candidateTokens.length * 3, 90)
}

module.exports = {
  normalizeSearchText,
  scoreSearchMatch,
}
