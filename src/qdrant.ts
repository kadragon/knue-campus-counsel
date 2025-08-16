type FetchLike = typeof fetch

export type QdrantHit = {
  id: string | number
  score: number
  payload?: Record<string, any>
}

export async function qdrantSearch(opts: {
  url: string
  apiKey: string
  collection: string
  vector: number[]
  limit: number
  filter?: Record<string, any>
  scoreThreshold?: number
  fetchImpl?: FetchLike
}): Promise<QdrantHit[]> {
  const { url, apiKey, collection, vector, limit, filter, scoreThreshold, fetchImpl = fetch } = opts
  const endpoint = `${url.replace(/\/$/, '')}/collections/${encodeURIComponent(collection)}/points/search`
  const body: any = { vector, limit, with_payload: true }
  if (filter) body.filter = filter
  if (typeof scoreThreshold === 'number') body.score_threshold = scoreThreshold
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Qdrant search error: ${res.status}`)
  const json = await res.json() as any
  return (json.result ?? []) as QdrantHit[]
}

