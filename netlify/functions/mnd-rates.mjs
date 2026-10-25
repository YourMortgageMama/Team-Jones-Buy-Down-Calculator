// Reads the Mortgage News Daily rate index once an hour and returns it as JSON
// for the Team Jones Seller Credit Calculator (index.html calls /.netlify/functions/mnd-rates).

const SOURCE = 'https://www.mortgagenewsdaily.com/mortgage-rates/mnd';

// Each product's row in the MND rate table reads like "30 Yr. FHA 6.98%": the exact label, then today's rate.
// Matching is case-sensitive so the site menu ("30 YR FHA") is ignored. The 30- and 15-year fixed
// also fall back to the ticker at the top of the page ("30YR Fixed Rate 7.33%").
const NUM = '(\\d{1,2}\\.\\d{2,3})\\s*%';
const PRODUCTS = {
  conv30:  [new RegExp('30 Yr\\. Fixed\\s+' + NUM), new RegExp('30YR Fixed Rate\\s+' + NUM)],
  conv15:  [new RegExp('15 Yr\\. Fixed\\s+' + NUM), new RegExp('15YR Fixed Rate\\s+' + NUM)],
  fha30:   [new RegExp('30 Yr\\. FHA\\s+' + NUM)],
  va30:    [new RegExp('30 Yr\\. VA\\s+' + NUM)],
  jumbo30: [new RegExp('30 Yr\\. Jumbo\\s+' + NUM)],
};

export function toText(html) {
  // Strip scripts, styles and tags so labels and numbers sit next to each other as plain text.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

export function parseRates(html) {
  const text = toText(html);
  const rates = {};
  for (const [key, patterns] of Object.entries(PRODUCTS)) {
    for (const re of patterns) {
      const m = re.exec(text);
      if (m) {
        const v = parseFloat(m[1]);
        if (v > 1 && v < 20) { rates[key] = v; break; }
      }
    }
  }
  const d = /Last Updated:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(text);
  return { rates, date: d ? d[1] : null };
}

export default async (req) => {
  const debug = req && req.url && new URL(req.url).searchParams.has('debug');
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    // Netlify caches the answer for an hour, so MND is read at most about once an hour.
    'Cache-Control': 'public, max-age=900',
    'Netlify-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  };
  try {
    const res = await fetch(SOURCE, { headers: { 'User-Agent': 'Mozilla/5.0 (TeamJonesCalculator)', 'Accept': 'text/html' } });
    if (!res.ok) throw new Error('MND returned ' + res.status);
    const html = await res.text();
    if (debug) {
      // Diagnostic view: shows the text around each rate label so the reader can be tuned.
      const text = toText(html);
      const around = {};
      for (const [key, patterns] of Object.entries(PRODUCTS)) {
        around[key] = [];
        for (const re of patterns) {
          const g = new RegExp(re.source.split('\\s+')[0], 'g'); let m;
          while ((m = g.exec(text)) && around[key].length < 4) around[key].push(text.slice(Math.max(0, m.index - 60), m.index + 220));
        }
      }
      return new Response(JSON.stringify({ parsed: parseRates(html), around }, null, 2), { headers: { ...headers, 'Netlify-CDN-Cache-Control': 'no-store', 'Cache-Control': 'no-store' } });
    }
    const { rates, date } = parseRates(html);
    if (!Object.keys(rates).length) throw new Error('No rates found on the MND page');
    return new Response(JSON.stringify({ source: SOURCE, date: date || new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }), rates }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), { status: 502, headers: { ...headers, 'Netlify-CDN-Cache-Control': 'no-store' } });
  }
};
