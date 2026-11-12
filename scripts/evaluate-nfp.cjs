const fs = require('node:fs');
const path = require('node:path');
const { NFP_EVALUATION, NFP_RECENT_EVALUATION } = require('../.test-build/nfpModel.js');
const { NFP_DATASET } = require('../.test-build/data/nfpFirst.js');
const report = {
  model: 'nfp-ols-mean3-v1', dataset: NFP_DATASET.version, source: NFP_DATASET.sourceUrl,
  unit: NFP_DATASET.unit, datasetCapturedAt: new Date(NFP_DATASET.capturedAt).toISOString(),
  method: 'Expanding-window OLS using mean of preceding 3 first-release NFP values; minimum 12 training pairs. No tuning on evaluation outcomes.',
  limitations: [
    'Research simulation by reference month; release timestamps not individually verified.',
    'Historical table retrieved retrospectively; not a prospective or timestamp-audited backtest.',
    'No historical consensus or XAUUSD price data; no trading accuracy or probability claim.',
    'ADP, ISM, claims, wages and unemployment not used by this model.',
    'Initial evaluation contains 12 months; additional evaluation contains 18 forecasts and 4 missing/skipped months. Insufficient for general performance claims.',
  ],
  evaluation: NFP_EVALUATION,
  recentEvaluation: NFP_RECENT_EVALUATION,
};
const output = path.join(__dirname,'../reports/nfp-evaluation.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(`NFP research evaluation: ${NFP_EVALUATION.count} months. MAE model ${NFP_EVALUATION.model.mae.toFixed(2)}k; mean-3 baseline ${NFP_EVALUATION.baseline.mae.toFixed(2)}k.`);
console.log(`Additional evaluation: ${NFP_RECENT_EVALUATION.count} months. MAE model ${NFP_RECENT_EVALUATION.model.mae.toFixed(2)}k; mean-3 baseline ${NFP_RECENT_EVALUATION.baseline.mae.toFixed(2)}k.`);
console.log('Saved reports/nfp-evaluation.json');
