const fs = require('node:fs');
const { PPI_DATASET } = require('../.test-build/data/ppiFirst.js');
const { PPI_EVALUATION } = require('../.test-build/ppiModel.js');
const report = {
  model: 'ppi-ols-mean3-v1', dataset: PPI_DATASET.version, unit: 'percentage-points',
  target: 'PPI final demand headline, month-on-month, seasonally adjusted, first release',
  datasetCapturedAt: new Date(PPI_DATASET.capturedAt).toISOString(),
  rows: PPI_DATASET.rows.length,
  method: 'Expanding OLS, minimum 12 training pairs, feature = mean of exactly 3 preceding initial releases. Inputs for each pair must be published by its T-5-minute cutoff.',
  limitations: [
    'Retrospective archive reconstruction; not a prospectively captured event-time dataset.',
    'October 2025 omitted: no monthly release was published. Gaps are not filled with revised figures.',
    'Small sample; no historical consensus, gold prices, costs, or live direction validation.',
    'MAE is in percentage points, not a probability or an error bound. No BUY/SELL signal.',
  ],
  evaluation: PPI_EVALUATION,
};
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/ppi-evaluation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report.evaluation, predictions: undefined }, null, 2));
