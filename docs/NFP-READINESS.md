# Status kesiapan NFP

Aplikasi dapat dipakai untuk persiapan dan riset NFP. Status **siap sinyal trading XAUUSD** belum terpenuhi. Model atau kode yang berjalan tidak membuktikan keunggulan prediksi. Aplikasi tidak mengirim order ke broker.

## Alur penggunaan

1. Isi jadwal rilis resmi, bulan target, dan konsensus beserta sumbernya. Jam di formulir adalah WIB; timestamp JSON adalah milidetik UTC.
2. Aktifkan pengingat. Jadwal lokal: T−5 jam, T−10 menit, T−5 menit, T+1 menit. Android dapat menunda pengingat; pengingat tidak menjalankan fetch atau snapshot saat aplikasi tertutup.
3. Saat persiapan, buka aplikasi, perbarui BLS/claims, isi ADP/ISM yang sudah terbit, periksa estimasi dan data yang belum tersedia.
4. Simpan catatan antara T−5 jam dan T−5 menit. Salinan estimasi, konsensus, input dan model tidak berubah setelah disimpan.
5. Setelah rilis, isi actual NFP rilis pertama dengan URL laporan BLS dan waktu publikasinya. Ini menambah versi dataset; jangan isi angka revisi sebagai angka pertama. Input manual belum diverifikasi otomatis.
6. Impor harga broker untuk evaluasi. Jurnal memilih satu snapshot terakhir sebelum entry per rilis. Model dasar dapat mengestimasi bulan berikutnya setelah tiga input terakhir lengkap.
7. Cadangkan melalui Supabase atau ekspor dataset riset ke file. Tidak perlu SQL baru: field `research` ikut payload cadangan versi 1. Pemulihan backup lama mengosongkan dataset riset lokal, sesuai konfirmasi di aplikasi.

## Harga HFM dan Exness

Pengguna saat ini memakai **MT5 hanya di Android**. Jalur utamanya:

1. Buka [tick history resmi Exness](https://www.exness.com/tick-history/) melalui browser HP; pilih simbol dan periode event yang sudah terjadi, lalu unduh ZIP.
2. Ekstrak ZIP menggunakan pengelola file Android. Pilih CSV (maksimal 250 MB) melalui panel **Exness: impor langsung dari Android**. Isi waktu rilis WIB, simbol persis, dan asumsi biaya tambahan USD/oz.
3. CSV dibaca bertahap; hanya quote pada dua batas yang disimpan. Tanggal harus UTC berakhiran `Z`. File tidak berurutan, quote terbalik, atau tick tidak tersedia dalam 5 detik sesudah batas ditolak.
4. Hasil diberi feed **Arsip resmi Exness (indikatif; bukan server MT5 akun)**. [Exness menjelaskan](https://get.exness.help/hc/en-us/articles/360021547851-Tick-history) bahwa arsip memakai server tertentu dan tidak dapat dipilih per server akun. Hasil tidak membuktikan harga eksekusi MT5 pengguna.
5. Untuk HFM atau catatan lain, formulir quote manual menerima bid/ask dengan waktu WIB hingga detik dan sumber yang bisa diperiksa. Harga eksekusi satu order saja tidak memuat kedua bid/ask; bila belum ada data, biarkan evaluasi kosong. Sumber manual dipisahkan dari arsip atau terminal.

Jalur unduhan tick otomatis HFM belum terverifikasi. HTTP langsung Exness dari lingkungan pengembangan juga ditolak (403), sehingga tidak ada konektor yang diklaim otomatis. Impor CSV diuji dengan fixture format dokumentasi; pengujian file broker nyata masih diperlukan.

### Alternatif bila kelak ada komputer Windows

Gunakan komputer Windows yang menjalankan terminal MT5 broker dan sudah login. Skrip hanya membaca riwayat harga; tidak menerima password, tidak membuka/menutup posisi. Python package MetaTrader5 diperlukan pada komputer tersebut.

```sh
python -m pip install MetaTrader5
python scripts/export-mt5.py --broker Exness --feed demo-standard --symbol XAUUSDm --release 2026-12-04T13:30:00Z --cost-per-oz 0 --output exness-nfp.json
```

Timestamp dan simbol di atas hanya contoh format, bukan jadwal resmi atau biaya yang direkomendasikan. Ekspor menolak event mendatang. Gunakan tanggal yang telah dirilis, simbol yang benar di terminal, dan biaya tambahan sesuai akun. Untuk HFM gunakan `--broker HFM` dan simbol yang tersedia. `--release` dapat diulang; `--terminal` memilih path terminal64.exe bila ada beberapa terminal. File output yang sudah ada tidak ditimpa. File gagal dibuat jika salah satu event tidak memiliki bid/ask yang sesuai; tidak ada interpolasi harga.

Ekspor menyimpan harga bid dan ask pertama pada/hingga 5 detik setelah T−5 menit serta T+1 menit. Waktu aktual tick tetap disimpan, sehingga keterlambatan tidak disembunyikan. Sumber terminal, broker, server/label jenis akun, dan simbol tetap terpisah. Timestamp mengikuti dokumentasi UTC [MetaTrader 5 copy_ticks_range](https://www.mql5.com/en/docs/python_metatrader5/mt5copyticksrange_py).

`cost-per-oz` adalah total komisi dan slippage asumsi pulang-pergi dalam USD per troy ounce, **di luar spread**. Nilai nol berarti asumsi biaya tambahan nol; hasil itu bukan hasil net eksekusi nyata. Contoh perhitungan:

```text
BUY hipotetis  = exit.bid − entry.ask − biaya tambahan
SELL hipotetis = entry.bid − exit.ask − biaya tambahan
```

Hasil dalam USD/oz, tidak dikalikan lot atau ukuran kontrak. Harga dipakai untuk menguji target waktu, bukan sebagai sinyal teknikal. Pindahkan JSON ke Android lalu tekan **Impor dataset / harga HFM atau Exness**. Jika menggunakan MT4, ekspor ini tidak kompatibel; dibutuhkan ekspor bid/ask dengan timestamp UTC sesuai skema berikut.

## Format riset JSON versi 1

File kosong yang valid:

```json
{"version":1,"releases":[],"outcomes":[],"events":[]}
```

Definisi lengkap ada di `src/research.ts`. Tidak ada contoh angka fundamental fiktif di aplikasi. Field penting:

- `releases`: `{id, period, value, publishedAt, recordedAt, source}`. `value` adalah ribu pekerjaan; URL harus HTTPS pada domain BLS. `publishedAt` adalah waktu rilis; `recordedAt` waktu pengamatan/pencatatan. Saat impor, waktu pencatatan untuk model berjalan diubah menjadi waktu impor perangkat agar tidak mengaku telah mengetahui data lebih awal.
- `outcomes`: `{id, release, broker, feed, symbol, entry, exit, cost, source, recordedAt}`. `broker` HFM/Exness, `symbol` XAUUSD dengan suffix opsional. `entry`/`exit`: `{at,bid,ask}`. Quote terbalik, basi, tanpa timezone epoch, atau di luar toleransi ditolak. Timestamp epoch adalah milidetik.
- `events`: arsip multivariabel `{id,target,release,capturedAt,features,actual}`. Satu event per bulan target/waktu rilis. `actual` mengikuti format `FirstRelease`; `publishedAt` harus sama dengan `release`. `capturedAt` adalah waktu penyusunan arsip, bukan bukti prediksi prospektif.

Setiap elemen `features` wajib berupa `{value,period,publishedAt,knownAt,source}`. `source` URL HTTPS laporan/arsip versi yang digunakan. `knownAt` tidak boleh lebih awal dari publikasi atau melewati T−5 menit. Timestamp yang dinyatakan dalam file belum diverifikasi otomatis terhadap sumbernya.

| Fitur | Satuan | Periode yang diterima |
| --- | --- | --- |
| nfpMean3 | rata-rata 3 NFP pertama terakhir, ribu pekerjaan | bulan sebelum target terakhir |
| adp | perubahan bulanan pekerjaan swasta, ribu | bulan target |
| ismManufacturing | Employment Index 0–100 | bulan target |
| ismServices | Employment Index 0–100 | bulan target |
| claims4w | rata-rata 4 minggu initial claims, jumlah klaim | bulan target; sumber harus memuat minggu yang digunakan |
| unemployment | tingkat pengangguran, persen | sebelum target |
| wages | perubahan upah m/m, persen | sebelum target |
| consensus | konsensus NFP, ribu pekerjaan | bulan target |

Jangan memakai angka yang baru terbit setelah rilis NFP. Contohnya, ISM Services bulan target kadang terbit setelah NFP; event itu tidak memenuhi fitur lengkap model saat ini dan tidak boleh diisi menggunakan nilai masa depan atau perkiraan. Model tidak mengimputasi fitur hilang. Definisi dan kebijakan fitur harus direvisi melalui versi model baru bila coverage tidak memadai.

Impor menambahkan data tanpa menimpa ID lama. ID sama dengan isi berbeda ditolak; koreksi outcome memakai ID baru. Evaluasi broker memilih versi outcome terbaru untuk release/feed/symbol yang sama. Menyunting arsip historis dapat mengubah hasil penelitian; hal itu tidak mengubah snapshot prediksi yang telah tersimpan.

## Evaluasi multivariabel

`ridge-fundamentals-v1`: regresi ridge alpha tetap 10, minimal 24 event pelatihan sebelum setiap prediksi. Standardisasi hanya dihitung dari data pelatihan. Target NFP adalah actual dikurangi konsensus. Evaluasi membandingkan MAE estimasi dengan MAE konsensus pada event uji yang sama.

Untuk harga, regresi terpisah per broker/server-jenis akun/simbol memprediksi perubahan mid-price T−5 ke T+1 dari fitur fundamental. Hanya outcome yang sudah selesai sebelum cutoff event uji masuk pelatihan. Tanda estimasi menentukan arah riset; hasil dihitung dari bid/ask dan biaya tambahan. Pembanding selalu BUY dan selalu SELL memakai event yang sama. Tidak ada probabilitas, klaim win rate, atau aktivasi sinyal live otomatis dari hasil impor.

```sh
npm run research:evaluate -- dataset.json hasil-riset.json
```

Data asli yang dibutuhkan belum tersedia: arsip konsensus dan indikator sebelum revisi, timestamp publikasi yang diaudit, dan tick HFM/Exness. Dataset bawaan NFP 57 angka tidak cukup untuk model multivariabel atau arah emas. Tes sintetis hanya memverifikasi kode, bukan performa pasar.

## Build dan pemeriksaan

Konfigurasi APK internal ada di `eas.json` profil `preview`, resource class medium. Build dijalankan di EAS cloud agar tidak membebani laptop dengan Gradle/emulator. Script `npm run build:android` memeriksa akun Free dan kuota total/Android, menyinkronkan dua environment publik Supabase dari `.env.local` ke preview project, lalu mengirim build tanpa menunggu kompilasi lokal. Tidak ada upgrade atau fallback ke build lokal otomatis. Jangan masukkan service_role key. ID/tautan build tersimpan di `artifacts/eas-build.json`; hasil build tetap perlu diperiksa sebelum dianggap berhasil.

```sh
npm run lint
npm run typecheck
npm test
node tests/build-policy.mjs
python -m unittest discover -s tests -p 'test_*.py'
npx expo-doctor
npm run build:android
```

Checklist perangkat: startup tanpa Metro, offline/cache, izin pengingat ditolak/diizinkan, perubahan jadwal membatalkan pengingat lama, impor gagal tidak merusak data, forecast lama tetap setelah koreksi, login/backup/restore, teks besar dan scrolling. Notifikasi dan impor file belum boleh dianggap lulus hanya karena TypeScript dan bundler lulus.

## Sisa penghalang kesiapan sinyal

- Audit dan pengisian dataset fundamental sebelum rilis, termasuk konsensus; jangan mengklaim model multivariabel telah diuji pada data nyata sebelum dataset tersedia.
- Data tick akun HFM/Exness dan asumsi biaya sesuai pengguna; ekspor memerlukan terminal broker pengguna.
- Pengujian prospektif lintas rilis dengan aturan tetap serta perbandingan baseline setelah biaya. Tidak ada ambang sampel yang otomatis menjamin profitabilitas.
- Kalender/konsensus otomatis dan scheduler backend T−5 jam: belum tersedia. BLS menolak HTTP langsung dari lingkungan ini (403); gunakan input resmi yang diverifikasi sementara, tanpa melewati kontrol akses.
- Uji perangkat nyata dan isolasi akun Supabase. Audit dependency mencatat advisory moderate pada glob/minimatch di tooling Expo/ESLint; jangan downgrade Expo ke SDK 52 hanya untuk mengikuti saran `npm audit fix --force`.
