import { createEmbedding, chatComplete } from "./openai";
import { qdrantSearch, QdrantHit } from "./qdrant";
import { DocumentPayload } from "./types";
import { loadSystemPrompt } from "./utils";

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
    const v = await embed(preprocess(query));
    const hits = await search(v, query);
    const filtered = hits.filter(
      (h) => typeof h.score === "number" && h.score >= scoreThreshold
    );
    if (!filtered.length) {
      return { answer: "문서에서 해당 근거를 찾지 못했습니다.", refs: [] };
    }
    const context = formatContext(filtered);
    const system = loadSystemPrompt();
    const user = query;
    const content = await chat({ system, user, context });
    const refs = dedupeRefs(filtered);
    return { answer: content, refs };
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

    // 결과 합치기 → normalize → rerank 순서로 처리
    const allResults = [...boardResults, ...mainResults];
    const normalizedResults = normalizeHits(allResults);
    return rerankResults(normalizedResults, v, query);
  };

  const chat: ChatFn = async ({ system, user, context }) =>
    chatComplete({
      apiKey: cfg.openaiApiKey,
      model: cfg.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: buildUserMessage(user, context) },
      ],
      maxTokens: 1000,
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
  const parts = hits.map((hit, i) => {
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
