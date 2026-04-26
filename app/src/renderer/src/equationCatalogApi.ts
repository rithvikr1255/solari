import {
  setEquationCatalog,
  setFormulaHint,
  type EquationEntry
} from './referenceContext'

export const SOLARI_API = 'http://localhost:3001'

export async function runEquationCatalogScan(referenceText: string): Promise<void> {
  const slice = referenceText.slice(0, 35000)
  setFormulaHint('Scanning reference for formulas…')
  try {
    const catRes = await fetch(`${SOLARI_API}/api/equation-catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: slice })
    })
    const catBody = (await catRes.json()) as { equations?: unknown; error?: string }
    const list = Array.isArray(catBody.equations) ? catBody.equations : []
    setEquationCatalog(list as EquationEntry[])
    if (!catRes.ok) {
      setFormulaHint(
        typeof catBody.error === 'string'
          ? catBody.error
          : 'Could not build formula list. Check that the API server is running and your Anthropic key is set.'
      )
    } else if (list.length === 0) {
      setFormulaHint(
        'No formulas were found. The document may contain no mathematical content, or the text could not be read (scanned image PDF).'
      )
    } else {
      setFormulaHint('')
    }
  } catch {
    setEquationCatalog([])
    setFormulaHint(
      'Formula catalog request failed (network). Is the server running on port 3001?'
    )
  }
}
