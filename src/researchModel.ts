import { FEATURES, Research, ResearchEvent, Broker, Outcome, quoteResult } from './research';

const mean = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;
export const MIN_RESEARCH_TRAIN = 24;
const RIDGE = 10; // Fixed before evaluation; not selected against test outcomes.
const vector = (e: ResearchEvent) => FEATURES.map(k => e.features[k].value);

// Train-only standardization and a regularized normal equation. No test row enters the fit.
export function ridgePredict(xs: number[][], ys: number[], x: number[]): number | null {
  const n = xs.length, d = x.length;
  if (n < MIN_RESEARCH_TRAIN || ys.length !== n || !d || xs.some(r => r.length !== d || !r.every(Number.isFinite))
    || !ys.every(Number.isFinite) || !x.every(Number.isFinite)) return null;
  const means = x.map((_, j) => mean(xs.map(r => r[j])));
  const scales = means.map((m, j) => Math.sqrt(mean(xs.map(r => (r[j] - m) ** 2))) || 1);
  const yMean = mean(ys);
  const z = xs.map(r => r.map((v, j) => (v - means[j]) / scales[j]));
  const matrix = x.map((_, j) => [...x.map((__, k) => z.reduce((s, r) => s + r[j] * r[k], 0) + (j === k ? RIDGE : 0)),
    z.reduce((s, r, i) => s + r[j] * (ys[i] - yMean), 0)]);
  for (let j = 0; j < d; j++) {
    let pivot = j;
    for (let k = j + 1; k < d; k++) if (Math.abs(matrix[k][j]) > Math.abs(matrix[pivot][j])) pivot = k;
    [matrix[j], matrix[pivot]] = [matrix[pivot], matrix[j]];
    const divisor = matrix[j][j];
    if (!Number.isFinite(divisor) || Math.abs(divisor) < 1e-12) return null;
    for (let k = j; k <= d; k++) matrix[j][k] /= divisor;
    for (let i = 0; i < d; i++) if (i !== j) {
      const factor = matrix[i][j];
      for (let k = j; k <= d; k++) matrix[i][k] -= factor * matrix[j][k];
    }
  }
  const result = yMean + matrix.reduce((s, row, j) => s + row[d] * (x[j] - means[j]) / scales[j], 0);
  return Number.isFinite(result) ? result : null;
}

export function evaluateResearch(research: Research) {
  const sorted = [...research.events].sort((a,b) => a.release - b.release);
  const nfp = sorted.flatMap(e => {
    const train = sorted.filter(p => p.release < e.release - 300000);
    const prediction = ridgePredict(train.map(vector), train.map(p => p.actual.value - p.features.consensus.value), vector(e));
    return prediction === null ? [] : [{ release: e.release, target: e.target, trainingCount: train.length,
      estimate: e.features.consensus.value + prediction, actual: e.actual.value, consensus: e.features.consensus.value }];
  });
  const brokers = (['HFM', 'Exness'] as Broker[]).flatMap(broker => {
    const feeds = [...new Set(research.outcomes.filter(o => o.broker === broker).map(o => `${o.feed}\n${o.symbol}`))];
    return feeds.map(feedKey => {
      const [feed, symbol] = feedKey.split('\n');
      const outcomes = new Map<number, Outcome>();
      // Most recently recorded correction for each release within one broker/feed/symbol only.
      research.outcomes.filter(o => o.broker === broker && o.feed === feed && o.symbol === symbol)
        .sort((a,b) => a.recordedAt-b.recordedAt).forEach(o => outcomes.set(o.release, o));
      const eligible = sorted.filter(e => outcomes.has(e.release));
      const predictions = eligible.flatMap(e => {
        const train = eligible.filter(p => outcomes.get(p.release)!.exit.at < e.release - 300000);
        const predictedChange = ridgePredict(train.map(vector), train.map(p => quoteResult(outcomes.get(p.release)!).midChange), vector(e));
        if (predictedChange === null) return [];
        const outcome = outcomes.get(e.release)!;
        const net = quoteResult(outcome);
        // Direction is an experimental out-of-sample prediction, not an order or a live recommendation.
        const direction = predictedChange > 0 ? 'BUY' : predictedChange < 0 ? 'SELL' : 'NETRAL';
        return [{ release: e.release, trainingCount: train.length, predictedChange, direction,
          result: direction === 'BUY' ? net.long : direction === 'SELL' ? net.short : 0,
          alwaysBuy: net.long, alwaysSell: net.short }];
      });
      return { broker, feed, symbol, eligible: eligible.length, count: predictions.length,
        averageNet: predictions.length ? mean(predictions.map(p => p.result)) : null,
        alwaysBuy: predictions.length ? mean(predictions.map(p => p.alwaysBuy)) : null,
        alwaysSell: predictions.length ? mean(predictions.map(p => p.alwaysSell)) : null, predictions };
    });
  });
  return { model: 'ridge-fundamentals-v1', minimumTraining: MIN_RESEARCH_TRAIN, alpha: RIDGE,
    events: sorted.length, count: nfp.length,
    mae: nfp.length ? mean(nfp.map(p => Math.abs(p.estimate-p.actual))) : null,
    consensusMae: nfp.length ? mean(nfp.map(p => Math.abs(p.consensus-p.actual))) : null,
    predictions: nfp, brokers,
    liveReady: false as const,
    limitation: 'Riset retrospektif dari arsip yang diimpor; timestamp dan sumber belum diaudit otomatis. Tidak mengaktifkan sinyal live. Hasil harga berupa USD/oz setelah spread dan biaya tambahan yang diisi, bukan hasil eksekusi nyata.' };
}
