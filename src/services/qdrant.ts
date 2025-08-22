import { fetchWithRetry } from "../utils/http.js";
import { measureAsync, log } from "../utils/utils.js";
type FetchLike = typeof fetch;

export type QdrantHit = {
  id: string | number;
  score: number;
  payload?: Record<string, any>;
};

export async function qdrantSearch(opts: {
  url: string;
  apiKey: string;
  collection: string;
  vector: number[];
  limit: number;
  filter?: Record<string, any>;
  scoreThreshold?: number;
  fetchImpl?: FetchLike;
}): Promise<QdrantHit[]> {
  return measureAsync(`Qdrant Search (${opts.collection})`, async () => {
    const {
      url,
      apiKey,
      collection,
      vector,
      limit,
      filter,
      scoreThreshold,
      fetchImpl = fetch,
    } = opts;
    
    log('debug', 'Starting Qdrant search', {
      collection,
      vectorDimensions: vector.length,
      limit,
      scoreThreshold,
      hasFilter: !!filter
    });
    
    const endpoint = `${url.replace(/\/$/, "")}/collections/${encodeURIComponent(
      collection
    )}/points/search`;
    
    const body: any = {
      vector,
      limit,
      with_payload: { include: ["title", "content", "preview_url", "link"] },
    };
    if (filter) body.filter = filter;
    if (typeof scoreThreshold === "number") body.score_threshold = scoreThreshold;
    
    const res = await fetchWithRetry(
      endpoint,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify(body),
      },
      { fetchImpl }
    );
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Qdrant search error: ${res.status} - ${errorText}`);
    }
    
    const json = (await res.json()) as any;
    const results = (json.result ?? []) as QdrantHit[];
    
    log('debug', 'Qdrant search completed', {
      collection,
      resultsCount: results.length,
      avgScore: results.length > 0 ? results.reduce((sum, r) => sum + r.score, 0) / results.length : 0,
      topScore: results.length > 0 ? Math.max(...results.map(r => r.score)) : 0
    });
    
    return results;
  });
}
