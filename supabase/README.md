# Mengaktifkan Supabase

Konfigurasi aplikasi tersedia di `.env.local` (diabaikan Git). `.env.example` hanya berisi placeholder. Aplikasi menggunakan publishable/anon key dan Supabase Auth. Jangan masukkan secret/service_role key ke konfigurasi EXPO_PUBLIC.

## Langkah pada project Supabase

1. Buka **SQL Editor**, buat query baru, salin seluruh isi `migrations/202611110001_backups.sql` dan jalankan sekali.
2. Di aplikasi, pilih **Buat akun aplikasi**, isi email/password, konfirmasi email jika diminta, lalu masuk. Alternatif untuk aplikasi pribadi: buat user melalui **Authentication → Users**. Ini akun aplikasi, bukan akun dashboard.
3. Setelah akun pribadi tersedia, pendaftaran publik bisa dinonaktifkan melalui pengaturan Auth jika hanya akun tersebut yang akan digunakan.
4. Jalankan ulang Metro setelah perubahan `.env.local`: `npm start -- --clear`.
5. Pilih **Cadangkan data perangkat**, lalu **Lihat cadangan online**. Tombol pemulihan mengganti rencana, cache, input ADP/ISM, dan seluruh riwayat lokal setelah konfirmasi.

## Struktur dan batas

- `aurum_backups`: satu baris per cadangan dengan UUID dan waktu server, pemilik `auth.users`, serta payload JSON versi 1 (plan/cache/history/manual ADP-ISM).
- RLS membatasi SELECT/INSERT ke pemilik. Klien tidak diberi UPDATE/DELETE; isi cadangan lama tidak ditimpa.
- Maksimal payload 2 MB per cadangan. Daftar menampilkan 10 cadangan terbaru. Pengelolaan cadangan lama dilakukan lewat dashboard untuk sementara.
- Ini pencadangan/pemulihan manual, bukan sinkronisasi otomatis atau database indikator terstruktur.
- Data lokal tetap berada di HP saat sign-out. Tidak ada upload otomatis ketika akun diganti. Konfirmasi upload menyebut akun tujuan.
- Tanggal pengambilan di payload berasal dari jam HP; `created_at` adalah waktu server saat cadangan diterima, bukan bukti bahwa data tersedia sebelum rilis historis.
- Pemulihan menggunakan jurnal lokal: bila penyimpanan terputus, buka kembali aplikasi agar proses dilanjutkan sebelum data dibaca.

## Verifikasi setelah SQL diterapkan

- Login akun A, cadangkan, lihat daftar, tutup dan buka aplikasi.
- Login akun B: daftar harus kosong dan ID cadangan A tidak boleh dibaca/disisipkan atas nama A.
- Akses tanpa login tidak boleh membaca cadangan.
- Putuskan koneksi: backup gagal tanpa menghapus catatan lokal.
- Ubah data lokal, pulihkan cadangan A, periksa nilai dan detail catatan kembali sesuai cadangan.

Pengujian RLS, Auth dan operasi database pada project nyata memerlukan migrasi yang sudah diterapkan serta akun aplikasi. Unit test lokal tidak membuktikan RLS remote berjalan.

Pemeriksaan koneksi tanpa login: `npm run supabase:check`. Script tidak mengubah database atau menampilkan key. Status tabel menolak akses anonim belum membuktikan isolasi antar akun; tetap jalankan pemeriksaan akun A/B di atas.
