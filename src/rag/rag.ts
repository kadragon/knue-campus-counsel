import { createEmbedding, chatComplete, chatCompleteStream } from "../services/openai.js";
import { qdrantSearch, QdrantHit } from "../services/qdrant.js";
import { DocumentPayload } from "../core/types.js";
import { loadSystemPrompt, PerformanceTimer, log } from "../utils/index.js";

// 상수
const DEFAULT_POLICY_URL = "https://www.knue.ac.kr/www/contents.do?key=392";

// 통합 인터페이스
interface NormalizedHit {
  id: string | number;
  score: number;
  title: string;
  content: string;
  link: string;
  sourceType: "policy" | "board";
}

type EmbedFn = (q: string) => Promise<number[]>;
type SearchFn = (v: number[], query?: string) => Promise<NormalizedHit[]>;
type ChatFn = (prompt: {
  system: string;
  user: string;
  context: string;
}) => Promise<string>;

type ChatStreamFn = (prompt: {
  system: string;
  user: string;
  context: string;
}) => AsyncGenerator<string, void, unknown>;

// Qdrant 결과를 통합 인터페이스로 변환
function normalizeHits(hits: QdrantHit[]): NormalizedHit[] {
  return hits.map((hit) => {
    const p: DocumentPayload = hit.payload || {};
    const title = p.title || "무제";
    const content = p.content || p.chunk_text || "";
    const source = p.source || "";
    const linkField = p.link || "";
    const githubUrl = p.github_url || "";

    // sourceType과 link 결정
    let sourceType: "policy" | "board";
    let link: string;

    // 게시판 문서 조건:
    // 1. 명시적으로 'knue_board' 소스로 표시된 경우
    // 2. link 필드는 있지만 github_url이 없는 경우 (게시판 문서 패턴)
    //    - 규정 문서: github_url + preview_url 조합
    //    - 게시판 문서: link 필드만 존재
    if (source === "knue_board" || (linkField && !githubUrl)) {
      sourceType = "board";
      link = linkField || "";
    } else {
      sourceType = "policy";
      // preview_url이 있으면 사용, 없으면 기본값 사용
      link = p.preview_url || DEFAULT_POLICY_URL;
    }

    return {
      id: hit.id,
      score: hit.score,
      title,
      content,
      link,
      sourceType,
    };
  });
}

export function buildRag(opts: {
  embed: EmbedFn;
  search: SearchFn;
  chat: ChatFn;
  model: string;
  topK: number;
  scoreThreshold: number;
}) {
  const { embed, search, chat, scoreThreshold } = opts;
  return async function orchestrate(
    query: string
  ): Promise<{ answer: string; refs: { title?: string; url?: string }[] }> {
    const timer = new PerformanceTimer(`RAG Pipeline - "${query.slice(0, 50)}..."`);
    
    log('info', 'Starting RAG pipeline', {
      query: query.slice(0, 100),
      queryLength: query.length,
      model: opts.model,
      topK: opts.topK,
      scoreThreshold
    });
    
    try {
      timer.checkpoint('Starting embedding');
      const v = await embed(preprocess(query));
      
      timer.checkpoint('Starting vector search');
      const hits = await search(v, query);
      
      timer.checkpoint('Filtering results');
      const filtered = hits.filter(
        (h) => typeof h.score === "number" && h.score >= scoreThreshold
      );
      
      log('debug', 'Search results filtered', {
        totalHits: hits.length,
        filteredHits: filtered.length,
        scoreThreshold,
        avgScore: filtered.length > 0 ? filtered.reduce((sum, h) => sum + h.score, 0) / filtered.length : 0
      });
      
      if (!filtered.length) {
        timer.finish();
        log('info', 'No results found above threshold', { scoreThreshold });
        return { answer: "문서에서 해당 근거를 찾지 못했습니다.", refs: [] };
      }
      
      timer.checkpoint('Formatting context');
      const context = formatContext(filtered);
      const system = loadSystemPrompt();
      const user = query;
      
      timer.checkpoint('Starting chat completion');
      const content = await chat({ system, user, context });
      
      timer.checkpoint('Generating references');
      const refs = dedupeRefs(filtered);
      
      const totalTime = timer.finish();
      
      log('info', 'RAG pipeline completed successfully', {
        query: query.slice(0, 100),
        totalTime,
        resultsCount: filtered.length,
        refsCount: refs.length,
        responseLength: content.length
      });
      
      return { answer: content, refs };
    } catch (error) {
      const elapsed = timer.getElapsed();
      log('error', 'RAG pipeline failed', {
        query: query.slice(0, 100),
        elapsed,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  };
}

export function buildRagStream(opts: {
  embed: EmbedFn;
  search: SearchFn;
  chatStream: ChatStreamFn;
  model: string;
  topK: number;
  scoreThreshold: number;
}) {
  const { embed, search, chatStream, scoreThreshold } = opts;
  return async function* orchestrateStream(
    query: string
  ): AsyncGenerator<{ 
    type: 'context' | 'content' | 'refs' | 'done'; 
    data: any; 
  }, void, unknown> {
    const timer = new PerformanceTimer(`RAG Pipeline Stream - "${query.slice(0, 50)}..."`);
    
    log('info', 'Starting RAG pipeline stream', {
      query: query.slice(0, 100),
      queryLength: query.length,
      model: opts.model,
      topK: opts.topK,
      scoreThreshold
    });
    
    try {
      timer.checkpoint('Starting embedding');
      const v = await embed(preprocess(query));
      
      timer.checkpoint('Starting vector search');
      const hits = await search(v, query);
      
      timer.checkpoint('Filtering results');
      const filtered = hits.filter(
        (h) => typeof h.score === "number" && h.score >= scoreThreshold
      );
      
      log('debug', 'Search results filtered for stream', {
        totalHits: hits.length,
        filteredHits: filtered.length,
        scoreThreshold,
        avgScore: filtered.length > 0 ? filtered.reduce((sum, h) => sum + h.score, 0) / filtered.length : 0
      });
      
      if (!filtered.length) {
        timer.finish();
        log('info', 'No results found above threshold for stream', { scoreThreshold });
        yield { type: 'content', data: "문서에서 해당 근거를 찾지 못했습니다." };
        yield { type: 'refs', data: [] };
        yield { type: 'done', data: { totalTime: timer.getElapsed() } };
        return;
      }
      
      timer.checkpoint('Formatting context');
      const context = formatContext(filtered);
      const system = loadSystemPrompt();
      const user = query;
      
      // 컨텍스트 정보 먼저 전송
      yield { type: 'context', data: { resultsCount: filtered.length } };
      
      timer.checkpoint('Starting chat stream');
      const refs = dedupeRefs(filtered);
      
      // 스트리밍 응답 시작
      for await (const chunk of chatStream({ system, user, context })) {
        yield { type: 'content', data: chunk };
      }
      
      const totalTime = timer.finish();
      
      log('info', 'RAG pipeline stream completed successfully', {
        query: query.slice(0, 100),
        totalTime,
        resultsCount: filtered.length,
        refsCount: refs.length
      });
      
      // 참고문헌과 완료 정보 전송
      yield { type: 'refs', data: refs };
      yield { type: 'done', data: { totalTime, resultsCount: filtered.length, refsCount: refs.length } };
      
    } catch (error) {
      const elapsed = timer.getElapsed();
      log('error', 'RAG pipeline stream failed', {
        query: query.slice(0, 100),
        elapsed,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  };
}

export async function createEnhancedRag(cfg: {
  openaiApiKey: string;
  qdrantUrl: string;
  qdrantApiKey: string;
  qdrantCollection: string;
  boardCollection: string;
  model: string;
  boardTopK: number;
  policyTopK: number;
  scoreThreshold?: number;
}) {
  const { boardTopK, policyTopK } = cfg;
  const scoreThreshold = cfg.scoreThreshold ?? 0.2;

  const embed: EmbedFn = (q) =>
    createEmbedding({
      apiKey: cfg.openaiApiKey,
      input: q,
      model: "text-embedding-3-large",
    });

  const searchBoth = async (
    v: number[],
    query: string = ""
  ): Promise<NormalizedHit[]> => {
    log('debug', 'Starting parallel search across collections', {
      vectorDimensions: v.length,
      policyTopK,
      boardTopK,
      policyCollection: cfg.qdrantCollection,
      boardCollection: cfg.boardCollection
    });

    // 기본 컬렉션과 게시판 컬렉션에서 동시 검색
    const [mainResults, boardResults] = await Promise.all([
      qdrantSearch({
        url: cfg.qdrantUrl,
        apiKey: cfg.qdrantApiKey,
        collection: cfg.qdrantCollection,
        vector: v,
        limit: policyTopK,
        scoreThreshold,
      }),
      qdrantSearch({
        url: cfg.qdrantUrl,
        apiKey: cfg.qdrantApiKey,
        collection: cfg.boardCollection,
        vector: v,
        limit: boardTopK,
        scoreThreshold,
      }),
    ]);

    log('debug', 'Parallel search completed, processing results', {
      mainResultsCount: mainResults.length,
      boardResultsCount: boardResults.length,
      totalRawResults: mainResults.length + boardResults.length
    });

    // 결과 합치기 → normalize → rerank 순서로 처리
    const allResults = [...boardResults, ...mainResults];
    const normalizedResults = normalizeHits(allResults);
    const rerankedResults = rerankResults(normalizedResults, v, query);
    
    log('debug', 'Search results processed', {
      normalizedCount: normalizedResults.length,
      rerankedCount: rerankedResults.length,
      topScores: rerankedResults.slice(0, 3).map(r => r.score)
    });
    
    return rerankedResults;
  };

  const chat: ChatFn = async ({ system, user, context }) =>
    chatComplete({
      apiKey: cfg.openaiApiKey,
      model: cfg.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: buildUserMessage(user, context) },
      ],
      maxTokens: 500,
    });

  return buildRag({
    embed,
    search: searchBoth,
    chat,
    model: cfg.model,
    topK: policyTopK + boardTopK,
    scoreThreshold,
  });
}

export async function createEnhancedRagStream(cfg: {
  openaiApiKey: string;
  qdrantUrl: string;
  qdrantApiKey: string;
  qdrantCollection: string;
  boardCollection: string;
  model: string;
  boardTopK: number;
  policyTopK: number;
  scoreThreshold?: number;
}) {
  const { boardTopK, policyTopK } = cfg;
  const scoreThreshold = cfg.scoreThreshold ?? 0.2;

  const embed: EmbedFn = (q) =>
    createEmbedding({
      apiKey: cfg.openaiApiKey,
      input: q,
      model: "text-embedding-3-large",
    });

  const searchBoth = async (
    v: number[],
    query: string = ""
  ): Promise<NormalizedHit[]> => {
    log('debug', 'Starting parallel search across collections for stream', {
      vectorDimensions: v.length,
      policyTopK,
      boardTopK,
      policyCollection: cfg.qdrantCollection,
      boardCollection: cfg.boardCollection
    });

    // 기본 컬렉션과 게시판 컬렉션에서 동시 검색
    const [mainResults, boardResults] = await Promise.all([
      qdrantSearch({
        url: cfg.qdrantUrl,
        apiKey: cfg.qdrantApiKey,
        collection: cfg.qdrantCollection,
        vector: v,
        limit: policyTopK,
        scoreThreshold,
      }),
      qdrantSearch({
        url: cfg.qdrantUrl,
        apiKey: cfg.qdrantApiKey,
        collection: cfg.boardCollection,
        vector: v,
        limit: boardTopK,
        scoreThreshold,
      }),
    ]);

    log('debug', 'Parallel search completed for stream, processing results', {
      mainResultsCount: mainResults.length,
      boardResultsCount: boardResults.length,
      totalRawResults: mainResults.length + boardResults.length
    });

    // 결과 합치기 → normalize → rerank 순서로 처리
    const allResults = [...boardResults, ...mainResults];
    const normalizedResults = normalizeHits(allResults);
    const rerankedResults = rerankResults(normalizedResults, v, query);
    
    log('debug', 'Search results processed for stream', {
      normalizedCount: normalizedResults.length,
      rerankedCount: rerankedResults.length,
      topScores: rerankedResults.slice(0, 3).map(r => r.score)
    });
    
    return rerankedResults;
  };

  const chatStream: ChatStreamFn = async function* ({ system, user, context }) {
    yield* chatCompleteStream({
      apiKey: cfg.openaiApiKey,
      model: cfg.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: buildUserMessage(user, context) },
      ],
      maxTokens: 500,
      temperature: 0.1,
    });
  };

  return buildRagStream({
    embed,
    search: searchBoth,
    chatStream,
    model: cfg.model,
    topK: policyTopK + boardTopK,
    scoreThreshold,
  });
}

function preprocess(q: string): string {
  return q.trim().slice(0, 2000);
}

/**
 * 연관도 기반 결과 재정렬
 * 1. 벡터 유사도 점수 (기본)
 * 2. 키워드 매칭 점수
 * 3. 소스 타입 가중치 (게시물은 최신성, 규정은 정확성)
 */
function rerankResults(
  hits: NormalizedHit[],
  _queryVector: number[],
  query: string
): NormalizedHit[] {
  const queryKeywords = extractKeywords(query);

  const scoredHits = hits.map((hit) => {
    // 1. 기본 벡터 유사도 점수 (0.0 ~ 1.0)
    const vectorScore = hit.score || 0;

    // 2. 키워드 매칭 점수 (0.0 ~ 1.0)
    const keywordScore = calculateKeywordScore(
      hit.title + " " + hit.content,
      queryKeywords
    );

    // 3. 소스 타입 가중치
    let sourceWeight = 1.0;
    if (hit.sourceType === "board") {
      // 게시물: 최신 정보일 가능성이 높아 가중치 추가
      sourceWeight = 1.1;
    } else if (hit.sourceType === "policy") {
      // 규정: 정확성이 높아 가중치 추가
      sourceWeight = 1.05;
    }

    // 4. 종합 점수 계산 (벡터 점수 70%, 키워드 점수 30%)
    const finalScore = (vectorScore * 0.7 + keywordScore * 0.3) * sourceWeight;

    return {
      ...hit,
      finalScore,
    };
  });

  // 종합 점수 기준으로 내림차순 정렬
  return scoredHits
    .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))
    .map(({ finalScore, ...hit }) => hit); // finalScore 제거하고 원본 형태로 복원
}

/**
 * 쿼리에서 핵심 키워드 추출
 */
function extractKeywords(query: string): string[] {
  // 한글, 영문, 숫자만 남기고 공백으로 분리
  return query
    .replace(/[^\w가-힣\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1) // 1글자 제외
    .map((word) => word.toLowerCase());
}

/**
 * 키워드 매칭 점수 계산
 */
function calculateKeywordScore(text: string, keywords: string[]): number {
  if (!keywords.length) return 0;

  const lowerText = text.toLowerCase();
  const matchedKeywords = keywords.filter((keyword) =>
    lowerText.includes(keyword.toLowerCase())
  );

  // 매칭된 키워드 비율 계산
  return matchedKeywords.length / keywords.length;
}

function formatContext(hits: NormalizedHit[]): string {
  // 상위 3개 문서만 컨텍스트로 사용
  const topHits = hits.slice(0, 3);
  const parts = topHits.map((hit, i) => {
    const sourceTypeText = hit.sourceType === "board" ? "게시물" : "규정";

    return `## 참고 문서 #${i + 1}
**제목**: ${hit.title}
**출처**: ${sourceTypeText}
**링크**: ${hit.link}

${hit.content}`;
  });
  return parts.join("\n\n---\n\n");
}

function buildUserMessage(user: string, context: string): string {
  return `사용자 질의:\n${user}\n\n근거 후보:\n${context}\n\n규정/지침에 근거해 답변하고 마지막에 출처를 목록으로 제시하세요. 각 근거 후보에 제공된 '링크' 정보를 사용하여 모든 출처는 <a href="링크">제목</a> 형태로 표시하세요.`;
}

function dedupeRefs(hits: NormalizedHit[]): { title?: string; url?: string }[] {
  const set = new Set<string>();
  const out: { title?: string; url?: string }[] = [];
  for (const hit of hits) {
    const title: string | undefined = hit.title;
    const url: string | undefined = hit.link || undefined;
    const key = `${title ?? ""}${url ?? ""}`;
    if (set.has(key)) continue;
    set.add(key);
    out.push({ title, url });
  }
  return out;
}
