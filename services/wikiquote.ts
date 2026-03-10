export interface WikiquoteQuote {
  author: string;
  quote: string;
  url: string;
  deathYear: number;
}

const WIKIQUOTE_API = 'https://en.wikiquote.org/w/api.php?origin=*';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php?origin=*';

function buildUrl(base: string, params: Record<string, string>): string {
  const usp = new URLSearchParams(params);
  return `${base}${base.includes('?') ? '&' : '?'}${usp.toString()}`;
}

function normalizeQuoteText(text: string): string {
  return text
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\s*["'“”‘’]+|["'“”‘’]+\s*$/g, '')
    .trim();
}

function extractCandidateQuotesFromHtml(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items = Array.from(doc.querySelectorAll('.mw-parser-output > ul > li')) as HTMLElement[];
  const results: string[] = [];
  for (const el of items) {
    const t = normalizeQuoteText(el.textContent || '');
    if (!t) continue;
    if (t.length < 40) continue;
    if (t.length > 280) continue;
    results.push(t);
  }
  return results;
}

async function wikiquoteJson(params: Record<string, string>): Promise<any> {
  const url = buildUrl(WIKIQUOTE_API, { format: 'json', ...params });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wikiquote Error: ${res.status}`);
  return res.json();
}

async function wikidataJson(params: Record<string, string>): Promise<any> {
  const url = buildUrl(WIKIDATA_API, { format: 'json', ...params });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wikidata Error: ${res.status}`);
  return res.json();
}

async function getWikidataIdForWikiquoteTitle(title: string): Promise<string | null> {
  const data = await wikiquoteJson({
    action: 'query',
    prop: 'pageprops',
    ppprop: 'wikibase_item',
    titles: title
  });
  const pages = data?.query?.pages || {};
  const page = Object.values(pages)[0] as any;
  const qid = page?.pageprops?.wikibase_item;
  return typeof qid === 'string' && qid.startsWith('Q') ? qid : null;
}

async function getDeathYearFromWikidata(qid: string): Promise<number | null> {
  const data = await wikidataJson({
    action: 'wbgetentities',
    ids: qid,
    props: 'claims'
  });
  const entity = data?.entities?.[qid];
  const claims = entity?.claims?.P570;
  if (!Array.isArray(claims) || !claims.length) return null;
  const time = claims[0]?.mainsnak?.datavalue?.value?.time;
  if (typeof time !== 'string') return null;
  const year = parseInt(time.slice(1, 5), 10);
  return Number.isFinite(year) ? year : null;
}

async function getRandomWikiquoteTitles(limit: number): Promise<string[]> {
  const data = await wikiquoteJson({
    action: 'query',
    list: 'random',
    rnnamespace: '0',
    rnlimit: String(limit)
  });
  const list = data?.query?.random;
  if (!Array.isArray(list)) return [];
  return list.map((x: any) => x?.title).filter((t: any) => typeof t === 'string' && t.trim());
}

async function getQuotesForTitle(title: string): Promise<string[]> {
  const data = await wikiquoteJson({
    action: 'parse',
    page: title,
    prop: 'text'
  });
  const html = data?.parse?.text?.['*'];
  if (typeof html !== 'string' || !html.trim()) return [];
  return extractCandidateQuotesFromHtml(html);
}

export async function getRandomHistoricalWikiquote(minYearsDead = 80): Promise<WikiquoteQuote> {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - minYearsDead);
  const cutoffYear = cutoff.getFullYear();

  for (let attempt = 0; attempt < 25; attempt++) {
    const titles = await getRandomWikiquoteTitles(10);
    for (const title of titles) {
      const qid = await getWikidataIdForWikiquoteTitle(title);
      if (!qid) continue;
      const deathYear = await getDeathYearFromWikidata(qid);
      if (!deathYear) continue;
      if (deathYear > cutoffYear) continue;

      const quotes = await getQuotesForTitle(title);
      if (!quotes.length) continue;
      const quote = quotes[Math.floor(Math.random() * quotes.length)];
      const url = `https://en.wikiquote.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
      return { author: title, quote, url, deathYear };
    }
  }
  throw new Error('Konnte kein passendes Wikiquote-Zitat (≥80 Jahre verstorben) finden.');
}

