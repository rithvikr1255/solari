const CODE_WORD_RE = /[A-Z]{2,}|[a-z][A-Z]|[_\-./\\@#<>{}[\]|]|^\d/

export function hasMisspelling(text: string): boolean {
  const words = text.match(/\b[a-zA-Z]{3,}\b/g) ?? []
  const toCheck = words.filter((w) => !CODE_WORD_RE.test(w))
  if (toCheck.length === 0) return false
  const results = window.api.checkSpelling(toCheck)
  return results.some((correct) => !correct)
}
