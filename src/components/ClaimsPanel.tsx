import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ClaimsData, claimsUrl, fourWeekAverage } from '../claims';

export function ClaimsPanel({ data }: { data: ClaimsData | undefined }) {
  return <View style={s.card}>
    <Text style={s.title}>CLAIMS / DATA MINGGUAN</Text>
    <Text style={s.muted}>Nasional AS · disesuaikan musiman · satuan jumlah klaim. Tanggal adalah akhir minggu pengamatan, bukan tanggal publikasi.</Text>
    {(['initial', 'continued'] as const).map(key => {
      const series = data?.[key];
      const average = series ? fourWeekAverage(series.points) : null;
      const id = key === 'initial' ? 'ICSA' : 'CCSA';
      return <View key={key} style={s.group}>
        <Text style={s.label}>{key === 'initial' ? 'Initial claims' : 'Continuing claims'}</Text>
        {!series || series.status !== 'available' ? <Text style={s.muted}>Belum tersedia{series?.error ? `: ${series.error}` : '. Ambil data fundamental untuk memuat claims.'}</Text> : <>
          {series.points.slice(0, 6).map(p => <View key={p.period} style={s.row}><Text style={s.muted}>{p.period}</Text><Text style={s.text}>{p.value.toLocaleString('id-ID')}</Text></View>)}
          <Text style={s.text}>Rata-rata 4 minggu terakhir: {average === null ? 'belum cukup minggu berurutan' : average.toLocaleString('id-ID')}</Text>
          <Text style={s.muted}>Diambil: {new Date(series.fetchedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</Text>
        </>}
        <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(claimsUrl(id)).catch(() => {}); }}><Text style={s.link}>Sumber: U.S. ETA melalui FRED · {id} ↗</Text></Pressable>
      </View>;
    })}
    <Text style={s.muted}>Ini data terbaru dari sumber, dapat mencakup revisi. Ringkasan di atas menyaringnya sesuai target NFP dan waktu pengambilan. CSV FRED bukan feed rilis instan.</Text>
  </View>;
}
const s = StyleSheet.create({
  card:{backgroundColor:'#131f30',borderColor:'#253247',borderWidth:1,borderRadius:18,padding:20,marginBottom:18,gap:12},
  title:{color:'#e7c47c',fontSize:11,fontWeight:'700',letterSpacing:1.5},muted:{color:'#9eacc0',fontSize:13,lineHeight:21},text:{color:'#d5deeb',fontSize:14,lineHeight:23},
  group:{gap:10,marginTop:8},label:{color:'#f3f5f8',fontSize:18,fontWeight:'600'},row:{flexDirection:'row',justifyContent:'space-between',gap:10},link:{color:'#e7c47c',fontSize:13,lineHeight:20},
});
