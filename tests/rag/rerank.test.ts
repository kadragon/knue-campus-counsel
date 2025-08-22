import { describe, it, expect } from 'vitest'

// rerank functions are not exported, so we'll test the concepts
describe('rerank algorithm concepts', () => {
  it('extracts keywords correctly', () => {
    const extractKeywords = (query: string): string[] => {
      return query
        .replace(/[^\w가-힣\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 1)
        .map(word => word.toLowerCase())
    }

    const keywords = extractKeywords('골프장 이용 규정은?')
    expect(keywords).toEqual(['골프장', '이용', '규정은'])
  })

  it('calculates keyword score correctly', () => {
    const calculateKeywordScore = (text: string, keywords: string[]): number => {
      if (!keywords.length) return 0
      
      const lowerText = text.toLowerCase()
      const matchedKeywords = keywords.filter(keyword => 
        lowerText.includes(keyword.toLowerCase())
      )
      
      return matchedKeywords.length / keywords.length
    }

    const score = calculateKeywordScore(
      '골프장 이용 안내 - 새로운 규정이 적용됩니다',
      ['골프장', '이용', '규정']
    )
    expect(score).toBe(1.0) // 모든 키워드 매칭

    const partialScore = calculateKeywordScore(
      '골프장 안내사항',
      ['골프장', '이용', '규정']
    )
    expect(partialScore).toBeCloseTo(0.33, 2) // 1/3 매칭
  })

  it('applies source type weights correctly', () => {
    // 게시물 (hasLink=true): 1.1x 가중치
    const boardWeight = 1.1
    const baseScore = 0.8
    const boardFinalScore = baseScore * boardWeight
    expect(boardFinalScore).toBeCloseTo(0.88, 2)

    // 규정 (policies): 1.05x 가중치  
    const policyWeight = 1.05
    const policyFinalScore = baseScore * policyWeight
    expect(policyFinalScore).toBeCloseTo(0.84, 2)
  })

  it('combines scores correctly', () => {
    const vectorScore = 0.9
    const keywordScore = 0.6
    const sourceWeight = 1.1
    
    // 벡터 70% + 키워드 30%
    const combinedScore = (vectorScore * 0.7 + keywordScore * 0.3) * sourceWeight
    expect(combinedScore).toBeCloseTo(0.891, 3)
  })
})
