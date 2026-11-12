import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { NFP_DATASET } from '../data/nfpFirst';
import { forecastNfp, NFP_EVALUATION, NFP_RECENT_EVALUATION, NfpForecast } from '../nfpModel';
import type { Plan } from '../review';
import type { FirstRelease } from '../research';

const number = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 1 });

export function NfpForecastDetails({ forecast: f }: { forecast: NfpForecast }) {
  const comparison = f.difference > 0 ? 'di atas' : f.difference < 0 ? 'di bawah' : 'sama dengan';
  return <View style={s.inset}>
    <Text style={s.value}>{number(f.estimate)} ribu pekerjaan</Text>
    <Text style={s.body}>Estimasi NFP {f.target} · {comparison} konsensus {number(f.consensus)} ribu.
      {'\n'}Selisih estimasi: {number(f.difference)} ribu, bukan surprise aktual.</Text>
    <Text style={s.body}>Dasar perhitungan: {f.inputs.map(r => `${r.period}: ${number(r.value)} ribu`).join('; ')}.</Text>
    <Text style={s.muted}>Rumus: {number(f.fit.intercept)} + ({number(f.fit.slope)} × rata-rata tiga bulan).
      {'\n'}Koefisien dipelajari dari {f.fit.count} pasangan data, {f.fit.from}–{f.fit.through}. Koefisien yang ditampilkan dibulatkan.
      {'\n'}Model {f.model} · dataset {f.dataset}.</Text>
  </View>;
}

export function NfpModelPanel({ plan, now, releases = [] }: { plan: Plan | null; now: number; releases?: FirstRelease[] }) {
  const result = forecastNfp(plan, now, releases);
  const evaluation = NFP_EVALUATION;
  return <View style={s.card}>
    <Text style={s.eyebrow}>NFP / MODEL AWAL</Text>
    <Text style={s.heading}>Estimasi sebelum rilis</Text>
    <Text style={s.muted}>Eksperimental · memprediksi pertambahan pekerjaan, belum arah XAUUSD.</Text>
    {result.forecast ? <NfpForecastDetails forecast={result.forecast} /> : <Text style={s.body}>{result.reason}</Text>}
    <Text style={s.body}>Model menggunakan angka NFP rilis pertama. ADP, ISM, claims, upah, dan pengangguran masih menjadi konteks terpisah; belum masuk rumus.</Text>
    <View style={s.inset}>
      <Text style={s.heading}>Hasil evaluasi historis</Text>
      <Text style={s.body}>{evaluation.from}–{evaluation.through} · {evaluation.count} prediksi bulanan.
        {'\n'}Setiap prediksi hanya dilatih memakai bulan sebelumnya.</Text>
      {evaluation.model && evaluation.baseline && <>
        <Text style={s.body}>Rata-rata kesalahan absolut (MAE):
          {'\n'}Model: {number(evaluation.model.mae)} ribu pekerjaan.
          {'\n'}Rata-rata 3 bulan: {number(evaluation.baseline.mae)} ribu pekerjaan.</Text>
        <Text style={s.muted}>{evaluation.model.mae < evaluation.baseline.mae
          ? 'Kesalahan model lebih kecil dalam sampel ini; belum membuktikan hasil pada rilis mendatang.'
          : 'Model belum mengalahkan rata-rata sederhana dalam sampel ini.'}</Text>
      </>}
      {NFP_RECENT_EVALUATION.model && NFP_RECENT_EVALUATION.baseline && <>
        <Text style={s.body}>Pemeriksaan lanjutan Januari 2025–Oktober 2026:
          {'\n'}{NFP_RECENT_EVALUATION.count} prediksi, {NFP_RECENT_EVALUATION.missingOrSkipped} bulan dilewati karena actual atau tiga input berurutan tidak lengkap.
          {'\n'}MAE model: {number(NFP_RECENT_EVALUATION.model.mae)} ribu.
          {'\n'}MAE rata-rata 3 bulan: {number(NFP_RECENT_EVALUATION.baseline.mae)} ribu.</Text>
        <Text style={s.muted}>{NFP_RECENT_EVALUATION.model.mae >= NFP_RECENT_EVALUATION.baseline.mae
          ? 'Pada periode lanjutan, model kalah dari rata-rata sederhana. Model ini belum menunjukkan keunggulan yang konsisten.'
          : 'Hasil periode lanjutan tetap perlu diuji dengan arsip waktu publikasi dan rilis mendatang.'}</Text>
      </>}
      <Text style={s.muted}>MAE adalah besar kesalahan rata-rata, bukan peluang benar atau batas kesalahan maksimum. Evaluasi ini memakai urutan bulan; waktu publikasi tiap rilis belum diverifikasi. Belum menguji konsensus historis atau pergerakan emas T−5 sampai T+1.</Text>
    </View>
    <Text style={s.muted}>Dataset bawaan: Januari 2022–Oktober 2026 ({NFP_DATASET.rows.length} angka), diperiksa 11 November 2026. Oktober 2025 dikecualikan karena kolom rilis pertama kosong. Tambahan/koreksi manual: {releases.length} versi. Isi hasil rilis BLS di panel riset untuk memperbarui model; pembaruan otomatis belum tersedia. Evaluasi di atas tetap memakai dataset bawaan.</Text>
    <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(NFP_DATASET.sourceUrl).catch(() => {}); }}>
      <Text style={s.link}>Periksa tabel rilis pertama BLS ↗</Text>
    </Pressable>
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: '#131f30', borderColor: '#253247', borderWidth: 1, borderRadius: 18, padding: 20, marginBottom: 18, gap: 12 },
  inset: { padding: 14, backgroundColor: '#0c1421', borderRadius: 10, gap: 10 },
  eyebrow: { color: '#e7c47c', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  heading: { color: '#f3f5f8', fontSize: 21, fontWeight: '600' },
  value: { color: '#e7c47c', fontSize: 24, fontWeight: '700' },
  body: { color: '#d5deeb', fontSize: 14, lineHeight: 23 },
  muted: { color: '#9eacc0', fontSize: 13, lineHeight: 21 },
  link: { color: '#e7c47c', fontSize: 13 },
});
