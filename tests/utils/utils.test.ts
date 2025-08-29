import { describe, it, expect } from 'vitest'
import { splitTelegramMessage, escapeHtml, renderMarkdownToTelegramHTML } from '../../src/utils/index'

describe('utils.splitTelegramMessage', () => {
  it('splits text into <=4096 chunks preserving words', () => {
    const max = 50
    const text = 'a '.repeat(60) + 'tail'
    const chunks = splitTelegramMessage(text, max)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(max)
    expect(chunks.join('')).toBe(text)
  })

  it('returns original when below limit', () => {
    const text = 'short text'
    const chunks = splitTelegramMessage(text, 4096)
    expect(chunks).toEqual([text])
  })

  it('handles long words by hard-splitting', () => {
    const longWord = 'x'.repeat(120)
    const chunks = splitTelegramMessage(longWord, 50)
    expect(chunks.every(c => c.length <= 50)).toBe(true)
    expect(chunks.join('')).toBe(longWord)
  })
})


describe('utils.escapeHtml', () => {
  it('escapes HTML special characters', () => {
    const raw = "<b>Bold & italic</b>"
    const escaped = escapeHtml(raw)
    expect(escaped).toBe('&lt;b&gt;Bold &amp; italic&lt;/b&gt;')
  })
})

describe('utils.renderMarkdownToTelegramHTML', () => {
  it('converts basic markdown to HTML', () => {
    const raw = '**볼드** *이탤릭* `코드`'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<b>볼드</b> <i>이탤릭</i> <code>코드</code>')
  })

  it('converts links to HTML', () => {
    const raw = '[링크 텍스트](https://example.com)'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<a href="https://example.com">링크 텍스트</a>')
  })

  it('escapes HTML special characters', () => {
    const raw = 'Text with < and > symbols & ampersand'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('Text with &lt; and &gt; symbols &amp; ampersand')
  })

  it('preserves dates and special characters without over-escaping', () => {
    const raw = '2025. 3. 4.(화) ~ 3. 14.(금) 18시'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('2025. 3. 4.(화) ~ 3. 14.(금) 18시')
  })

  it('removes MarkdownV2 escape sequences', () => {
    const raw = '2025\\. 3\\. 4\\.(화) \\~ 3\\. 14\\.(금) 18시'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('2025. 3. 4.(화) ~ 3. 14.(금) 18시')
  })

  it('preserves existing HTML tags while converting markdown', () => {
    const raw = 'Some <b>existing</b> **new bold** text'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('Some <b>existing</b> <b>new bold</b> text')
  })

  it('handles mixed content with escape sequences', () => {
    const raw = '안녕하세요\\! **골프장** 관련 (출처\\: \\[#1\\]) 내용입니다\\.'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('안녕하세요! <b>골프장</b> 관련 (출처: [#1]) 내용입니다.')
  })

  it('properly escapes URLs with special characters', () => {
    const raw = '[검색](https://example.com?q=test&category=한글)'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<a href="https://example.com?q=test&amp;category=한글">검색</a>')
  })

  it('handles links with quotes in URLs', () => {
    const raw = '[링크](https://example.com/path"with"quotes)'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<a href="https://example.com/path&quot;with&quot;quotes">링크</a>')
  })

  it('handles empty URLs gracefully', () => {
    const raw = '[텍스트]()'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<a href="">텍스트</a>')
  })

  it('handles multiple links in same text', () => {
    const raw = '[첫번째](https://first.com) and [두번째](https://second.com)'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<a href="https://first.com">첫번째</a> and <a href="https://second.com">두번째</a>')
  })

  it('handles nested markdown formatting in links', () => {
    const raw = '[**볼드** *이탤릭* `코드`](https://example.com)'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<a href="https://example.com"><b>볼드</b> <i>이탤릭</i> <code>코드</code></a>')
  })

  it('handles links with Korean characters', () => {
    const raw = '[한국교원대학교 규정집](https://www.knue.ac.kr/규정집)'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<a href="https://www.knue.ac.kr/규정집">한국교원대학교 규정집</a>')
  })

  it('handles complex URLs with multiple query parameters', () => {
    const raw = '[검색결과](https://www.knue.ac.kr/search?q=test&type=board&page=1&sort=desc)'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<a href="https://www.knue.ac.kr/search?q=test&amp;type=board&amp;page=1&amp;sort=desc">검색결과</a>')
  })

  it('handles URLs with fragments and special characters', () => {
    const raw = '[섹션 링크](https://example.com/page#section-1&param=value)'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<a href="https://example.com/page#section-1&amp;param=value">섹션 링크</a>')
  })

  it('preserves existing HTML links while converting markdown links', () => {
    const raw = 'See <a href="https://old.com">기존 링크</a> and [새 링크](https://new.com)'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('See <a href="https://old.com">기존 링크</a> and <a href="https://new.com">새 링크</a>')
  })

  it('handles malformed markdown links gracefully', () => {
    const raw = '[incomplete link without closing paren](https://example.com'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('[incomplete link without closing paren](https://example.com')
  })

  it('handles brackets and parentheses in non-link context', () => {
    const raw = 'Normal text with [brackets] and (parentheses) should remain'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('Normal text with [brackets] and (parentheses) should remain')
  })

  it('handles HTML entities in link text and URLs', () => {
    const raw = '[A&B 회사](https://example.com?company=A&B)'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<a href="https://example.com?company=A&amp;B">A&amp;B 회사</a>')
  })

  it('handles multiple markdown formats with HTML entities', () => {
    const raw = '**중요**: A&B < C > D 정보는 [여기서](https://site.com?q=A&B) 확인하세요'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<b>중요</b>: A&amp;B &lt; C &gt; D 정보는 <a href="https://site.com?q=A&amp;B">여기서</a> 확인하세요')
  })

  it('handles single quotes in URLs and text', () => {
    const raw = "[Student's Guide](https://example.com/student's-guide)"
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<a href="https://example.com/student\'s-guide">Student\'s Guide</a>')
  })

  it('handles KNUE department search URLs', () => {
    const raw = '[학사관리과 연락처](https://www.knue.ac.kr/www/selectSearchEmplList.do?key=444&searchKrwd=학사관리과)'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<a href="https://www.knue.ac.kr/www/selectSearchEmplList.do?key=444&amp;searchKrwd=학사관리과">학사관리과 연락처</a>')
  })

  it('handles dates and times in text without over-escaping', () => {
    const raw = '신청기간: 2025. 3. 4.(화) ~ 3. 14.(금) 18:00까지'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('신청기간: 2025. 3. 4.(화) ~ 3. 14.(금) 18:00까지')
  })

  it('handles phone numbers and email addresses', () => {
    const raw = '연락처: 043-230-3114, 이메일: admin@knue.ac.kr'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('연락처: 043-230-3114, 이메일: admin@knue.ac.kr')
  })

  it('handles mathematical expressions with angle brackets', () => {
    const raw = '조건: x < 100 이고 y > 50인 경우'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('조건: x &lt; 100 이고 y &gt; 50인 경우')
  })

  it('handles code blocks with HTML-like content', () => {
    const raw = '다음 코드를 참고하세요: `<div class="container">content</div>`'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('다음 코드를 참고하세요: <code>&lt;div class=&quot;container&quot;&gt;content&lt;/div&gt;</code>')
  })

  it('handles mixed Korean and English with special characters', () => {
    const raw = 'Title: "한국교원대학교" & "Korea National University of Education" <공지사항>'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('Title: &quot;한국교원대학교&quot; &amp; &quot;Korea National University of Education&quot; &lt;공지사항&gt;')
  })

  it('handles links with encoded characters', () => {
    const raw = '[규정집](https://www.knue.ac.kr/www/contents.do?key=392&param=value%20encoded)'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<a href="https://www.knue.ac.kr/www/contents.do?key=392&amp;param=value%20encoded">규정집</a>')
  })

  it('handles complex real-world KNUE content', () => {
    const raw = '**담당부서**: [교수지원과](https://www.knue.ac.kr/www/selectSearchEmplList.do?key=444&searchKrwd=교수지원과) (043-230-3114)\n\n관련 규정: [교수업적평가규정](https://www.knue.ac.kr/www/contents.do?key=392) 제5조'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<b>담당부서</b>: <a href="https://www.knue.ac.kr/www/selectSearchEmplList.do?key=444&amp;searchKrwd=교수지원과">교수지원과</a> (043-230-3114)\n\n관련 규정: <a href="https://www.knue.ac.kr/www/contents.do?key=392">교수업적평가규정</a> 제5조')
  })

  it('handles JavaScript code with variables', () => {
    const raw = '사용법: `const msg = "Hello " + name`'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('사용법: <code>const msg = &quot;Hello &quot; + name</code>')
  })

  it('handles XML/HTML entities in code', () => {
    const raw = '설정: `<config debug="true" env="dev"/>`'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('설정: <code>&lt;config debug=&quot;true&quot; env=&quot;dev&quot;/&gt;</code>')
  })

  it('handles nested quotes and brackets', () => {
    const raw = 'Example: `{"name": "test", "values": [1, 2, 3]}`'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('Example: <code>{&quot;name&quot;: &quot;test&quot;, &quot;values&quot;: [1, 2, 3]}</code>')
  })

  it('handles markdown inside existing HTML attributes', () => {
    const raw = '<span title="Important **note**">Content with *emphasis*</span>'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<span title="Important **note**">Content with <i>emphasis</i></span>')
  })

  it('handles consecutive markdown formatting', () => {
    const raw = '***볼드이탤릭*** **볼드** *이탤릭* `코드` `더많은코드`'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<i><b>볼드이탤릭</b></i> <b>볼드</b> <i>이탤릭</i> <code>코드</code> <code>더많은코드</code>')
  })

  it('handles URLs with Korean encoded parameters', () => {
    const raw = '[한글검색](https://search.knue.ac.kr?q=%ED%95%9C%EA%B8%80&type=all)'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<a href="https://search.knue.ac.kr?q=%ED%95%9C%EA%B8%80&amp;type=all">한글검색</a>')
  })

  it('handles extremely long URLs', () => {
    const longUrl = 'https://www.knue.ac.kr/very/long/path/with/many/segments?' + 'param1=value1&'.repeat(50) + 'end=true'
    const raw = `[긴 URL](${longUrl})`
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toContain('<a href="' + longUrl.replace(/&/g, '&amp;') + '">긴 URL</a>')
  })

  it('handles mixed markdown with line breaks and formatting', () => {
    const raw = '**제목**\n\n*부제목*\n\n일반 텍스트 < 특수문자 >\n\n[링크](https://example.com?a=1&b=2)\n\n`코드 블록`'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<b>제목</b>\n\n<i>부제목</i>\n\n일반 텍스트 &lt; 특수문자 &gt;\n\n<a href="https://example.com?a=1&amp;b=2">링크</a>\n\n<code>코드 블록</code>')
  })

  it('handles SQL queries in code blocks', () => {
    const raw = 'Query: `SELECT * FROM users WHERE name = "John" AND age > 25`'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('Query: <code>SELECT * FROM users WHERE name = &quot;John&quot; AND age &gt; 25</code>')
  })

  it('handles Telegram-style usernames and hashtags', () => {
    const raw = '@username 님이 #공지사항 태그를 사용했습니다'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('@username 님이 #공지사항 태그를 사용했습니다')
  })

  it('handles file paths and directories', () => {
    const raw = '파일 경로: `C:\\Users\\Student\\Documents\\과제.docx`'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('파일 경로: <code>C:\\Users\\Student\\Documents\\과제.docx</code>')
  })

  it('handles academic formatting with periods and parentheses', () => {
    const raw = '1. 첫번째 항목 (중요)\n2. 두번째 항목 (선택사항)\n   2.1 세부항목'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('1. 첫번째 항목 (중요)\n2. 두번째 항목 (선택사항)\n   2.1 세부항목')
  })

  it('handles Korean academic titles and degrees', () => {
    const raw = '**교수명**: 김교수 (Ph.D, 교육학박사)'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<b>교수명</b>: 김교수 (Ph.D, 교육학박사)')
  })

  it('handles course codes and credits', () => {
    const raw = '과목: **교육학개론** (EDU101, 3학점) - *필수과목*'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('과목: <b>교육학개론</b> (EDU101, 3학점) - <i>필수과목</i>')
  })

  it('handles mixed English and Korean with special symbols', () => {
    const raw = 'GPA: 4.5/4.5 (A+), 평점: **우수** ★★★★★'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('GPA: 4.5/4.5 (A+), 평점: <b>우수</b> ★★★★★')
  })

  it('handles empty and whitespace-only code blocks', () => {
    const raw = '빈 코드: `` 공백 코드: `   `'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('빈 코드: <code></code> 공백 코드: <code>   </code>')
  })

  it('handles emoji in text and formatting', () => {
    const raw = '**중요공지** 📢: *필독사항* ⭐ 입니다!'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<b>중요공지</b> 📢: <i>필독사항</i> ⭐ 입니다!')
  })

  it('handles academic grade formats', () => {
    const raw = '성적: A+ (95점 이상), B+ (85-94점), C+ (75-84점)'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('성적: A+ (95점 이상), B+ (85-94점), C+ (75-84점)')
  })
})
