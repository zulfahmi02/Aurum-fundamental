import * as DocumentPicker from 'expo-document-picker';
import { File, FileMode, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ExnessTicks } from './exnessCsv';
import { Outcome } from './research';

export async function pickJson(): Promise<unknown | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true });
  if (picked.canceled) return null;
  const file = new File(picked.assets[0].uri);
  try {
    if (file.size > 1500000) throw new Error('File terlalu besar. Maksimal 1,5 MB.');
    const raw = await file.text();
    if (raw.length > 1500000) throw new Error('File terlalu besar.');
    return JSON.parse(raw);
  } finally { if (file.exists) file.delete(); }
}
export async function shareJson(name: string, value: unknown): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error('Berbagi file tidak tersedia pada perangkat ini.');
  const file = new File(Paths.cache, name);
  await file.write(JSON.stringify(value, null, 2));
  // Retain until OS cache cleanup: some share targets consume the URI after the dialog closes.
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Simpan atau bagikan data Aurum' });
}

export async function pickExnessCsv(release: number, symbol: string, cost: number): Promise<Outcome | null> {
  const parser = new ExnessTicks(release, symbol, cost);
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (picked.canceled) return null;
  const file = new File(picked.assets[0].uri);
  try {
    if (!picked.assets[0].name.toLowerCase().endsWith('.csv') || file.size > 250000000)
      throw new Error('Pilih CSV hasil ekstraksi ZIP, maksimal 250 MB. Gunakan file harian atau bulanan.');
    const handle = file.open(FileMode.ReadOnly);
    try {
      while (true) {
        const bytes = await handle.readBytes(16384);
        if (!bytes.length) break;
        parser.push(String.fromCharCode(...bytes)); // ASCII CSV; BOM is stripped by the parser.
      }
    } finally { handle.close(); }
    return parser.finish(Date.now());
  } finally { if (file.exists) file.delete(); }
}
