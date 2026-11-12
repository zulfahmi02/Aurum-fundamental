# Laporan otomatis — status implementasi

Tidak menjalankan build APK/EAS. Pengguna memeriksa melalui Expo Go terlebih dahulu.

## Sudah dapat diperiksa di aplikasi

- Panel utama memuat kalender minggu berjalan untuk NFP, CPI, PPI, dan keputusan FOMC tanpa input jadwal/konsensus. Form lama dipindahkan ke bagian koreksi/riset opsional.
- Sumber kalender/konsensus: [feed JSON Forex Factory/Fair Economy](https://nfs.faireconomy.media/ff_calendar_thisweek.json). Akses nyata berhasil diperiksa 11 November 2026. Ini sumber pihak ketiga, bukan BLS/Fed; jadwal belum diverifikasi silang otomatis. Batas minggu berjalan ditampilkan, termasuk saat tidak ada event mendatang.
- Data BLS payroll, pengangguran, upah, CPI headline/core, dan PPI headline/core diambil otomatis sebagai konteks deskriptif. Data ini versi terbaru termasuk revisi, bukan data pelatihan rilis pertama. Data hilang/gagal tidak diganti dengan angka contoh.
- Bias BUY/SELL/NETRAL eksperimen kini tersedia berdasarkan aturan skenario yang dijelaskan di bawah. Model arah XAUUSD T−5 sampai T+1 yang tervalidasi tetap belum tersedia.
- Cache kalender dan konteks BLS memungkinkan pembacaan offline. Snapshot tahap sebelumnya tidak dihitung ulang. Cache lokal ini terpisah dari backup riset pribadi dan bisa dibangun ulang dari server/sumber.

## Penyempurnaan 12 November 2026

- Kalender rapat [Fed](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm) diambil otomatis maksimal sekali sehari. Tanggal akhir rapat dibandingkan dengan tanggal New York dari event FOMC. Ini verifikasi **tanggal**, bukan bukti jam keputusan. Agenda resmi berikutnya ditampilkan walaupun belum muncul di kalender mingguan. Rapat di luar jadwal atau format yang tidak dikenali tetap ditandai belum cocok.
- Rentang target [DFEDTARL](https://fred.stlouisfed.org/series/DFEDTARL) dan [DFEDTARU](https://fred.stlouisfed.org/series/DFEDTARU) diambil dari CSV FRED maksimal sekali empat jam. Periode menunjukkan tanggal berlakunya rentang kebijakan, bukan waktu publikasi pernyataan. Baris masa depan/missing/inverted/duplikat ditolak atau dilewati sesuai jenisnya. Perbedaan konsensus dari batas atas dijelaskan sebagai ekspektasi perubahan, bukan sinyal emas.
- Snapshot baru menyimpan objek data BLS/Fed dengan waktu pengambilan, selain alasan tertulis. Laporan lama tetap dibaca tanpa mengarang objek data yang dulu belum disimpan.
- Setelah rilis, worker memakai catatan **backend terakhir sebelum cutoff** sebagai referensi. Tabel `aurum_auto_outcomes` terpisah menyimpan hasil sekali saja; retry tidak mengubah catatan persiapan atau hasil lama.
- Untuk FOMC, worker mengambil pernyataan resmi `monetaryYYYYMMDDa.htm`. Tanggal artikel, timestamp publikasi EST/EDT, dan rentang numerik diperiksa. Perbedaan jam dari kalender atau format yang tidak dipahami menghasilkan status belum dipasangkan. Tidak dilakukan tebakan dari kata-kata hawkish/dovish.
- Untuk NFP/CPI/PPI, API BLS yang tersedia memuat angka terbaru termasuk revisi. Worker hanya mencatat **observasi setelah rilis** bila periode maju tepat satu bulan dari baseline sebelum rilis, masih sebelum bulan rilis, serta data diambil setelah rilis dalam jendela 72 jam. Revisi periode yang sama, lompatan beberapa bulan, baseline hilang, dan data sebelum cutoff tidak dipasangkan. Ini asosiasi konservatif terhadap jadwal pihak ketiga, **bukan sertifikasi actual rilis pertama**. Nilainya tidak dimasukkan ke dataset pelatihan rilis pertama atau dipakai untuk mengklaim akurasi sinyal.
- Observasi BLS tetap mempertahankan presisi perhitungan indeks; angka 0,35% tidak diam-diam diubah menjadi headline resmi 0,4%. Selisih terhadap konsensus diberi label selisih observasi, bukan ukuran profit atau akurasi arah emas.
- Arsip di aplikasi dapat dibuka untuk event yang sudah lewat, termasuk sesudah kalender berganti minggu. Tampilan dibatasi 100 laporan/hasil terbaru; database menyimpan riwayatnya.
- Permintaan Supabase pada aplikasi memiliki timeout 15 detik. Worker menulis heartbeat setelah semua penulisan laporan/hasil berhasil, sehingga kegagalan penyimpanan tidak menghasilkan status sehat baru.

Migrasi `202611120005_release_observations.sql` dan worker baru telah diterapkan. Siklus cron 12 November **09.15 WIB** berhasil memuat 56 tanggal rapat, rentang target efektif 11 November, dan enam seri BLS tanpa error provider. Parser pernyataan juga diuji terhadap dokumen Fed 28 Oktober 2026 yang diunduh nyata. Pemeriksaan itu tidak membuat hasil/event historis buatan di database; penulisan hasil pada rilis mendatang masih perlu dipantau.

Endpoint kalender minggu depan yang diperiksa mengembalikan HTTP 404. Kalender mingguan tidak diklaim mencakup seluruh event mendatang; agenda resmi FOMC adalah tambahan terpisah. BLS ICS masih HTTP 403. Konektor kalender resmi BLS dan actual rilis pertamanya belum selesai.

## Jadwal dan batas waktu

Pagi 07.00 WIB, T−5 jam, dan T−10 menit. Pemeriksaan terakhir sengaja dijadwalkan sebelum entry T−5 menit. Setelah T−5 menit tidak ada snapshot persiapan baru. Jam sumber ber-offset dikonversi ke UTC; WIB ditampilkan di aplikasi. FOMC pukul 01.00/02.00 WIB memakai laporan pagi hari sebelumnya.

Backend dipanggil tiap lima menit. Waktu target bukan jaminan eksekusi tepat detik: cold start, jaringan, dan provider dapat menunda. Setiap laporan menyimpan scheduledAt dan generatedAt yang sebenarnya. Jika worker/aplikasi baru mulai setelah tahap berikutnya, hanya tahap yang sedang berlaku dibuat; tidak mengarang laporan pagi yang terlewat.

Kalender diambil maksimal sekali sejam (jeda retry 15 menit); BLS maksimal sekali empat jam (retry sejam) per worker/perangkat. Snapshot menampilkan waktu data yang benar-benar digunakan. Snapshot baru tidak berarti semua provider diunduh ulang saat itu. Kalender >2 jam dan konteks BLS >6 jam ditandai lama.

## Backend yang sudah diterapkan

1. Migrasi [202611110002_automatic_reports.sql](../supabase/migrations/202611110002_automatic_reports.sql): kalender publik dan snapshot laporan, RLS read-only untuk aplikasi, serta lease worker. Tidak mengubah tabel backup pribadi.
2. Edge Function [auto-reports](../supabase/functions/auto-reports/index.ts): mengambil sumber dengan cache/throttle, menyusun laporan per event/tahap, menyimpan snapshot dengan `ignore-duplicates` agar retry tidak menulis ulang laporan lama.
3. Cron [automatic_reports.sql](../supabase/schedules/automatic_reports.sql): memanggil worker tiap lima menit memakai secret dari Vault. Fungsi hanya menerima POST dengan secret khusus; service-role key hanya digunakan pada server.

Pembaca aplikasi tidak perlu login untuk kalender/laporan ekonomi publik; mereka tidak memiliki izin menulis. Secret cron tidak boleh dimasukkan ke Expo atau `EXPO_PUBLIC_*`.

Backend diterapkan hanya ke project `silaakpxbykwoguiajdb` setelah akses akun yang benar terdeteksi. Migrasi 002–004 telah diterapkan dan fungsi `auto-reports` telah dideploy. Pengambilan kalender dan enam seri BLS berhasil diuji dari server. Kredensial dibuat di Vault, disinkronkan ke Edge Function tanpa dicetak/disimpan di repository, dan RPC bootstrap sementara sudah dihapus. Tidak ada deployment ke project lain atau build Android.

Eksekusi terjadwal tanpa invokasi manual terverifikasi pada 11 November 2026 pukul 23.55 WIB dan 12 November pukul 08.25 WIB. Pemeriksaan terakhir menunjukkan kalender diperbarui 08.10 WIB, enam seri BLS tersedia, dan tidak ada error provider. Ini membuktikan worker berjalan otomatis; penerbitan snapshot pada event nyata berikutnya tetap perlu dipantau. Pengambilan kalender resmi BLS ICS dari lingkungan ini masih mendapat HTTP 403 pada pemeriksaan 12 November; kalender pihak ketiga tetap diberi label, bukan diklaim sudah terverifikasi silang.

## Konfigurasi dan pemeliharaan

Project ini sudah dikonfigurasi. Langkah berikut hanya untuk pemasangan ulang atau project baru; jangan menjalankannya lagi pada tabel yang sudah ada:

1. Jalankan migrasi `202611110002_automatic_reports.sql` di SQL Editor project tujuan. Publishable key aplikasi tidak memiliki izin DDL.
2. Buat secret acak minimal 32 karakter di lingkungan lokal yang diabaikan git. Simpan sebagai `AURUM_CRON_SECRET` di Edge Function secrets dan sebagai `aurum_cron_secret` di Supabase Vault (nilai harus sama). Simpan `aurum_project_url = https://silaakpxbykwoguiajdb.supabase.co` di Vault.
3. Deploy hanya fungsi backend (bukan build Android):

```sh
supabase functions deploy auto-reports --project-ref silaakpxbykwoguiajdb
```

4. Jalankan `supabase/schedules/automatic_reports.sql` di SQL Editor. Script menolak jika Vault belum lengkap. Job bernama sama tidak membuat cron ganda.
5. Periksa function logs, `cron.job_run_details`, dan `aurum_auto_calendar.checked_at`. Pastikan dua pemanggilan tidak mengubah snapshot yang sama, lalu tutup aplikasi dan pastikan backend tetap memperbarui data.

Untuk deployment awal ini, migrasi 003 membuat secret di Vault dan RPC sementara khusus service-role. `scripts/configure-auto-worker.py` menyinkronkan secret serta melakukan deploy/invokasi pertama; migrasi 004 menghapus RPC tersebut dan memasang cron. Script bootstrap tersebut bukan perintah harian dan tidak bisa diulang setelah RPC dihapus. Untuk rotasi, kelola nilai Vault dan Edge Function secrets melalui akun admin. Penggunaan sehari-hari tidak meminta jadwal/konsensus manual.

## Pengujian

```sh
npm test
npm run test:worker
npm run lint
npm run typecheck
node scripts/check-automatic.mjs
npm start
```

Tes worker memakai fetch/database mock dengan jaringan dinonaktifkan. Tes mencakup auth, throttling, duplikasi, lease, kegagalan sumber/penyimpanan, data hasil yang terpisah, serta timestamp/DST/periode. Pemeriksaan API nyata terpisah memastikan pembacaan publik, penolakan insert anonim, penolakan invokasi worker tanpa secret, dan penghapusan RPC bootstrap. Bundle development Android untuk Expo Go berhasil dimuat dari Metro; pemeriksaan tampilan fisik HP belum dilakukan. Kalender resmi BLS, actual BLS rilis pertama, konsensus historis, model CPI/FOMC dan validasi arah emas masih harus diselesaikan.

## Bias eksperimen — fundamental-scenario-v1

Bias BUY/SELL/NETRAL sudah diimplementasikan untuk NFP, CPI, PPI dan FOMC. Ini **aturan skenario**, bukan model ML terlatih atau sinyal yang sudah terbukti menghasilkan profit. Tidak ada persentase confidence/akurasi buatan. Status `NO_SIGNAL` tetap dipakai jika syarat data gagal; `NEUTRAL` berarti data tersedia tetapi belum cukup searah.

| Event | Dasar aturan | Syarat arah |
| --- | --- | --- |
| NFP | Payroll, pengangguran, upah terakhir dari BLS diasumsikan berlanjut, dibanding konsensus masing-masing | Payroll harus searah; minimal dua komponen mendukung dan tidak ada yang berlawanan. Pengangguran dibaca terbalik. |
| CPI | Headline dan core m/m terakhir diasumsikan berlanjut, dibanding konsensus | Kedua komponen harus searah melewati ambang. CPI y/y tidak dihitung sebagai suara tambahan. |
| PPI | Final demand headline dan tanpa makanan/energi m/m terakhir diasumsikan berlanjut, dibanding konsensus | Kedua komponen harus searah melewati ambang. |
| FOMC | Konteks core CPI, payroll dan upah; bukan estimasi keputusan/rate surprise | Core CPI dan payroll harus searah, upah tidak boleh berlawanan; kalender Fed, rentang target, dan konsensus keputusan harus tersedia. |

Skenario persistensi memakai selisih **observasi BLS terakhir − konsensus**, bukan actual yang belum rilis. Observasi tersebut dapat mengandung revisi. Ambang perubahan 50 ribu pekerjaan untuk payroll dan 0,1 poin persentase untuk komponen persentase. Selisih yang lebih kecil dianggap netral. Headline dan core berkorelasi; dua suara tidak dianggap dua bukti independen. Ini baseline sederhana yang bisa salah secara sistematis, bukan nowcast multivariabel ADP/ISM/claims.

FOMC memakai batas heuristik: core CPI/upah ≤0,2% m/m mendukung konteks pelonggaran, ≥0,3% mendukung pengetatan; payroll ≤100K / ≥200K. Angka di tengah netral. **Batas ini pilihan aturan eksperimen, bukan ambang resmi Fed atau hasil kalibrasi.** Konsensus penurunan bunga saja tidak menghasilkan BUY. PCE, pricing futures, statement dan dot plot belum dimodelkan. Target inflasi resmi Fed adalah PCE, bukan CPI; lihat [penjelasan mandat dan transmisi kebijakan Fed](https://www.federalreserve.gov/monetarypolicy/monetary-policy-what-are-its-goals-how-does-it-work.htm). Pemetaan tekanan USD/suku bunga ke emas adalah hipotesis, bukan hubungan pasti; [World Gold Council](https://www.gold.org/goldhub/research/the-impact-of-monetary-policy-on-gold) menjelaskan banyak faktor dan perbedaan respons antar siklus. Sumber ini tidak memvalidasi ambang aturan maupun prediksi satu menit aplikasi.

Core PPI memakai `WPSFD49104`, final demand less foods and energy, seasonally adjusted; **bukan** less foods, energy and trade services. Definisi dan aturan awalan WPS ada di [daftar seri resmi BLS](https://www.bls.gov/ppi/fd-id/ppi-final-demand-intermediate-demand-aggregation-indexes-by-title-and-series-id.htm). Pengambilan API nyata 12 November 10.33 WIB berhasil mengembalikan ketujuh seri tanpa missing, termasuk core PPI September 2026.

Pengaman:

- Kalender maksimal berumur dua jam, konteks BLS enam jam, tidak boleh berasal dari waktu sesudah snapshot. Analisis hanya sampai T−5 menit.
- NFP/CPI/PPI mengasumsikan rilis bulan ini untuk bulan sebelumnya, sehingga baseline harus dua bulan sebelum bulan rilis. Jika periode tidak sesuai (termasuk jadwal tertunda), bias ditahan. Tidak menebak bulan target dari judul feed.
- Konteks FOMC maksimal tertinggal dua bulan; payroll dan upah harus satu periode. Kalender resmi maksimal 48 jam dan rentang target maksimal enam jam dengan tanggal efektif maksimal tiga hari sebelumnya.
- Semua komponen wajib ada, satuan/konsensus harus sesuai; alias payroll yang bertentangan ditolak. Nilai `previous` feed tidak dipakai sebagai angka skenario.
- Versi aturan, hasil, alasan dan penghalang disimpan bersama data input. Pembaca menghitung ulang dari snapshot untuk menolak bias/alasan yang tidak cocok. Versi v1 harus dipertahankan bila kelak ada v2 agar arsip tetap terbaca.
- Snapshot lama tanpa analisis tetap `NO_SIGNAL`, tidak diubah menjadi prediksi retrospektif. Snapshot tahap yang sudah terbit tidak diganti; pembaruan data masuk tahap berikutnya.
- Laporan lama tetap terlihat dengan waktu aslinya; setelah data kedaluwarsa atau cutoff lewat, tampilan membedakan arsip dari bias terkini.

Migrasi 006 memperluas constraint laporan untuk menerima bias eksperimen dengan penjelasan versi aturan, tanpa membuka izin tulis aplikasi. Pengujian mencakup empat event untuk BUY/SELL/NETRAL, konflik, data kurang, salah satuan/periode, timestamp masa depan, cutoff, perubahan snapshot, kompatibilitas arsip lama, serta penerbitan BUY melalui worker mock. Tes tersebut membuktikan perilaku kode, **bukan akurasi trading**.

Migrasi 006 dan worker telah diterapkan pada project tujuan tanggal 12 November 2026. Seluruh tes aplikasi, tiga tes worker, lint dan typecheck lulus. Bundle development Expo Go HTTP 200 dan pemeriksaan akses publik/penolakan tulis anonim lulus. Tidak menjalankan build APK. Cache lama enam seri akan diperbarui otomatis menjadi tujuh seri, dengan tetap menghormati jeda permintaan provider. Feed saat pemeriksaan memuat PPI 13 November 20.30 WIB; laporan paginya dijadwalkan 13 November 07.00 WIB. Belum ada bukti penerbitan bias untuk event nyata berikutnya; tidak menyisipkan snapshot uji ke database produksi.

Yang belum selesai untuk status model trading tervalidasi: dataset historis konsensus dan indikator sesuai waktu rilis, harga bid/ask HFM/Exness pada T−5 sampai T+1, evaluasi di luar data pelatihan dan pemantauan rilis nyata. Pengujian fisik Expo Go di HP juga belum dilakukan oleh pengembang.

## Perluasan konteks dan arsip versi

Laporan kini dapat menyimpan 16 seri pendukung otomatis dan sembilan seri BLS. Migrasi 007 menambahkan cache serta riwayat versi konteks publik. Rincian sumber, staleness, periode target ADP, batas cache perangkat, dan kekurangan yang belum selesai ada di [SUPPORTING-DATA.md](SUPPORTING-DATA.md). Aturan bias v1 tidak diberi bobot baru tanpa validasi; tambahan seri ditandai sebagai konteks.

## Pencatatan harga dan rekap bias — 12 November 2026

Kode sudah ditulis dan lulus tes lokal. **Belum diterapkan ke project Supabase**; sampai langkah di bawah dijalankan, tidak ada harga yang tercatat.

- Function baru `price-ticks` dipanggil cron **setiap menit**. Di luar T−5 menit dan T+1 menit sebuah event, function hanya membaca kalender lalu selesai. Pada kedua menit itu, function mengambil satu bid/ask XAU/USD dan menyimpannya ke `aurum_auto_prices` (migrasi 008). Cron lima menit `auto-reports` tidak diubah.
- Sumber: [quote publik Swissquote](https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD), platform `SwissquoteLtd`, profil spread `premium`, tanpa API key. Ini **harga indikatif, bukan server HFM/Exness dan bukan harga eksekusi**; spread dan pergerakannya dapat berbeda dari akun pengguna. Endpoint publik ini bukan kontrak API dengan jaminan stabilitas.
- Quote hanya diterima bila diambil dari 5 detik sebelum sampai 30 detik sesudah target, berumur maksimal 15 detik, bid ≤ ask, dan spread masuk akal. Waktu quote yang sebenarnya ikut disimpan. Quote pertama per event/leg tidak pernah ditimpa.
- Harga langsung **tidak bisa diambil ulang**. Jika menit target terlewat (sumber gagal, function lambat, pasar tutup), leg itu kosong selamanya dan event tidak dinilai. Tidak ada interpolasi atau pengisian belakangan.
- Aplikasi memasangkan kedua harga dengan **laporan backend terakhir sebelum T−5 menit**. Pratinjau buatan perangkat tidak dihitung. Rumus sama dengan mesin riset: BUY hipotetis = bid exit − ask entry; SELL hipotetis = bid entry − ask exit; USD per troy ounce, tanpa komisi/slippage/ukuran lot.
- "Searah" berarti harga tengah bergerak sesuai bias. Bias bisa searah tetapi tetap rugi hipotetis bila pergerakan lebih kecil dari spread; keduanya ditampilkan.
- Rekap menampilkan **jumlah** event, bukan persentase, serta pembanding selalu-BUY dan selalu-SELL pada event yang sama. Beberapa event belum cukup untuk menyimpulkan akurasi aturan v1.

Penerapan (sekali):

1. Jalankan `supabase/migrations/202611120008_price_ticks.sql` di SQL Editor.
2. `supabase functions deploy price-ticks --project-ref <ref> --use-api`. Secret `AURUM_CRON_SECRET` yang sudah ada dipakai bersama; `verify_jwt = false` sudah ada di `supabase/config.toml`.
3. Jalankan `supabase/schedules/price_ticks.sql` di SQL Editor.
4. `node scripts/check-automatic.mjs` memeriksa pembacaan publik tabel harga, penolakan tulis anonim, dan penolakan function tanpa secret.

Tes: `npm test` (parser, jendela waktu, validasi catatan, evaluasi, rekap) dan `npm run test:worker` (auth, idle, satu quote per leg, retry, quote basi ditolak). Parser juga dicoba terhadap respons Swissquote nyata 12 November 2026. Pencatatan pada rilis nyata belum pernah terjadi dan perlu dipantau pada event pertama setelah penerapan.

## Ketahanan worker laporan — 12 November 2026

Kode sudah ditulis dan lulus tes lokal. **Belum diterapkan**: perlu deploy ulang `auto-reports` dan menjalankan ulang `supabase/schedules/automatic_reports.sql`.

- Cron `aurum-auto-reports` menjadi setiap dua menit (sebelumnya lima). Tahap T−10 menit kini punya tiga kesempatan sebelum cutoff T−5 menit, bukan satu. Jadwal tahap dan ID laporan tidak berubah, sehingga arsip lama tetap terbaca. Permintaan ke penyedia data tetap dibatasi oleh timestamp tersimpan, bukan oleh frekuensi cron.
- Worker melepas lease setelah selesai, baik berhasil maupun gagal. Lease 180 detik tetap berlaku bila proses terhenti sebelum sempat melepas. Jika pelepasan gagal, worker hanya kembali ke perilaku lama (run berikutnya menunggu lease habis).
- Laporan arsip yang tidak lolos validasi dilewati dan dicatat di log function; sebelumnya satu baris seperti itu menggagalkan seluruh run. Baris arsipnya tidak diubah atau dihapus. Aplikasi juga melewati baris tersebut saat membaca dari server.

## Pengingat news otomatis — 12 November 2026

- Tombol **Aktifkan pengingat otomatis** di panel utama menjadwalkan notifikasi lokal pagi 07.05 WIB (lima menit setelah laporan pagi backend; untuk FOMC dini hari, pagi sebelumnya), T−5 jam, dan T−15 menit untuk setiap NFP, CPI, PPI, dan FOMC pada kalender otomatis. Terpisah dari pengingat rencana NFP manual (awalan ID dan channel berbeda); mengubah yang satu tidak menyentuh yang lain.
- Setiap aplikasi dibuka atau kalender berubah, jadwal dicocokkan ulang: pengingat untuk event yang bergeser/hilang dibatalkan, yang belum ada ditambahkan. ID stabil, jadi pencocokan berulang tidak menggandakan notifikasi.
- Pengingat **tidak memuat bias**: bias dibuat backend belakangan dan notifikasi lokal tidak bisa mengambilnya. Notifikasi hanya mengajak membuka aplikasi.
- Kalender hanya mencakup minggu berjalan. Jika aplikasi tidak dibuka sama sekali pada suatu minggu, news minggu itu tidak terjadwal.
- Pengiriman memakai mode `bestEffort`, sama seperti pengingat NFP. Android dapat menundanya beberapa menit; karena itu pengingat terakhir T−15 menit, bukan T−10. Pengiriman tepat waktu memerlukan izin `SCHEDULE_EXACT_ALARM` di `app.json` dan build APK baru; belum dilakukan.
- Tes mencakup jadwal, teks jam WIB, pergantian tanggal, dan pengingat yang sudah lewat. Bundle Android berhasil dibuat. **Pengiriman notifikasi di HP belum diuji.**
