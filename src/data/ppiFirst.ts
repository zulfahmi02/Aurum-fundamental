import type { PpiRow } from '../ppiModel';

// Only the target month's headline in each archived release's opening paragraph.
// Never copy revised previous-month figures from Table A or the current BLS API.
// Embargo times checked on every page; 08:30 America/New_York converted with DST.
// October 2025 has no published monthly release; intentionally absent.
export const PPI_DATASET = {
  version: 'bls-ppi-headline-first-20261111-v1',
  capturedAt: Date.parse('2026-11-11T16:02:00Z'),
  sourceUrl: 'https://www.bls.gov/bls/news-release/ppi.htm',
  unit: 'percent-mom-sa',
  rows: [
    { period: '2024-01', value: 0.3, publishedAt: Date.parse('2024-02-16T13:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_02162024.htm' },
    { period: '2024-02', value: 0.6, publishedAt: Date.parse('2024-03-14T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_03142024.htm' },
    { period: '2024-03', value: 0.2, publishedAt: Date.parse('2024-04-11T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_04112024.htm' },
    { period: '2024-04', value: 0.5, publishedAt: Date.parse('2024-05-14T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_05142024.htm' },
    { period: '2024-05', value: -0.2, publishedAt: Date.parse('2024-06-13T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_06132024.htm' },
    { period: '2024-06', value: 0.2, publishedAt: Date.parse('2024-07-12T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_07122024.htm' },
    { period: '2024-07', value: 0.1, publishedAt: Date.parse('2024-08-13T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_08132024.htm' },
    { period: '2024-08', value: 0.2, publishedAt: Date.parse('2024-09-12T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_09122024.htm' },
    { period: '2024-09', value: 0, publishedAt: Date.parse('2024-10-11T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_10112024.htm' },
    { period: '2024-10', value: 0.2, publishedAt: Date.parse('2024-11-14T13:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_11142024.htm' },
    { period: '2024-11', value: 0.4, publishedAt: Date.parse('2024-12-12T13:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_12122024.htm' },
    { period: '2024-12', value: 0.2, publishedAt: Date.parse('2025-01-14T13:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_01142025.htm' },
    { period: '2025-01', value: 0.4, publishedAt: Date.parse('2025-02-13T13:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_02132025.htm' },
    { period: '2025-02', value: 0, publishedAt: Date.parse('2025-03-13T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_03132025.htm' },
    { period: '2025-03', value: -0.4, publishedAt: Date.parse('2025-04-11T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_04112025.htm' },
    { period: '2025-04', value: -0.5, publishedAt: Date.parse('2025-05-15T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_05152025.htm' },
    { period: '2025-05', value: 0.1, publishedAt: Date.parse('2025-06-12T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_06122025.htm' },
    { period: '2025-06', value: 0, publishedAt: Date.parse('2025-07-16T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_07162025.htm' },
    { period: '2025-07', value: 0.9, publishedAt: Date.parse('2025-08-14T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_08142025.htm' },
    { period: '2025-08', value: -0.1, publishedAt: Date.parse('2025-09-10T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_09102025.htm' },
    { period: '2025-09', value: 0.3, publishedAt: Date.parse('2025-11-25T13:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_11252025.htm' },
    { period: '2025-11', value: 0.2, publishedAt: Date.parse('2026-01-14T13:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_01142026.htm' },
    { period: '2025-12', value: 0.5, publishedAt: Date.parse('2026-01-30T13:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_01302026.htm' },
    { period: '2026-01', value: 0.5, publishedAt: Date.parse('2026-02-27T13:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_02272026.htm' },
    { period: '2026-02', value: 0.7, publishedAt: Date.parse('2026-03-18T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_03182026.htm' },
    { period: '2026-03', value: 0.5, publishedAt: Date.parse('2026-04-14T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_04142026.htm' },
    { period: '2026-04', value: 1.4, publishedAt: Date.parse('2026-05-13T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_05132026.htm' },
    { period: '2026-05', value: 1.1, publishedAt: Date.parse('2026-06-11T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_06112026.htm' },
    { period: '2026-06', value: -0.3, publishedAt: Date.parse('2026-07-15T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_07152026.htm' },
    { period: '2026-07', value: 0, publishedAt: Date.parse('2026-08-13T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_08132026.htm' },
    { period: '2026-08', value: 0.4, publishedAt: Date.parse('2026-09-10T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_09102026.htm' },
    { period: '2026-09', value: 1.3, publishedAt: Date.parse('2026-10-15T12:30:00Z'), source: 'https://www.bls.gov/news.release/archives/ppi_10152026.htm' },
  ] satisfies PpiRow[],
} as const;
