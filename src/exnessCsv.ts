import { Outcome, Quote, validOutcome } from './research';

function columns(line: string): string[] {
  const fields: string[] = []; let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i+1] === '"') { value += '"'; i++; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { fields.push(value.trim()); value = ''; }
    else value += char;
  }
  if (quoted) throw new Error('CSV memiliki kutipan yang belum ditutup.');
  fields.push(value.trim()); return fields;
}

// Streaming parser: keeps only two boundary quotes, never a whole monthly tick file.
export class ExnessTicks {
  private pending = '';
  private entry: Quote | null = null;
  private exit: Quote | null = null;
  private previous = -1;
  private lines = 0;
  constructor(private release: number, private symbol: string, private cost: number) {
    if (!Number.isSafeInteger(release) || !/^XAUUSD[^\s]*$/i.test(symbol) || !Number.isFinite(cost) || cost < 0)
      throw new Error('Isi jadwal rilis, simbol XAUUSD persis dari CSV, dan biaya tambahan nonnegatif.');
  }
  push(chunk: string) {
    this.pending += chunk;
    let end: number;
    while ((end = this.pending.indexOf('\n')) >= 0) {
      this.line(this.pending.slice(0,end)); this.pending = this.pending.slice(end+1);
    }
    if (this.pending.length > 4096) throw new Error('Format CSV tidak dikenali. Pilih CSV hasil ekstraksi, bukan ZIP.');
  }
  private line(raw: string) {
    const line = raw.replace(/^\uFEFF|^\u00ef\u00bb\u00bf/, '').trim();
    if (!line) return;
    this.lines++;
    let fields = columns(line);
    if (fields.length === 5 && fields[0].toLowerCase() === 'exness') fields = fields.slice(1);
    if (fields.map(f=>f.toLowerCase()).join(',') === 'symbol,timestamp,bid,ask') return;
    if (fields.length !== 4) throw new Error(`CSV baris ${this.lines}: kolom harus Symbol,Timestamp,Bid,Ask (atau diawali Exness).`);
    const [symbol, timestamp, bidText, askText] = fields;
    if (symbol !== this.symbol) return;
    if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(timestamp))
      throw new Error('Timestamp tick harus UTC dengan akhiran Z; timezone tidak ditebak.');
    const at = Date.parse(timestamp.replace(' ', 'T'));
    if (!Number.isFinite(at) || new Date(at).toISOString().slice(0,19) !== timestamp.replace(' ', 'T').slice(0,19))
      throw new Error('Tanggal tick tidak valid.');
    if (at < this.previous) throw new Error('CSV tick tidak berurutan. Urutkan timestamp sebelum impor.');
    this.previous = at;
    if (!bidText || !askText || !/^\d+(\.\d+)?$/.test(bidText) || !/^\d+(\.\d+)?$/.test(askText))
      throw new Error('Harga bid/ask tidak valid.');
    const bid = Number(bidText), ask = Number(askText);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask < bid) throw new Error('Quote kosong atau bid/ask terbalik.');
    const quote = { at, bid, ask };
    if (!this.entry && at >= this.release-300000 && at <= this.release-295000) this.entry = quote;
    if (!this.exit && at >= this.release+60000 && at <= this.release+65000) this.exit = quote;
  }
  finish(now: number): Outcome {
    if (this.pending) { this.line(this.pending); this.pending = ''; }
    if (!this.entry || !this.exit) throw new Error('CSV tidak memiliki dua quote sesuai simbol dan jendela T−5/T+1 (toleransi 5 detik).');
    const result: Outcome = { id: `exness-archive-${this.symbol}-${this.release}-${now}`, release: this.release,
      broker: 'Exness', feed: 'Arsip resmi Exness (indikatif; bukan server MT5 akun)', symbol: this.symbol,
      entry: this.entry, exit: this.exit, cost: this.cost, recordedAt: now, source: 'https://www.exness.com/tick-history/' };
    if (!validOutcome(result)) throw new Error('Event belum selesai atau hasil CSV tidak valid.');
    return result;
  }
}
