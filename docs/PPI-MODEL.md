# Model PPI awal

Panel PPI menyediakan estimasi **final demand headline, m/m, seasonally adjusted**, perbandingan dengan konsensus manual, input dan rumus, serta catatan persiapan. Perhitungan berlangsung di perangkat; tidak membutuhkan layanan ML atau API berbayar. Model ini belum menghasilkan sinyal BUY/SELL XAUUSD.

## Data dan satuan

Dataset bawaan `src/data/ppiFirst.ts` memuat 32 angka Januari 2024–September 2026, dikumpulkan 11 November 2026. Setiap nilai diambil hanya dari headline bulan target pada paragraf pembuka [arsip rilis PPI BLS](https://www.bls.gov/bls/news-release/ppi.htm), dengan URL sumber dan timestamp embargo per baris. Jam 08:30 Eastern dikonversi ke UTC memakai zona `America/New_York`, termasuk daylight saving time.

Angka bulan sebelumnya dalam rilis yang lebih baru dapat sudah direvisi. Contoh: [rilis Maret 2024](https://www.bls.gov/news.release/archives/ppi_04112024.htm) menyebut +0,2%; [rilis April 2024](https://www.bls.gov/news.release/archives/ppi_05142024.htm) kemudian menyebut Maret −0,1%. Dataset ini memakai +0,2% untuk Maret. Cache API BLS terbaru tidak digunakan sebagai arsip rilis pertama dan tombol refresh BLS tidak memperbarui dataset model.

Oktober 2025 tidak memiliki rilis bulanan terbit menurut halaman arsip BLS. Dataset sengaja membiarkannya kosong; tidak mengisi bulan itu dari tabel revisi atau rilis bulan lain. Karena model membutuhkan tiga bulan berurutan, beberapa prediksi setelahnya dilewati.

Input `0,2` berarti **0,2% m/m**, bukan 20%, bukan perubahan tahunan, bukan level indeks, dan bukan core. Selisih estimasi 0,3% terhadap konsensus 0,2% adalah **0,1 poin persentase**. Core PPI serta indeks excluding foods, energy, and trade services tidak dicampur dengan headline.

## Model dan evaluasi

`ppi-ols-mean3-v1` mempelajari regresi `PPI = intercept + slope × rata-rata tiga rilis pertama sebelumnya`. Minimum 12 pasangan pelatihan. Koefisien dilatih ulang dengan jendela yang bertambah, tanpa random split. Untuk setiap pasangan pelatihan, ketiga input harus sudah diterbitkan paling lambat T−5 menit rilis target pasangan tersebut. Target prediksi dan bulan sesudahnya tidak masuk pelatihan.

Evaluasi retrospektif April 2025–September 2026 menghasilkan 14 prediksi dan melewati 4 bulan. MAE model **0,549 poin persentase**, dibanding **0,538** untuk rata-rata tiga bulan. Model **belum mengalahkan pembanding sederhana**. Tidak dilakukan pemilihan model atau penggantian periode untuk memperbaiki angka ini.

Laporan lengkap: [reports/ppi-evaluation.json](../reports/ppi-evaluation.json). Reproduksi:

```sh
npm run ppi:evaluate
```

Arsip dikumpulkan belakangan, sehingga evaluasi ini bukan bukti prediksi yang benar-benar dicatat sebelum rilis historis. Sampel kecil, konsensus historis dan harga XAUUSD tidak tersedia dalam evaluasi ini. MAE bukan probabilitas benar atau batas maksimum kesalahan. Energi, barang/jasa, ISM Prices, dan komponen core belum menjadi fitur model. Belum ada pengujian profit/spread HFM atau Exness untuk PPI.

## Penggunaan dan penyimpanan

1. Isi waktu rilis WIB, bulan data, konsensus headline m/m, dan sumber konsensus. Periksa kalender BLS; jadwal belum diisi otomatis.
2. Estimasi tersedia saat aplikasi dibuka jika tiga bulan input dan data pelatihan lengkap. Rencana, dataset, dan versi manual harus sudah diketahui sebelum cutoff. Rencana bulan yang hasilnya sudah diketahui ditolak sebagai forecast baru.
3. Simpan catatan secara manual pada T−5 jam sampai T−5 menit, termasuk kedua batasnya. Setelah T−5 menit, estimasi baru dinonaktifkan; catatan tetap dapat dibaca.
4. Setelah hasil rilis, masukkan angka headline **rilis pertama** dari URL arsip BLS, bulan, dan waktu publikasi WIB. Koreksi salah salin menambah versi, tidak mengubah versi lama. Waktu pencatatan diberikan perangkat. Form memvalidasi format/domain, tetapi isi sumber dan angka belum diverifikasi otomatis.
5. Catatan membekukan rencana, konsensus, tiga input beserta URL/waktu publikasinya, koefisien, rentang pelatihan, waktu estimasi, waktu ketersediaan dataset, dan identitas versi. Hasil tidak dihitung ulang saat ada input baru.

State PPI memakai kunci lokal `aurum-ppi-v1` dan field opsional `ppi` pada backup Supabase versi 1. Tidak perlu migrasi SQL tambahan. Restore backup lama tanpa PPI mengosongkan state PPI lokal, sesuai konfirmasi pemulihan. Jurnal restore juga mencakup PPI agar pemulihan yang terputus bisa dilanjutkan. Data rusak memblokir penulisan dan upload; restore cadangan valid tetap tersedia.

Pengingat lokal saat ini hanya untuk NFP. PPI belum memiliki notifikasi, fetch otomatis, snapshot latar belakang, evaluasi hasil terhadap catatan pengguna, atau sinyal arah emas.

## Verifikasi dan batas perangkat

Tes mencakup nilai awal vs revisi, DST, satuan, bulan hilang, kebocoran target/future, waktu publikasi pada pasangan pelatihan, cutoff versi manual, pembekuan snapshot, backup lama, dan pemulihan storage yang terputus. Jalankan `npm test`, `npm run lint`, dan `npm run typecheck`.

Tampilan dan persistensi di HP Android belum diuji untuk PPI. Setelah APK baru tersedia, periksa: form tersimpan setelah restart; koma/angka negatif; tautan sumber; catatan pada batas jendela; perubahan konsensus tidak mengubah catatan lama; backup/restore PPI; font besar dan scrolling. Jangan memakai jadwal contoh tes sebagai kalender rilis nyata.

Build cloud `49e03004-9aaf-40d2-a083-1565ced1d63f` selesai, tetapi diajukan sebelum implementasi PPI sehingga tidak memuat fitur ini. [Build APK PPI de14f7e3](https://expo.dev/accounts/pahmii22/projects/aurum-fundamental/builds/de14f7e3-b13a-4144-a24c-bc64508edd43) sudah dikirim ke EAS cloud memakai kuota gratis pada 11 November 2026. Instalasi dan pengujian HP menunggu hasil build tersebut.
