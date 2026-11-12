# Aurum Fundamental — Android

Fondasi aplikasi pribadi XAUUSD berbasis Expo + TypeScript. Data BLS tidak memerlukan API key. Pencadangan Supabase menggunakan URL project dan publishable key pribadi.

## Menjalankan

```sh
npm install
npm start
```

Buka dengan versi Expo Go yang kompatibel dengan SDK proyek pada Android, atau jalankan `npm run android` dengan emulator/perangkat development yang sudah tersedia.

## Sudah tersedia

- Panel laporan otomatis tanpa input: kalender/konsensus mingguan pihak ketiga, konteks BLS, jadwal pagi 07.00 WIB / T−5 jam / T−10 menit, cache dan arsip tahap. Backend terjadwal sudah diterapkan pada project tujuan. Bias BUY/SELL/NETRAL eksperimen telah diimplementasikan untuk empat news, dengan alasan dan pengaman data; belum tervalidasi untuk trading. Panduan: [docs/AUTOMATIC-REPORTS.md](docs/AUTOMATIC-REPORTS.md).
- Pencatatan harga XAUUSD indikatif (Swissquote) pada T−5 menit dan T+1 menit oleh backend, dengan rekap bias vs pergerakan harga di panel utama. Bukan harga server HFM/Exness.
- Pengingat otomatis untuk NFP, CPI, PPI, dan FOMC: pagi 07.05 WIB, T−5 jam, dan T−15 menit. Pengiriman di HP belum diuji.
- Kalender resmi Fed, konteks rentang suku bunga, arsip event lampau, dan pencatatan hasil terpisah. Pernyataan resmi FOMC dibedakan dari observasi BLS yang belum terverifikasi sebagai rilis pertama; keduanya tidak otomatis menjadi evaluasi arah emas.

- Form NFP: jadwal WIB, konsensus manual (ribu pekerjaan), sumber.
- Model awal PPI headline m/m: rencana, estimasi vs konsensus, alasan/input, evaluasi historis, hasil rilis manual, catatan tetap dan backup. Panduan: [docs/PPI-MODEL.md](docs/PPI-MODEL.md).
- Penyimpanan rencana lokal dan jendela T−5 jam / T−5 menit saat aplikasi terbuka.
- Pengambilan manual data BLS API v1 tanpa registrasi, satu POST untuk enam seri: NFP (CES0000000001), tingkat pengangguran (LNS14000000), lowongan JOLTS (JTS000000000000000JOL), CPI-U (CUSR0000SA0), PPI final demand (WPSFD4), dan upah per jam seluruh karyawan swasta (CES0500000003). Kuota v1 sekitar 25 permintaan per hari per IP, jangkauan sekitar 3 tahun.
- Perubahan payroll bulanan dihitung dari level employment yang disesuaikan musiman. CPI dan PPI ditampilkan sebagai perubahan bulan-ke-bulan. Versi data terbaru termasuk revisi, bukan initial release vintage.
- Status kesalahan jaringan, timeout, sumber dan waktu pengambilan data.
- Cache BLS lokal tervalidasi: dibaca kembali saat aplikasi dibuka, data lama tetap tampil jika pembaruan gagal.
- Ringkasan deskriptif perubahan bulanan, tautan tiap seri, serta daftar data yang belum tersedia. Panel model NFP eksperimental terpisah dijelaskan di bawah.
- Catatan persiapan manual T−5 jam sampai T−5 menit: salinan data, konsensus, alasan, dan waktu disimpan tetap. Catatan lama tidak dihitung ulang saat data diperbarui.
- Riwayat catatan bisa dibuka kembali. Penyimpanan catatan ditolak jika cache lebih dari 24 jam atau waktu perangkat tidak konsisten. Batas 24 jam adalah aturan pembaruan aplikasi, bukan jaminan data ekonomi terbaru.

## Batas versi ini

Belum ada sinyal BUY/SELL live terverifikasi. Kalender/konsensus mingguan pihak ketiga dan konteks BLS sudah diambil otomatis saat aplikasi terbuka; backend terjadwal sudah diterapkan di Supabase. Model NFP dan PPI awal serta mesin riset arah emas tetap tersedia melalui bagian riset opsional. Model khusus CPI/FOMC dan data sebelum rilis/harga HFM–Exness untuk validasi arah emas belum lengkap. Model PPI belum mengalahkan rata-rata sederhana dalam evaluasi awal.

Kalender/konsensus gratis Forex Factory/Fair Economy berhasil diakses, tetapi pencocokan otomatis dengan jadwal resmi dan cakupan di luar minggu berjalan belum tersedia. ADP/ISM masih input manual di panel riset; claims FRED diperbarui melalui panel tersebut. Jangan menafsirkan riwayat payroll atau selisih konsensus terhadap previous sebagai sinyal arah emas. Aplikasi tidak menampilkan data simulasi atau probabilitas buatan. Sumber gratis dapat terlambat atau membatasi akses.

Laporan dan pencatatan harga dijalankan backend Supabase terjadwal, juga saat aplikasi ditutup. Pengingat lokal hanya mengajak membuka aplikasi dan dapat ditunda Android; jadwalnya diperbarui saat aplikasi dibuka. Pengujian historis membutuhkan data yang benar-benar tersedia sebelum rilis, termasuk versi konsensus dan revisi pada saat itu.

## Verifikasi

```sh
npm run lint
npm run typecheck
npm run test:all
npm run nfp:evaluate
npm run ppi:evaluate
npx expo export --platform android
```

## Sumber

- https://www.bls.gov/developers/
- https://www.bls.gov/schedule/news_release/empsit.htm
- https://www.bls.gov/ces/

Akses API nyata dan tampilan perangkat perlu diperiksa pada jaringan/perangkat pengguna. Tidak ada APK yang dibangun dalam scaffold ini.

## Pemeriksaan manual Android

1. Ambil data BLS, tutup dan buka aplikasi; nilai dan waktu pengambilan harus tetap sama.
2. Putus koneksi, tekan pembaruan; pesan gagal muncul dan data lama tetap tampil.
3. Isi rencana dengan rilis 2 jam mendatang, bulan target sebelum bulan rilis, konsensus dan sumber, lalu simpan catatan.
4. Ubah konsensus atau ambil ulang data; detail catatan sebelumnya harus tetap sama.
5. Rencana di luar T−5 jam sampai T−5 menit tidak dapat disimpan sebagai catatan persiapan.
6. Periksa font besar dan scrolling pada HP. Pengujian perangkat belum dilakukan di lingkungan ini.

Checklist pengerjaan selanjutnya ada di [ROADMAP.md](ROADMAP.md).

## Supabase (opsional)

Project kini memiliki login dan pencadangan manual ke Supabase. Konfigurasi publik disimpan dalam `.env.local`, dengan template `.env.example`. Jalankan SQL di `supabase/migrations/202611110001_backups.sql` melalui SQL Editor sebelum memakai fitur cadangan. Panduan lengkap dan batas implementasi: [supabase/README.md](supabase/README.md).

Tanpa konfigurasi atau tanpa login, fungsi lokal tetap berjalan. Pencadangan tidak membuat mesin prediksi, scheduler, atau sinkronisasi otomatis. Database Supabase dan API data ekonomi BLS adalah dua layanan berbeda.

## Data pendukung NFP (11 November 2026)

- Upah: perubahan persen bulan-ke-bulan dari rata-rata upah per jam seluruh pekerja swasta BLS `CES0500000003`, disesuaikan musiman. Angka bulan target belum diprediksi.
- Claims: `ICSA` dan `CCSA` dari unduhan CSV FRED, bersumber dari U.S. Employment and Training Administration; nasional, seasonally adjusted, satuan jumlah (bukan ribu). Dua permintaan terpisah dengan timeout dan status kegagalan masing-masing. Kegagalan claims tidak menggagalkan data BLS yang berhasil.
- Data terbaru disimpan 6 bulan untuk seri BLS dan 52 minggu untuk claims. Rata-rata 4 minggu hanya dihitung bila empat minggu terakhir berurutan; tanggal hilang tidak diisi atau dianggap nol.
- Form membutuhkan bulan target NFP `YYYY-MM`, berbeda dari bulan rilis. Bulan target harus sebelum bulan rilis; laporan tertunda boleh memiliki target lebih lama.
- Ringkasan bulanan hanya memakai periode sebelum bulan target. Ini filter konservatif, bukan rekonstruksi kalender rilis. Claims menggunakan minggu sampai bulan target, dengan minggu yang mencakup tanggal 12 ditandai sebagai konteks, bukan disamakan dengan periode penggajian NFP.
- Setiap sumber harus diambil sebelum batas `min(waktu peninjauan, waktu rilis − 5 menit)` untuk muncul dalam ringkasan. Data yang datang setelah batas tidak digunakan. Panel data mentah tetap menampilkan data terbaru dan periodenya secara eksplisit.
- Timestamp publikasi resmi belum tersedia dari integrasi ini; waktu pengambilan berasal dari perangkat. Data revisi terbaru tidak boleh dipakai sebagai data historis point-in-time hanya karena periodenya lebih lama.
- Cache dan backup versi 1 tetap kompatibel: upah, claims, dan bulan target bersifat opsional pada catatan lama. Bulan target wajib saat menyimpan rencana/catatan baru. Tidak perlu menjalankan migrasi SQL tambahan untuk payload backup.

Sumber dan definisi:
- https://www.bls.gov/ces/data/employment-and-earnings-tables.htm
- https://fred.stlouisfed.org/series/ICSA
- https://fred.stlouisfed.org/series/CCSA
- https://fred.stlouisfed.org/help/data/downloading/using-the-download-data-link

Unduhan CSV adalah akses data publik, bukan feed real-time dengan SLA. Uji juga dari jaringan HP; status offline/terbatas harus terlihat tanpa angka rekaan.

## ADP dan ISM manual

Form **ADP & ISM / Input laporan resmi** menerima:

- ADP perubahan pekerjaan swasta bulanan dalam ribu pekerjaan (boleh negatif); bukan NER Pulse mingguan.
- ISM Manufacturing **Employment Index**, rentang 0–100.
- ISM Services **Employment Index**, rentang 0–100. Bukan headline PMI.
- Bulan data, waktu rilis versi yang dibaca dalam WIB, dan URL laporan resmi. Host yang diterima: adpemploymentreport.com, adp.com, adpresearch.com (termasuk subdomain) untuk ADP; ismworld.org untuk ISM. Validasi domain tidak membuktikan isi atau nilai laporannya.

Waktu pencatatan ditentukan perangkat saat menyimpan. Koreksi menambah versi, tidak mengubah versi sebelumnya. Ringkasan hanya memilih versi terbaru untuk bulan target dengan `publishedAt` dan `recordedAt` tidak melewati `min(now, release − 5 menit)`. Data bulan lain tidak otomatis menggantikan data target. Input yang terlambat tetap tersimpan tetapi tidak dipakai untuk analisis sebelum cutoff.

ADP/ISM manual tersimpan terpisah dari cache BLS, sehingga refresh BLS tidak menimpanya. Data ikut salinan catatan persiapan dan backup Supabase. Backup lama tanpa field `manual` tetap dapat dipulihkan; pemulihan backup lama mengganti daftar manual lokal menjadi kosong, sesuai konfirmasi bahwa seluruh data lokal diganti. Tidak perlu migrasi SQL tambahan.

Hasil pemeriksaan akses pada 11 Nov 2026: ADP merespons sebagai shell aplikasi JavaScript; ISM menolak HTTP langsung dari lingkungan pengembangan (403). Halaman laporan dapat ditemukan melalui pencarian web. Ini bukan klaim tidak ada API gratis sama sekali; konektor otomatis yang stabil belum diverifikasi. Tidak ada bypass atau ekstraksi angka tanpa periode dan metadata yang jelas.

Sumber definisi:
- https://adpemploymentreport.com/Default.aspx (ADP bukan prediksi NFP BLS).
- https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/ (pilih laporan dan komponen Employment).

Uji manual Android tambahan: masukkan data dari laporan resmi yang sudah terbit, simpan koreksi, pastikan ringkasan memakai versi yang sesuai cutoff; catatan lama tidak berubah; backup dan pulihkan versi inputnya. Angka/waktu rilis ditandai sebagai input manual yang belum diverifikasi otomatis.

## Model NFP awal

Panel **NFP / Model awal** menampilkan estimasi pertambahan pekerjaan dalam ribu, konsensus yang dicatat pengguna, selisih keduanya, tiga input, koefisien, dan rentang pelatihan. Selisih itu bukan actual surprise maupun sinyal arah emas. ADP/ISM/claims/upah/pengangguran belum masuk model numerik.

Dataset `src/data/nfpFirst.ts` berisi 57 angka kolom **seasonally adjusted / 1st** dari [tabel revisi resmi BLS](https://www.bls.gov/web/empsit/cesnaicsrev.htm), Januari 2022–Oktober 2026, diperiksa 11 November 2026 WIB. Angka berasal dari tabel rilis awal, bukan selisih level payroll BLS versi terbaru. Oktober 2025 dikecualikan: kolom pertama kosong terkait penghentian operasi pemerintah; angka di kolom kedua tidak diperlakukan sebagai rilis pertama reguler. Dataset tidak menyimpan timestamp publikasi setiap observasi.

Rumus versi `nfp-ols-mean3-v1`:

```text
x = rata-rata angka NFP rilis pertama pada tiga bulan tepat sebelum target
estimasi = intercept + slope × x
```

Intercept dan slope dipelajari dengan regresi linear OLS dari pasangan input dan actual pada bulan-bulan sebelum target, minimal 12 pasangan. Setiap prediksi memakai pelatihan yang bertambah hanya dari bulan sebelumnya. Target dan bulan sesudahnya tidak masuk pelatihan; bulan kosong tidak diisi/interpolasi. Tidak ada tuning parameter berdasarkan hasil evaluasi. Pembanding adalah rata-rata tiga bulan yang sama tanpa regresi.

Evaluasi yang dapat diulang dengan `npm run nfp:evaluate`, hasil lengkap per bulan di [reports/nfp-evaluation.json](reports/nfp-evaluation.json):

| Periode target | Prediksi | MAE model | MAE rata-rata 3 bulan |
| --- | ---: | ---: | ---: |
| Jan–Des 2024 | 12 | 77,55 ribu | 83,78 ribu |
| Jan 2025–Okt 2026 | 18 | 79,33 ribu | 76,09 ribu |

Empat bulan pada periode kedua dilewati: Oktober 2025 tidak memiliki target actual pada kolom pertama; November–Desember 2025 dan Januari 2026 kehilangan satu dari tiga input. Model belum konsisten mengalahkan rata-rata sederhana. MAE bukan persentase akurasi, probabilitas, interval prediksi, atau batas kesalahan maksimum. Laporan juga memuat RMSE dan rata-rata error bertanda (`estimate − actual`).

Ini simulasi kronologis berdasarkan bulan referensi atas tabel yang diambil belakangan. Urutan dan waktu publikasi tiap event, termasuk keterlambatan rilis, belum diaudit. Belum ada konsensus historis atau harga XAUUSD T−5 sampai T+1, sehingga hasil tersebut tidak membuktikan performa trading.

Untuk pemakaian mendatang, model menolak target yang sudah ada/terlewati dalam dataset, tiga bulan input tidak lengkap, dataset atau konsensus yang dicatat setelah cutoff, serta perhitungan baru setelah T−5 menit. Dataset bawaan mendukung November 2026; target berikutnya dapat dibuka dengan memasukkan hasil rilis pertama BLS di panel riset. Model belum memiliki pembaruan dataset otomatis; **Perbarui data BLS + claims tidak memperbarui dataset model**. Jangan mengganti angka rilis pertama dengan revisi dari cache BLS.

Saat menyimpan catatan persiapan, estimasi yang tersedia ikut disalin beserta input, koefisien, konsensus, timestamp, dan versi model/dataset. Riwayat menampilkan salinan itu tanpa menghitung ulang. Backup Supabase menyimpan field opsional `nfpForecast` di payload yang sudah ada, tanpa migrasi SQL tambahan. Catatan lama atau catatan saat estimasi tidak tersedia tetap bisa dibaca dan ditandai tanpa estimasi.

Uji Android: simpan rencana mendatang dengan target November 2026; periksa panel dan perbandingan konsensus; pada jendela pencatatan simpan hasil, lalu ubah konsensus dan pastikan estimasi lama tetap sama. Lewati cutoff dan pastikan estimasi baru berhenti sementara arsip tetap terbaca. Untuk target Desember 2026 sebelum dataset diperbarui, panel harus menjelaskan kekurangan input, bukan mengulang estimasi target sebelumnya.

## Riset broker dan penggunaan Android

Pengguna memakai MT5 Android untuk HFM dan Exness. Panel riset menerima CSV tick resmi Exness yang diunduh lewat browser dan diekstrak dari ZIP di HP, serta input quote manual dari sumber broker yang dapat diperiksa. Arsip Exness bersifat indikatif dan tidak disamakan dengan server MT5 akun. Parser membaca bertahap, menyimpan hanya dua quote, memvalidasi UTC/simbol dan batas 5 detik setelah T−5/T+1. Skrip MT5 Windows adalah alternatif opsional, bukan syarat Android.

Mesin ridge multivariabel dan evaluasi XAUUSD hanya berjalan bila dataset arsip lengkap diimpor. Standardisasi serta pelatihan tidak memakai target/future; hasil dipisahkan per broker/feed/simbol dan dibandingkan dengan konsensus atau baseline selalu BUY/SELL. Belum ada klaim performa nyata atau aktivasi sinyal live. Panduan lengkap, skema impor, dan sisa penghalang kesiapan ada di [docs/NFP-READINESS.md](docs/NFP-READINESS.md).

`npm run build:android` mengirim build APK internal ke **EAS cloud**. Script memeriksa paket Free dan sisa kuota Android terlebih dahulu, lalu menyinkronkan hanya dua variabel publik Supabase dari `.env.local` ke environment preview project. Jika paket/kuota tidak terverifikasi atau habis, script berhenti tanpa upgrade otomatis. Gradle dan emulator tidak dijalankan di laptop. Akun EAS yang sudah login diperlukan; Android SDK lokal tidak diperlukan. ID dan tautan build disimpan di `artifacts/eas-build.json`.

Data pendukung otomatis dan batas cakupannya: [docs/SUPPORTING-DATA.md](docs/SUPPORTING-DATA.md). Tambahan data belum menjadi bukti peningkatan akurasi bias.
