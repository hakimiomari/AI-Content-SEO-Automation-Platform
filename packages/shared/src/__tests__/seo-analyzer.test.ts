import { describe, expect, it } from 'vitest';
import { analyzeSeo, countPhraseOccurrences, countWords, extractHeadings, stripHtml } from '../seo';

const KEYWORD = 'content marketing strategy';

const GOOD_HTML = `
<h1>How to Build a Content Marketing Strategy That Works</h1>
<p>A content marketing strategy is a plan for the content you publish and why you publish it. It tells you who you write for, what they need, and how each post helps your business. Without a plan, teams publish at random and traffic stays flat. This guide walks through seven simple steps you can finish in a week.</p>
<img src="/images/planning-board.jpg" alt="A team planning content topics on a whiteboard" />
<h2>What Is a Content Marketing Strategy?</h2>
<p>It is the link between your business goals and the articles, videos, and emails you create. A good plan names the audience, the topics you own, and the results you expect. It also sets a rhythm so content ships on time. Think of it as a map: it does not write the words for you, but it keeps every piece pointed in the same direction.</p>
<h2>Step 1: Define Your Buyer Personas</h2>
<p>Start with the people you want to reach. Talk to sales and support, read reviews, and note the questions that come up again and again. Turn those notes into two or three buyer personas. Each one should list goals, pain points, and the words the person uses to describe them.</p>
<h3>Interview real customers</h3>
<p>Ten short calls beat a hundred guesses. Ask what they searched for before they found you and what almost stopped them from buying. Write down exact phrases, because those phrases become your keywords later.</p>
<h2>Step 2: Run a Content Audit</h2>
<p>Before you write anything new, look at what you already have. A content audit lists every page, its traffic, its ranking keywords, and its last update date. You will find pages to refresh, pages to merge, and pages to delete. Refreshing an old post often brings results faster than a brand new one. See our guide on <a href="/blog/seo-basics">SEO basics</a> for a simple audit template.</p>
<h3>Score each page</h3>
<p>Give every page a quick score from one to five for traffic, relevance, and quality. Sort by score. The low scores at the bottom are your first fixes, and the high scores at the top show you what already works.</p>
<h2>Step 3: Plan Topics and an Editorial Calendar</h2>
<p>Group your keywords into topics, then pick one pillar page per topic and a few supporting posts. Put them on an editorial calendar with an owner and a due date. A calendar makes the work visible and keeps the team honest. Publish on a steady schedule you can hold for six months rather than a burst you cannot sustain.</p>
<p>Match each piece to a stage of the journey. Early-stage readers want clear answers and examples. Late-stage readers want comparisons, pricing, and proof. Google explains how helpful, people-first content is judged in its <a href="https://developers.google.com/search/docs/fundamentals/creating-helpful-content">search documentation</a>, and the same rules apply to your plan.</p>
<h2>Step 4: Measure What Matters</h2>
<p>Pick a small set of numbers and check them every month. Organic traffic, rankings for target keywords, sign-ups, and assisted revenue are enough for most teams. Tie each number back to a goal so you know when to change course. A content marketing strategy that nobody measures is just a wish list.</p>
<h2>Frequently Asked Questions</h2>
<h3>How long does it take to see results?</h3>
<p>Most sites see early movement in three to four months and clear gains within six to nine months. Refreshed pages move faster than new ones.</p>
<h3>How often should I update the plan?</h3>
<p>Review the plan every quarter. Keep what works, cut what does not, and add topics your personas have started asking about.</p>
<h2>Conclusion</h2>
<p>Know your reader, audit what you have, plan on a calendar, and measure the results. Do these four things well and your content will compound month after month. Start with one persona and one topic this week, and build from there.</p>
`;

const BAD_HTML = `
<div>Welcome to our site. We do things. It was built by us and it is loved by many people around the world for many reasons that we could list here.</div>
<div><img src="/hero.png"></div>
`;

describe('stripHtml / countWords', () => {
  it('strips tags, scripts and entities', () => {
    const text = stripHtml('<p>Hello&nbsp;<b>world</b> &amp; friends</p><script>var x=1;</script>');
    expect(text).toBe('Hello world & friends');
    expect(countWords(text)).toBe(3);
  });

  it('extracts headings with levels', () => {
    const headings = extractHeadings('<h1>Main</h1><h2 class="x">Sub <em>one</em></h2>');
    expect(headings).toEqual([
      { level: 1, text: 'Main' },
      { level: 2, text: 'Sub one' },
    ]);
  });

  it('counts word-bounded phrase occurrences', () => {
    expect(countPhraseOccurrences('SEO tips. seo  tips! seotips', 'seo tips')).toBe(2);
  });
});

describe('analyzeSeo', () => {
  it('scores a well optimised article above 70', () => {
    const result = analyzeSeo({
      html: GOOD_HTML,
      keyword: KEYWORD,
      metaTitle: 'Content Marketing Strategy: A Practical 7-Step Guide',
      metaDescription:
        'Learn how to build a content marketing strategy that grows organic traffic with a simple seven-step plan, real examples and a free checklist.',
      secondaryKeywords: ['editorial calendar', 'buyer personas', 'content audit'],
      siteDomain: 'example.com',
    });

    expect(result.score).toBeGreaterThan(70);
    expect(result.wordCount).toBeGreaterThan(600);
    expect(result.stats.h1Count).toBe(1);
    expect(result.stats.h2Count).toBeGreaterThanOrEqual(3);
    expect(result.stats.internalLinks).toBe(1);
    expect(result.stats.externalLinks).toBe(1);
    expect(result.stats.secondaryKeywordsMissing).toEqual([]);
    expect(result.checks.find((c) => c.key === 'h1-keyword')?.passed).toBe(true);
    expect(result.checks.find((c) => c.key === 'keyword-density')?.passed).toBe(true);
    expect(result.readability.fleschReadingEase).toBeGreaterThanOrEqual(50);
  });

  it('scores a thin, unstructured page below 40', () => {
    const result = analyzeSeo({ html: BAD_HTML, keyword: KEYWORD });

    expect(result.score).toBeLessThan(40);
    expect(result.checks.find((c) => c.key === 'h1-single')?.passed).toBe(false);
    expect(result.checks.find((c) => c.key === 'title-length')?.passed).toBe(false);
    expect(result.checks.find((c) => c.key === 'word-count')?.passed).toBe(false);
    expect(result.checks.find((c) => c.key === 'image-alt')?.passed).toBe(false);
    expect(result.suggestions.length).toBeGreaterThan(5);
  });

  it('flags keyword stuffing', () => {
    const stuffed = `<h1>${KEYWORD}</h1><p>${Array(30).fill(KEYWORD).join(' ')}</p>`;
    const result = analyzeSeo({ html: stuffed, keyword: KEYWORD });
    const density = result.checks.find((c) => c.key === 'keyword-density');
    expect(density?.passed).toBe(false);
    expect(density?.severity).toBe('error');
  });

  it('omits the secondary keyword check when none are provided', () => {
    const result = analyzeSeo({ html: GOOD_HTML, keyword: KEYWORD });
    expect(result.checks.some((c) => c.key === 'secondary-keywords')).toBe(false);
  });
});
