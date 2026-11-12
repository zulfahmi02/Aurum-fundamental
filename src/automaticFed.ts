export const FED_CALENDAR_URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
export const FED_RATES_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFEDTARL,DFEDTARU';
export type FedCalendar = { fetchedAt: number; meetings: { date: string; projections: boolean }[] };
export type FedRates = { fetchedAt: number; period: string; lower: number; upper: number };
export type FedContext = { version: 1; calendar: FedCalendar | null; rates: FedRates | null; errors: string[] };
export type FedDecision = { date: string; publishedAt: number; capturedAt: number; lower: number; upper: number; source: string };
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const stamp = (n: number) => Number.isSafeInteger(n) && n > 0 && n < 8640000000000000;
function dateValid(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}
const plain = (s: string) => s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&ndash;|&#8211;|[–−]/g, '-').replace(/\s+/g, ' ').trim();
export function newYorkDate(time: number): string {
  if (!stamp(time)) throw new Error('Timestamp tidak valid.');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(time);
  return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k)!.value).join('-');
}
export function parseFedCalendar(html: string, fetchedAt: number): FedCalendar {
  if (!stamp(fetchedAt)) throw new Error('Waktu kalender Fed tidak valid.');
  const headings = [...html.matchAll(/(\d{4}) FOMC Meetings/g)];
  const meetings = new Map<string, { date: string; projections: boolean }>();
  for (let i = 0; i < headings.length; i++) {
    const year = headings[i][1];
    const section = html.slice(headings[i].index, headings[i + 1]?.index ?? html.length);
    const pattern = /class="[^"]*fomc-meeting__month[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?class="[^"]*fomc-meeting__date[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    for (const match of section.matchAll(pattern)) {
      const monthName = plain(match[1]).split('/').at(-1)!.trim();
      const month = months.findIndex(m => m === monthName || m.slice(0, 3) === monthName);
      const days = plain(match[2]);
      if (month < 0 || !/^\d{1,2}(?:-\d{1,2})?\*?$/.test(days)) continue; // Unscheduled or ambiguous entries need separate handling.
      const last = days.replace('*', '').split('-').at(-1)!;
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${last.padStart(2, '0')}`;
      if (!dateValid(date)) throw new Error('Tanggal rapat Fed tidak valid.');
      meetings.set(date, { date, projections: days.includes('*') });
    }
  }
  if (!meetings.size) throw new Error('Format kalender Fed berubah atau kalender kosong.');
  return { fetchedAt, meetings: [...meetings.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}
export function parseFedRates(csv: string, fetchedAt: number): FedRates {
  if (!stamp(fetchedAt)) throw new Error('Waktu data suku bunga tidak valid.');
  const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (!['observation_date,DFEDTARL,DFEDTARU', 'DATE,DFEDTARL,DFEDTARU'].includes(lines[0])) throw new Error('Format data rentang suku bunga berubah.');
  const latestAllowed = newYorkDate(fetchedAt);
  const rows: FedRates[] = [];
  const seen = new Set<string>();
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const [period, lower, upper, extra] = line.split(',');
    if (!dateValid(period) || extra !== undefined || seen.has(period)) throw new Error('Baris suku bunga tidak valid/duplikat.');
    seen.add(period);
    if (period > latestAllowed || [lower, upper].some(v => !v || v === '.')) continue;
    if (![lower, upper].every(v => /^\d+(?:\.\d+)?$/.test(v)) || Number(lower) > Number(upper) || Number(upper) > 100) throw new Error('Rentang suku bunga tidak valid.');
    rows.push({ fetchedAt, period, lower: Number(lower), upper: Number(upper) });
  }
  const latest = rows.sort((a, b) => a.period.localeCompare(b.period)).at(-1);
  if (!latest) throw new Error('Rentang suku bunga belum tersedia.');
  return latest;
}
export function readFedContext(value: unknown): FedContext {
  const f = value as FedContext;
  if (!f || f.version !== 1 || !Array.isArray(f.errors) || f.errors.length > 2 || !f.errors.every(e => typeof e === 'string' && e.length < 1000)) throw new Error('Cache Fed tidak valid.');
  if (f.calendar !== null && (!f.calendar || !stamp(f.calendar.fetchedAt) || !Array.isArray(f.calendar.meetings) || !f.calendar.meetings.length || f.calendar.meetings.length > 500
    || !f.calendar.meetings.every(m => m && dateValid(m.date) && typeof m.projections === 'boolean')
    || new Set(f.calendar.meetings.map(m => m.date)).size !== f.calendar.meetings.length)) throw new Error('Cache kalender Fed tidak valid.');
  if (f.rates !== null && (!f.rates || !stamp(f.rates.fetchedAt) || !dateValid(f.rates.period)
    || ![f.rates.lower, f.rates.upper].every(Number.isFinite) || f.rates.lower < 0 || f.rates.upper > 100 || f.rates.lower > f.rates.upper
    || f.rates.period > newYorkDate(f.rates.fetchedAt))) throw new Error('Cache suku bunga tidak valid.');
  return f;
}
async function download(url: string): Promise<string> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 3000000) throw new Error('Respons terlalu besar.');
    return text;
  } finally { clearTimeout(timer); }
}
export async function fetchFedContext(previous: FedContext | null = null): Promise<FedContext> {
  const now = Date.now();
  const old = previous ? readFedContext(previous) : null;
  const [calendar, rates] = await Promise.allSettled([
    old?.calendar && old.calendar.fetchedAt <= now && now - old.calendar.fetchedAt < 24 * 3600000 ? Promise.resolve(old.calendar)
      : download(FED_CALENDAR_URL).then(html => parseFedCalendar(html, Date.now())),
    old?.rates && old.rates.fetchedAt <= now && now - old.rates.fetchedAt < 4 * 3600000 ? Promise.resolve(old.rates)
      : download(FED_RATES_URL).then(csv => parseFedRates(csv, Date.now())),
  ]);
  return { version: 1, calendar: calendar.status === 'fulfilled' ? calendar.value : old?.calendar ?? null,
    rates: rates.status === 'fulfilled' ? rates.value : old?.rates ?? null,
    errors: [calendar.status === 'rejected' ? 'Kalender resmi Fed belum dapat diperbarui.' : '', rates.status === 'rejected' ? 'Rentang suku bunga FRED belum dapat diperbarui.' : ''].filter(Boolean) };
}
function rateValue(raw: string): number {
  const value = raw.trim();
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const fraction = value.match(/^(?:(\d+)[ -])?(\d+)\/(\d+)$/);
  if (!fraction || Number(fraction[3]) === 0) throw new Error('Format pecahan suku bunga berubah.');
  return Number(fraction[1] ?? 0) + Number(fraction[2]) / Number(fraction[3]);
}
export function parseFedDecision(html: string, date: string, capturedAt: number): FedDecision {
  if (!dateValid(date) || !stamp(capturedAt)) throw new Error('Tanggal keputusan tidak valid.');
  const articleDate = plain(html.match(/<p[^>]*class="article__time"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '');
  const [year, month, day] = date.split('-');
  if (articleDate !== `${months[Number(month) - 1]} ${Number(day)}, ${year}`) throw new Error('Tanggal pernyataan tidak cocok.');
  const text = plain(html);
  if (!text.includes('Federal Reserve issues FOMC statement')) throw new Error('Dokumen bukan pernyataan FOMC.');
  const clock = text.match(/For release at (\d{1,2}):(\d{2}) ([ap])\.m\. (EDT|EST)/);
  if (!clock || Number(clock[1]) < 1 || Number(clock[1]) > 12 || Number(clock[2]) > 59) throw new Error('Jam publikasi Fed belum dikenali.');
  const hour = Number(clock[1]) % 12 + (clock[3] === 'p' ? 12 : 0);
  const publishedAt = Date.parse(`${date}T${String(hour).padStart(2, '0')}:${clock[2]}:00${clock[4] === 'EDT' ? '-04:00' : '-05:00'}`);
  if (publishedAt > capturedAt) throw new Error('Keputusan belum diterbitkan pada waktu pengambilan.');
  const range = text.match(/target range for the federal funds rate (?:at|to|of) ([\d./ -]+?) to ([\d./ -]+?) percent/i);
  if (!range) throw new Error('Rentang keputusan belum dapat dikenali; tidak menebak isi pernyataan.');
  const lower = rateValue(range[1]), upper = rateValue(range[2]);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower < 0 || upper > 100 || lower > upper) throw new Error('Rentang keputusan tidak valid.');
  return { date, publishedAt, capturedAt, lower, upper, source: `https://www.federalreserve.gov/newsevents/pressreleases/monetary${date.replaceAll('-', '')}a.htm` };
}
export async function fetchFedDecision(release: number): Promise<FedDecision> {
  if (release > Date.now()) throw new Error('Keputusan belum dirilis.');
  const date = newYorkDate(release);
  const html = await download(`https://www.federalreserve.gov/newsevents/pressreleases/monetary${date.replaceAll('-', '')}a.htm`);
  const result = parseFedDecision(html, date, Date.now());
  if (result.publishedAt !== release) throw new Error('Jam kalender berbeda dari pernyataan resmi; hasil belum dipasangkan.');
  return result;
}
