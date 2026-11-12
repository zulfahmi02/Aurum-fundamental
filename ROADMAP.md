# Checklist Aurum Fundamental

## Prioritas yang disepakati — otomatisasi tanpa input rutin
- Pengguna akan memeriksa perubahan melalui Expo Go terlebih dahulu. **Jangan menjalankan build APK/EAS baru sampai pengguna meminta build.**
- Cakupan laporan: NFP, CPI, PPI, dan FOMC; jadwal dan data diambil otomatis.
- Laporan awal pukul 07.00 WIB, diperbarui T−5 jam dan menjelang entry T−5 menit. Untuk rilis dini hari, laporan pagi disiapkan sehari sebelumnya.
- Tampilkan bias XAUUSD, alasan, sumber, waktu pembaruan dan data yang masih ditunggu. Jika bukti/data tidak cukup, tampilkan belum ada sinyal.
- Snapshot pagi dan pembaruan harus disimpan terpisah untuk evaluasi terhadap jendela T−5 hingga T+1 menit.
- Backend harus menjalankan pengambilan dan analisis saat aplikasi ditutup; Expo Go dipakai untuk memeriksa antarmuka dan pembacaan hasil.
- Status saat ini: kalender/konsensus pihak ketiga dan konteks BLS otomatis di aplikasi sudah diimplementasikan. **Backend terjadwal sudah diterapkan; bias BUY/SELL/NETRAL eksperimen tersedia, model arah emas teruji belum tersedia.** Rincian kemajuan dan kekurangannya ada di bawah.

### Implementasi laporan otomatis
- [x] Enam belas seri pendukung otomatis (ADP, claims, PCE, JOLTS, partisipasi/jam kerja, komponen CPI, yield, dolar broad, WTI) dan dua rincian PPI tambahan.
- [x] Arsip versi konteks pendukung dan penyaringan as-of, metadata sumber/periode/staleness, serta pembatasan ukuran cache perangkat.
- [x] Migrasi 007 dan worker diterapkan; cron 12 November 11.35 WIB menyimpan 16 seri pendukung dan arsip versi tanpa error sumber. Pemeriksaan izin API dan bundle Expo Go lulus.
- [ ] Kalibrasi penggunaan indikator pendukung pada model arah; saat ini konteks, belum menambah bobot BUY/SELL.

Rincian sumber dan cakupan yang masih kurang: [docs/SUPPORTING-DATA.md](docs/SUPPORTING-DATA.md).

- [x] Bias skenario v1 NFP/CPI/PPI/FOMC, alasan per komponen, NETRAL untuk konflik dan NO_SIGNAL untuk data yang tidak memenuhi syarat.
- [x] Core PPI WPSFD49104 otomatis; tujuh seri BLS berhasil diperiksa melalui API nyata.
- [x] Pengujian arah, cutoff, periode, konsensus, snapshot dan worker; bias tidak diklaim tervalidasi untuk trading.
- [x] Migrasi 006 dan worker bias eksperimen diterapkan ke Supabase; lint, typecheck, seluruh tes dan bundle Expo Go lulus. Akses tulis anonim tetap ditolak.
- [ ] Pantau penerbitan bias pada event nyata berikutnya; snapshot lama tidak dibuat ulang.
- [x] Kalender/konsensus mingguan gratis dengan metadata sumber pihak ketiga, pengelompokan empat event dan konversi timezone.
- [x] Panel utama tanpa input; formulir lama menjadi riset/koreksi opsional.
- [x] Konteks BLS diambil otomatis, dengan periode, satuan, cache, label revisi dan status data hilang.
- [x] Jadwal 07.00 WIB / T−5 jam / T−10 menit, cutoff T−5 menit, arsip per tahap dan penandaan laporan terlambat.
- [x] Kode Edge Function, migrasi tabel/RLS, lease, cache sumber dan SQL cron lima menit.
- [x] Tes logika waktu/data dan worker terisolasi tanpa menghubungi database nyata.
- [x] Backend diterapkan pada project silaakpxbykwoguiajdb: SQL 002–004, Vault/secret, Edge Function dan cron lima menit; invokasi pertama dan akses API terverifikasi.
- [x] Eksekusi cron tanpa invokasi manual terverifikasi: 11 November 23.55 WIB dan 12 November 08.25 WIB; kalender diambil ulang 12 November 08.10 WIB, enam seri BLS tersedia dan tidak ada error provider pada pemeriksaan tersebut.
- [x] Kalender resmi rapat Fed, pengecekan tanggal FOMC terhadap feed, dan rentang target DFEDTARL/DFEDTARU otomatis. Jam keputusan tetap dari feed, tidak ditebak dari tanggal rapat.
- [x] Snapshot terstruktur BLS/Fed sebelum cutoff; tetap kompatibel dengan laporan lama dan tidak ditulis ulang setelah rilis.
- [x] Arsip event lampau dan hasil: pernyataan resmi FOMC dipasangkan berdasarkan tanggal/jam, serta observasi periode baru BLS diberi label belum terverifikasi sebagai rilis pertama.
- [x] Migrasi 005 dan worker diperbarui. Cron 12 November 09.15 WIB memuat 56 tanggal rapat Fed, rentang suku bunga, dan enam seri BLS tanpa error provider.
- [x] Timeout pembacaan backend di aplikasi dan status sehat baru diterbitkan setelah semua penulisan hasil berhasil.
- [ ] Verifikasi kalender BLS, angka actual BLS rilis pertama, cakupan kalender selain FOMC di luar minggu berjalan, dan model arah XAUUSD yang tervalidasi.
- [ ] Pemeriksaan melalui Expo Go oleh pengguna. **Tidak menjalankan build.**

Panduan dan batas implementasi: [docs/AUTOMATIC-REPORTS.md](docs/AUTOMATIC-REPORTS.md).

## Sudah diimplementasikan
- [x] Fondasi Android Expo, form NFP, penyimpanan rencana WIB.
- [x] API BLS gratis: NFP, pengangguran, JOLTS, CPI, PPI, dan upah.
- [x] CSV FRED gratis: initial dan continuing claims dengan status terpisah.
- [x] Cache lokal, waktu pengambilan, validasi data, penanganan jaringan gagal.
- [x] Ringkasan deskriptif per indikator dan tautan sumber seri.
- [x] Catatan persiapan manual dengan salinan data dan konsensus yang tidak berubah.
- [x] Riwayat catatan lokal beserta detail alasan.
- [x] Pengujian perhitungan, data parsial, validasi cache dan batas waktu pencatatan.

## Berikutnya: data NFP dan model
- [x] Integrasi initial/continuing claims nasional yang disesuaikan musiman (ICSA/CCSA, U.S. ETA melalui CSV FRED).
- [x] Rata-rata claims 4 minggu berurutan, minggu sekitar tanggal 12, dan kegagalan per sumber.
- [x] Periksa akses ADP/ISM dan definisi employment (11 Nov 2026). Jalur unduhan otomatis belum terverifikasi.
- [x] Input manual ADP bulanan, ISM Manufacturing Employment, ISM Services Employment dengan satuan, periode, sumber resmi, dan waktu rilis.
- [x] Pemilihan versi yang diketahui sebelum cutoff, riwayat koreksi, serta integrasi snapshot dan backup.
- [x] ADP otomatis sebagai konteks melalui JSON publik resmi; periode dan arah angka diperiksa.
- [ ] ISM Employment/Prices otomatis: akses langsung sumber mendapat HTTP 403; tidak diisi tebakan.
- [x] Pertumbuhan bulanan upah per jam BLS CES0500000003.
- [ ] Core inflation dan indikator lain sesuai model.
- [x] Kalender dan konsensus mingguan otomatis dari feed pihak ketiga; verifikasi jadwal BLS resmi masih terbuka.
- [x] Input bulan target NFP, filter periode dan batas waktu pengambilan maksimal T−5 menit.
- [ ] Validasi waktu publikasi/revisi resmi per indikator (filter saat ini memakai waktu pengambilan perangkat).
- [ ] Simpan provenance rilis/revisi lengkap dan dataset historis point-in-time.
- [x] Dataset 57 angka NFP rilis pertama BLS (Jan 2022–Okt 2026); bulan kosong tidak diisi dengan revisi.
- [x] Model awal regresi rata-rata tiga rilis NFP, estimasi vs konsensus, penjelasan input dan koefisien.
- [x] Evaluasi kronologis: 12 prediksi 2024 dan 18 prediksi 2025–2026, dibanding rata-rata sederhana; laporan dapat direproduksi.
- [x] Arsip estimasi dan versi model dalam catatan T−5 jam sampai T−5 menit, termasuk backup Supabase; kompatibel dengan catatan lama.
- [ ] Pembaruan dataset rilis pertama otomatis dan timestamp publikasi resmi untuk pengujian per event.
- [x] Input hasil rilis BLS bertimestamp; versi baru memperbarui model bulan berikutnya tanpa mengubah snapshot lama.
- [x] Dataset riset JSON, validasi timestamp/satuan, impor/ekspor Android, serta backup kompatibel data lama.
- [x] Mesin ridge multivariabel dan evaluasi kronologis terhadap konsensus; belum tersedia dataset nyata untuk menguji performa.
- [x] Evaluasi bid/ask XAUUSD T−5 sampai T+1 setelah biaya tambahan, terpisah per broker/feed/simbol.
- [x] Impor CSV Exness langsung di Android (streaming, setelah ekstraksi ZIP); arsip indikatif dipisahkan dari server MT5 akun.
- [x] Input quote manual HFM/Exness dengan sumber, waktu dalam detik, serta validasi jendela entry/exit.
- [x] Skrip ekspor MT5 Windows opsional; pengguna saat ini hanya memakai Android.
- [ ] Model multivariabel ADP/ISM/claims/upah/pengangguran dengan dataset historis sebelum revisi.
- [ ] Validasi terhadap konsensus historis dan rilis mendatang; model awal belum konsisten mengalahkan baseline.
- [ ] Pemetaan bias fundamental XAUUSD beserta bukti performa T−5 sampai T+1.
- [ ] Status BUY/SELL/NETRAL dan alasan berdasarkan hasil model teruji.

## Model PPI awal
- [x] Panel terpisah untuk PPI final demand headline m/m SA, rencana WIB dan konsensus manual dalam persen.
- [x] Dataset 32 angka rilis pertama Januari 2024–September 2026 dengan URL arsip dan waktu publikasi per baris; Oktober 2025 dibiarkan kosong.
- [x] Regresi tiga rilis sebelumnya dengan cutoff publikasi per pasangan pelatihan, penjelasan input/koefisien dan selisih terhadap konsensus.
- [x] Evaluasi kronologis 14 prediksi: MAE 0,549 poin persentase vs rata-rata sederhana 0,538; model belum unggul.
- [x] Input tambahan/koreksi rilis pertama dengan waktu pencatatan, snapshot T−5 jam sampai T−5 menit, dan riwayat tetap.
- [x] Penyimpanan lokal, backup Supabase kompatibel data lama, validasi dan pemulihan restore terputus; tanpa SQL tambahan.
- [ ] Core dan komponen PPI/energi/ISM Prices dalam model dengan arsip data yang sesuai waktu.
- [x] Kalender, konsensus dan snapshot PPI otomatis melalui backend bersama.
- [ ] Hasil PPI rilis pertama terverifikasi dan pengingat otomatis; observasi BLS terbaru tersedia dengan label sementara.
- [ ] Evaluasi konsensus historis, catatan prospektif, dan arah XAUUSD HFM/Exness untuk PPI.
- [x] Kirim [build APK PPI de14f7e3](https://expo.dev/accounts/pahmii22/projects/aurum-fundamental/builds/de14f7e3-b13a-4144-a24c-bc64508edd43) ke EAS cloud dengan kuota gratis, 11 November 2026; build 49e03004 mendahului perubahan PPI.
- [ ] Tunggu hasil build PPI de14f7e3 dan uji instalasi, form, snapshot serta backup di HP Android.

Rincian data, hasil dan penggunaan: [docs/PPI-MODEL.md](docs/PPI-MODEL.md).

## Otomasi dan perluasan
- [x] Kode pengingat lokal T−5 jam, T−10 menit, T−5 menit, T+1 dan pembatalan jadwal lama.
- [ ] Uji pengiriman notifikasi pada Android, termasuk pembatasan baterai dan izin.
- [x] Fetch dan snapshot melalui backend pada pagi hari, T−5 jam dan T−10 menit, dengan cutoff T−5 menit.
- [x] Kode pencatatan harga XAUUSD indikatif (Swissquote) pada T−5 menit dan T+1 menit serta rekap bias vs harga di aplikasi. Rincian: [docs/AUTOMATIC-REPORTS.md](docs/AUTOMATIC-REPORTS.md).
- [x] Migrasi 008, function `price-ticks` dan cron per menit diterapkan 12 November 2026.
- [ ] Pantau pencatatan harga pada rilis nyata pertama (PPI 13 November 2026, 20.30 WIB).
- [x] Worker laporan: cron dua menit, lease dilepas setelah selesai, arsip tak terbaca dilewati; diterapkan dan heartbeat dua menit terverifikasi 12 November 2026.
- [x] Kode pengingat otomatis dari kalender untuk empat news: pagi 07.05 WIB, T−5 jam, T−15 menit.
- [ ] Izin alarm presisi (`SCHEDULE_EXACT_ALARM`) dan build APK baru agar pengingat tepat waktu.
- [ ] Aturan bias versi 2 setelah cukup rekap harga terkumpul; v1 tetap dipertahankan untuk arsip.
- [x] Backend Supabase menjalankan pembaruan saat aplikasi ditutup; cron lima menit telah diverifikasi.
- [x] Model awal PPI terpisah; belum menjadi sinyal trading.
- [ ] Model terpisah CPI dan FOMC.
- [ ] Pengujian rilis berjalan, arsip prediksi dan evaluasi.
- [ ] Uji HP Android, audit dependensi, build APK pribadi.
- [x] Konfigurasi EAS APK internal di cloud, dengan pemeriksaan paket/kuota gratis dan konfigurasi publik Supabase. Tidak menjalankan Gradle/emulator di laptop.
- [x] [Build cloud 49e03004](https://expo.dev/accounts/pahmii22/projects/aurum-fundamental/builds/49e03004-9aaf-40d2-a083-1565ced1d63f) selesai (FINISHED, 11 November 2026). APK tersedia; build ini belum memuat PPI. Instalasi/pengujian HP belum dilakukan.
- [x] Expo Doctor 20/20; audit dependency dilakukan (advisory moderate tooling masih perlu penyelesaian kompatibel SDK).

Catatan: model NFP tetap eksperimental. Dataset bisa ditambah manual dari hasil rilis resmi. Mesin riset multivariabel/arah emas tersedia, tetapi dataset indikator sebelum rilis dan harga HFM/Exness nyata belum diimpor serta diaudit. Pengingat lokal tidak menjalankan fetch di latar belakang. Format dan penghalang kesiapan: [docs/NFP-READINESS.md](docs/NFP-READINESS.md).

## Supabase — tahap pencadangan
- [x] Konfigurasi project melalui environment lokal dan client Supabase.
- [x] Form login/pendaftaran email-password serta sesi tersimpan.
- [x] SQL tabel cadangan dengan RLS per pemilik dan akses insert/read.
- [x] Kode pencadangan/pemulihan manual plan, cache, dan catatan.
- [x] Validasi isi backup dan pemulihan storage yang terputus.
- [x] Terapkan migrasi pada project Supabase (dikonfirmasi pengguna, 11 Nov 2026).
- [x] Verifikasi koneksi dan penolakan akses tabel tanpa login melalui API.
- [ ] Uji login, backup, restore, dan isolasi akun pada database nyata.
- [x] Tabel kalender, snapshot dan hasil ekonomi bersama, penjadwalan server dan sinkronisasi otomatis.
- [ ] Dataset indikator historis per versi rilis untuk validasi model.
