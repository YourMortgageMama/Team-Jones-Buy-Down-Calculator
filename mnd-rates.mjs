// Reads the Mortgage News Daily rate index once an hour and returns it as JSON
// for the Team Jones Seller Credit Calculator (index.html calls /.netlify/functions/mnd-rates).

const SOURCE = 'https://www.mortgagenewsdaily.com/mortgage-rates/mnd';

// Product labels as they appear on the MND index page (a few spellings each, in case the page changes slightly).
const PRODUCTS = {
  conv30:  [/30\s*Yr\.?\s*Fixed/i, /30[-\s]*Year\s*Fixed/i],
  conv15:  [/15\s*Yr\.?\s*Fixed/i, /15[-\s]*Year\s*Fixed/i],
  fha30:   [/30\s*Yr\.?\s*FHA/i, /30[-\s]*Year\s*FHA/i, /FHA\s*30/i],
  va30:    [/30\s*Yr\.?\s*VA/i, /30[-\s]*Year\s*VA/i, /VA\s*30/i],
  jumbo30: [/30\s*Yr\.?\s*Jumbo/i, /30[-\s]*Year\s*Jumbo/i, /Jumbo\s*30/i],
};

export function parseRates(html) {
  // Strip scripts, styles and tags so labels and numbers sit next to each other as plain text.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
  const rates = {};
  for (const [key, patterns] of Object.entries(PRODUCTS)) {
    for (const re of patterns) {
      const m = re.exec(text);
      if (!m) continue;
      // First percentage within ~120 characters after the label is that product's index rate.
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 120);
      const r = /(\d{1,2}\.\d{2,3})\s*%/.exec(after);
      if (r) {
        const v = parseFloat(r[1]);
        if (v > 1 && v < 20) { rates[key] = v; break; }
      }
    }
  }
  const d = /(?:as of|updated)\s*:?\s*([A-Z][a-z]{2,9}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(text);
  return { rates, date: d ? d[1] : null };
}

export default async () => {
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
    const { rates, date } = parseRates(await res.text());
    if (!Object.keys(rates).length) throw new Error('No rates found on the MND page');
    return new Response(JSON.stringify({ source: SOURCE, date: date || new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }), rates }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), { status: 502, headers: { ...headers, 'Netlify-CDN-Cache-Control': 'no-store' } });
  }
};
