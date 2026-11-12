// Transcribed from the seasonally adjusted "1st" column of the official BLS table.
// Not the revised values returned by the current BLS time-series API.
export const NFP_DATASET = {
  version: 'bls-first-2026-11-11',
  sourceUrl: 'https://www.bls.gov/web/empsit/cesnaicsrev.htm',
  capturedAt: Date.parse('2026-11-10T18:16:41Z'),
  unit: 'thousand_jobs',
  excluded: ['2025-10'], // First column absent (shutdown); do not substitute the second column.
  rows: [
  {
    "period": "2022-01",
    "value": 467
  },
  {
    "period": "2022-02",
    "value": 678
  },
  {
    "period": "2022-03",
    "value": 431
  },
  {
    "period": "2022-04",
    "value": 428
  },
  {
    "period": "2022-05",
    "value": 390
  },
  {
    "period": "2022-06",
    "value": 372
  },
  {
    "period": "2022-07",
    "value": 528
  },
  {
    "period": "2022-08",
    "value": 315
  },
  {
    "period": "2022-09",
    "value": 263
  },
  {
    "period": "2022-10",
    "value": 261
  },
  {
    "period": "2022-11",
    "value": 263
  },
  {
    "period": "2022-12",
    "value": 223
  },
  {
    "period": "2023-01",
    "value": 517
  },
  {
    "period": "2023-02",
    "value": 311
  },
  {
    "period": "2023-03",
    "value": 236
  },
  {
    "period": "2023-04",
    "value": 253
  },
  {
    "period": "2023-05",
    "value": 339
  },
  {
    "period": "2023-06",
    "value": 209
  },
  {
    "period": "2023-07",
    "value": 187
  },
  {
    "period": "2023-08",
    "value": 187
  },
  {
    "period": "2023-09",
    "value": 336
  },
  {
    "period": "2023-10",
    "value": 150
  },
  {
    "period": "2023-11",
    "value": 199
  },
  {
    "period": "2023-12",
    "value": 216
  },
  {
    "period": "2024-01",
    "value": 353
  },
  {
    "period": "2024-02",
    "value": 275
  },
  {
    "period": "2024-03",
    "value": 303
  },
  {
    "period": "2024-04",
    "value": 175
  },
  {
    "period": "2024-05",
    "value": 272
  },
  {
    "period": "2024-06",
    "value": 206
  },
  {
    "period": "2024-07",
    "value": 114
  },
  {
    "period": "2024-08",
    "value": 142
  },
  {
    "period": "2024-09",
    "value": 254
  },
  {
    "period": "2024-10",
    "value": 12
  },
  {
    "period": "2024-11",
    "value": 227
  },
  {
    "period": "2024-12",
    "value": 256
  },
  {
    "period": "2025-01",
    "value": 143
  },
  {
    "period": "2025-02",
    "value": 151
  },
  {
    "period": "2025-03",
    "value": 228
  },
  {
    "period": "2025-04",
    "value": 177
  },
  {
    "period": "2025-05",
    "value": 139
  },
  {
    "period": "2025-06",
    "value": 147
  },
  {
    "period": "2025-07",
    "value": 73
  },
  {
    "period": "2025-08",
    "value": 22
  },
  {
    "period": "2025-09",
    "value": 119
  },
  {
    "period": "2025-11",
    "value": 64
  },
  {
    "period": "2025-12",
    "value": 50
  },
  {
    "period": "2026-01",
    "value": 130
  },
  {
    "period": "2026-02",
    "value": -92
  },
  {
    "period": "2026-03",
    "value": 178
  },
  {
    "period": "2026-04",
    "value": 115
  },
  {
    "period": "2026-05",
    "value": 172
  },
  {
    "period": "2026-06",
    "value": 57
  },
  {
    "period": "2026-07",
    "value": -23
  },
  {
    "period": "2026-08",
    "value": 162
  },
  {
    "period": "2026-09",
    "value": 29
  },
  {
    "period": "2026-10",
    "value": 165
  }
]
} as const;

