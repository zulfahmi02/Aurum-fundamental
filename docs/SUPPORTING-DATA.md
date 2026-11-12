# Cakupan data pendukung otomatis

Implementasi 12 November 2026. Memperluas bahan analisis, **belum membuktikan kenaikan akurasi BUY/SELL**. Tidak ada daftar finite yang menjamin semua faktor pasar tercakup. Angka ketersediaan di aplikasi menghitung daftar seri yang ditampilkan, bukan persentase kelengkapan pasar atau confidence trading.

## Yang terhubung

Sembilan seri BLS: payroll, pengangguran, upah, CPI headline/core, PPI headline/core, serta PPI final demand barang/jasa. Dua rincian PPI terakhir ditambahkan ke satu permintaan BLS yang sudah ada, bukan satu permintaan per seri. Sumber kode `WPSFD41` dan `WPSFD42` mengacu pada [daftar agregasi BLS](https://www.bls.gov/ppi/fd-id/ppi-final-demand-intermediate-demand-aggregation-indexes-by-title-and-series-id.htm); awalan WPS adalah seasonally adjusted.

Tambahan 16 seri:

| Kelompok | Seri dan sumber | Penggunaan sekarang |
| --- | --- | --- |
| Claims | [ICSA](https://fred.stlouisfed.org/series/ICSA), [CCSA](https://fred.stlouisfed.org/series/CCSA), U.S. ETA melalui FRED | Konteks NFP/FOMC; level dan rata-rata empat minggu hanya bila minggu berurutan. Kedua seri dapat memiliki tanggal observasi berbeda. |
| ADP | [JSON publik situs resmi](https://adpemploymentreport.com/ner_production.json) | Perubahan pekerjaan swasta bulanan. Bukan NFP total, tidak dibandingkan langsung dengan konsensus NFP. |
| Inflasi PCE | [PCEPI](https://fred.stlouisfed.org/series/PCEPI), [PCEPILFE](https://fred.stlouisfed.org/series/PCEPILFE), BEA melalui FRED | Level indeks, m/m dan y/y jika periode pembanding tersedia tepat. Konteks CPI/FOMC. |
| Tenaga kerja | [JTSJOL](https://fred.stlouisfed.org/series/JTSJOL), [CIVPART](https://fred.stlouisfed.org/series/CIVPART), [AWHAETP](https://fred.stlouisfed.org/series/AWHAETP), BLS melalui FRED | Lowongan JOLTS, partisipasi, jam kerja sektor swasta untuk konteks NFP/FOMC. |
| Komponen CPI | [CPIENGSL](https://fred.stlouisfed.org/series/CPIENGSL), [CUSR0000SAH1](https://fred.stlouisfed.org/series/CUSR0000SAH1), [CPIFABSL](https://fred.stlouisfed.org/series/CPIFABSL), BLS melalui FRED | Energi, shelter, makanan dan minuman; level indeks dan pertumbuhan, bukan kontribusi berbobot terhadap headline. |
| Yield | [DGS2](https://fred.stlouisfed.org/series/DGS2), [DGS10](https://fred.stlouisfed.org/series/DGS10), [DFII10](https://fred.stlouisfed.org/series/DFII10), Fed melalui FRED | Yield nominal 2/10 tahun dan riil 10 tahun. Data harian tertunda, bukan quote saat news. |
| Dolar | [DTWEXBGS](https://fred.stlouisfed.org/series/DTWEXBGS), Fed melalui FRED | Indeks dolar broad, **bukan DXY**. Frekuensi observasi harian tidak berarti publikasi real-time. |
| Energi | [DCOILWTICO](https://fred.stlouisfed.org/series/DCOILWTICO), EIA melalui FRED | Harga WTI spot harian tertunda. Bukan harga bensin konsumen dan bukan proyeksi CPI langsung. |

Endpoint ADP ditemukan pada JavaScript publik situs resminya, lalu responsnya diperiksa nyata. Parser mencocokkan tipe NER, bulan/tahun, judul kartu, angka, arah perubahan dan headline. Tanggal dokumen diperoleh dari path press release resmi; **jam publikasi belum diverifikasi**. Format tidak dikenal ditolak, bukan ditebak. Ini endpoint situs publik, bukan kontrak API dengan jaminan stabilitas.

FRED diambil dalam tiga batch sesuai frekuensi (mingguan, bulanan, harian); ADP satu permintaan. Refresh empat jam; kegagalan diberi jeda satu jam. Tidak memerlukan API key berbayar. Ukuran respons dan timeout dibatasi. Kolom hilang atau sumber gagal ditampilkan per seri; nilai terakhir tetap disimpan dengan timestamp pengambilan lamanya. Data WTI yang diperiksa 12 November 11.27 WIB masih bertanggal 3 November sehingga ditandai **data lama**.

## Hubungan dengan bias

Aturan `fundamental-scenario-v1` tetap dipertahankan agar arsip lama bisa direproduksi. Enam belas seri pendukung dan rincian PPI barang/jasa **belum diberi bobot atau suara BUY/SELL tambahan**. Aplikasi menyatakannya secara eksplisit. Menambah indikator yang berkorelasi tidak sama dengan menambah bukti independen. Belum ada klaim bahwa ADP/claims/PCE atau yield menguatkan akurasi aturan v1.

Untuk memakai indikator dalam versi model berikutnya diperlukan dataset yang memang tersedia pada waktu prediksi, konsensus historis, hasil rilis pertama, harga broker, serta uji kronologis di luar pelatihan. Tanpa itu, bobot atau persentase keyakinan akan menjadi pilihan spekulatif. Model riset yang sudah ada belum memiliki dataset lengkap tersebut.

## Pengetahuan sebelum cutoff dan arsip revisi

- Setiap seri menyimpan periode observasi, angka, `fetchedAt` versi yang benar-benar diterima, serta `attemptedAt` percobaan terakhir. Periode bukan timestamp publikasi.
- Pada ADP, tanggal dokumen bukan timestamp pasti publikasi; pemakaian baru dianggap diketahui saat diambil sistem. ADP yang tidak sesuai asumsi bulan target NFP ditandai belum tersedia untuk target itu.
- Konteks disalin ke laporan hanya jika selesai diambil sebelum waktu laporan; jadwal/cutoff T−5 tetap berlaku. Arsip lama tidak diberi data tambahan secara retrospektif.
- Tabel `aurum_auto_context_history` menyimpan tiap versi pengambilan server. Cache diperbarui setelah penulisan arsip berhasil; service role hanya diberi select/insert untuk riwayat ini. Aplikasi hanya boleh membaca.
- `selectSupportAsOf` memilih versi yang sudah dicatat sebelum cutoff. Data bertanggal observasi lama tetapi baru diunduh hari ini tidak boleh dipakai untuk menguji prediksi masa lalu.
- Riwayat mulai terkumpul sejak integrasi aktif, bukan rekonstruksi vintage sebelum 12 November 2026. Respons dapat memuat revisi; tidak dilabeli sebagai actual rilis pertama.
- Timestamp masa depan, tanggal/kolom duplikat, frekuensi salah, indeks tidak positif, dan unit claims tidak masuk akal ditolak. Rata-rata/pertumbuhan tidak menjembatani periode yang hilang.
- Cache perangkat dibatasi sekitar 1,5 MB UTF-8 secara konservatif. Bila snapshot makin banyak, catatan tertua dikeluarkan hanya dari cache perangkat; arsip server tetap ada.

## Yang masih belum lengkap

| Kekurangan | Status / dampak |
| --- | --- |
| ISM Manufacturing/Services Employment dan Prices | Situs resmi menolak akses langsung lingkungan ini dengan HTTP 403. Tidak melewati pembatasan atau mengganti angka dengan headline PMI; konektor otomatis belum aktif. |
| Harga impor, bobot dan seluruh komponen inflasi | Belum diintegrasikan seluruhnya. Tidak mengklaim mampu merekonstruksi CPI/PPI lengkap. |
| Pricing futures dan probabilitas keputusan Fed | Belum ada konektor gratis tervalidasi; konsensus rate tunggal bukan distribusi probabilitas pasar. |
| PCE detail, ECI, GDP/permintaan dan komunikasi Fed | Belum dimodelkan bersama. Kalender/rentang target/pernyataan hasil Fed yang sudah ada bukan model tone/dot plot. |
| Kalender resmi BLS / actual rilis pertama otomatis | Verifikasi belum lengkap; jadwal masih diberi label feed pihak ketiga. Observasi terbaru BLS bukan sertifikasi rilis pertama. |
| Konsensus/vintage historis dan bid/ask HFM/Exness | Dataset lengkap untuk evaluasi T−5 sampai T+1 belum tersedia. Tidak ada angka akurasi buatan. |
| Kejutan geopolitik, positioning, arus ETF/bank sentral dan ekspektasi intraday | Tidak tercakup lengkap; ini contoh batas cakupan, bukan daftar lengkap seluruh pengaruh XAUUSD. |

## Pemeriksaan

Tes mencakup parser ADP/FRED, tanda negatif, periode target, timestamp masa depan, kolom hilang, gap minggu/bulan, kegagalan sumber/backoff, pemilihan as-of, snapshot yang tidak berubah, serta ukuran cache. Tes worker memeriksa arsip konteks hanya ditulis saat ada pengambilan baru. Pengambilan nyata 12 November 11.27 WIB mengembalikan semua 16 seri pendukung dan sembilan seri BLS; ketersediaan sumber tidak sama dengan semua periode mutakhir. Pengujian fisik di HP dan penerbitan laporan rilis berikutnya tetap perlu dipantau. Tidak menjalankan build APK/EAS.

Migrasi 007 dan worker sudah diterapkan. Cron nyata 12 November **11.35 WIB** berhasil menyimpan 16 seri pendukung tanpa error sumber dan menulis arsip versinya. Pembacaan publik dan penolakan penulisan anonim lulus. Saat siklus tersebut cache BLS server masih tujuh seri; penambahan dua rincian PPI mengikuti jeda pengambilan berikutnya, sedangkan pengujian API langsung telah memverifikasi sembilan seri. Lint, typecheck, tes aplikasi/worker dan bundle Expo Go HTTP 200 lulus.
