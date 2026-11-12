import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NewsKind } from '../automatic';
import { SUPPORT_META, Support, supportDetail, supportGaps, supportUrl } from '../automaticSupport';

const fmt = (t: number) => new Date(t).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
export function SupportPanel({ support, now, kind, release }: { support?: Support | null; now: number; kind?: NewsKind; release?: number }) {
  const [open, setOpen] = useState(false);
  const event = kind && release ? { kind, release } : undefined;
  const meta = SUPPORT_META.filter(m => !kind || m.events.includes(kind));
  const available = meta.filter(m => {
    const row = support?.series.find(r => r.id === m.id);
    return row && !row.error && supportDetail(row, now, event).status === 'available';
  }).length;
  const gaps = [...new Set((kind ? [kind] : ['NFP', 'CPI', 'PPI', 'FOMC'] as NewsKind[]).flatMap(supportGaps))];
  return <View style={s.box}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(v => !v)}>
      <Text style={s.title}>Data pendukung {kind ?? 'empat news'} · {available}/{meta.length} tersedia tanpa peringatan {open ? '▴' : '▾'}</Text>
    </Pressable>
    <Text style={s.text}>Konteks tambahan, belum diberi bobot dalam bias BUY/SELL. Jumlah data bukan persentase akurasi atau kelengkapan seluruh faktor pasar.</Text>
    {open && <>
      {meta.map(m => {
        const row = support?.series.find(r => r.id === m.id);
        const detail = row ? supportDetail(row, now, event) : null;
        return <View key={m.id} style={s.row}>
          <Text style={s.title}>{m.label} · {detail?.status === 'available' ? row?.error ? 'cache / pembaruan gagal' : 'tersedia' : detail?.status === 'stale' ? 'data lama' : 'belum tersedia'}</Text>
          <Text style={s.text}>{detail?.text ?? 'Menunggu pengambilan otomatis.'}</Text>
          {row?.fetchedAt && <Text style={s.text}>Versi diambil {fmt(row.fetchedAt)}. {row.id === 'ADP' ? `Tanggal dokumen: ${row.releaseDate ?? 'belum diketahui'}; jam publikasi belum diverifikasi.` : 'Versi terbaru termasuk revisi; tanggal observasi bukan tanggal publikasi.'}</Text>}
          {!!row?.error && <Text style={s.warning}>Pembaruan gagal: {row.error}. Timestamp data lama tetap dipertahankan.</Text>}
          <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(supportUrl(m.id)).catch(() => {}); }}><Text style={s.title}>Sumber ↗</Text></Pressable>
        </View>;
      })}
      <Text style={s.title}>Cakupan yang masih kurang</Text>
      {gaps.map(g => <Text key={g} style={s.warning}>{g}</Text>)}
      <Text style={s.text}>Data ini tidak otomatis memprediksi rilis berikutnya. Sumber tertunda atau periode yang berbeda harus dibaca sesuai tanggalnya. Arsip hanya membuktikan versi yang sudah diambil, bukan data rilis pertama sebelum sistem mulai mencatat.</Text>
    </>}
  </View>;
}
const s = StyleSheet.create({
  box: { padding: 12, borderWidth: 1, borderColor: '#304159', borderRadius: 10, gap: 10 },
  row: { gap: 5, marginBottom: 8 }, title: { color: '#e7c47c', fontWeight: '600' },
  text: { color: '#9eacc0', fontSize: 13, lineHeight: 21 }, warning: { color: '#ffcf9c', fontSize: 13, lineHeight: 21 },
});
