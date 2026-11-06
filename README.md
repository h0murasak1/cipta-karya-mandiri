# Sistem Manajemen Workshop CKM

Aplikasi internal untuk mengelola pekerjaan workshop CV Dua Putra Bersaudara / Cipta Karya Mandiri. Aplikasi web dibangun dengan React, TypeScript, dan Vite; autentikasi, database, penyimpanan foto, dan fungsi backend menggunakan Supabase.

**Aplikasi produksi:** <https://cipta-karya-mandiri.pages.dev/>

## Fitur

- Dashboard operasional dengan ringkasan proyek dan, untuk Owner/Admin, ringkasan keuangan.
- Pengelolaan pelanggan, proyek, progres pekerjaan, invoice, pembayaran, transaksi, dan laporan.
- Penugasan proyek ke staf Workshop serta unggah foto progres.
- Invoice publik yang dapat dibuka melalui tautan atau QR code.
- Pengelolaan akun Workshop oleh Owner/Admin.
- Pengaturan identitas perusahaan dan perubahan password.

## Hak akses

| Fitur | Owner | Admin | Workshop |
|---|---:|---:|---:|
| Dashboard | Ya | Ya | Ya, ringkasan proyek |
| Pelanggan dan data keuangan | Ya | Ya | Tidak |
| Membuat/mengelola proyek dan menugaskan staf | Ya | Ya | Tidak |
| Melihat proyek dan menambah progres | Ya | Ya | Ya, proyek yang ditugaskan |
| Melihat nilai kontrak/anggaran | Ya | Ya | Tidak |
| Laporan dan pengelolaan akun staf | Ya | Ya | Tidak |
| Pengaturan perusahaan | Ya | Ya | Tidak |
| Mengubah password sendiri | Ya | Ya | Ya |

Password akun minimal 8 karakter. Akun internal dibuat oleh Owner/Admin; pengguna tidak dapat mendaftar sendiri.

## Menjalankan aplikasi secara lokal

### Prasyarat

- Node.js `20.19+` atau `22.12+`.
- npm.
- Supabase CLI untuk menyiapkan database atau deploy Edge Functions.
- Project Supabase yang sudah dikonfigurasi.

### 1. Pasang dependensi

Dari folder `web`:

```sh
npm install
```

### 2. Atur koneksi Supabase

Salin `web/.env.example` menjadi `web/.env.local`, lalu isi URL project dan anon/publishable key dari Supabase:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-atau-publishable-key>
```

Jangan masukkan `service_role` key, password database, atau secret backend ke file `VITE_*` maupun ke frontend.

### 3. Siapkan database dan akun awal

Untuk project baru, gunakan Supabase CLI dari root repositori:

```sh
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

Migration akan membuat tabel, fungsi database, policy Row Level Security (RLS), serta bucket privat untuk foto proyek.

Buat pengguna pertama melalui **Supabase Dashboard → Authentication → Users**. Setelah itu, buka **SQL Editor**, cari UUID pengguna tersebut, dan jadikan Owner:

```sql
update public.profiles
set role = 'owner', is_active = true
where id = '<uuid-pengguna>';
```

Pengguna Auth baru selain Owner/Admin akan dibuat sebagai role Workshop secara default. Buat akun staf berikutnya dari menu **Pengguna** di aplikasi, bukan dengan memberikan service-role key ke pengguna.

### 4. Jalankan development server

Dari folder `web`:

```sh
npm run dev
```

Buka URL lokal yang ditampilkan Vite di terminal. Untuk menghentikan server tekan `Ctrl+C`.

### 5. Periksa build dan lint

Dari folder `web`:

```sh
npm run build
npm run lint
npm run preview
```

`build` menjalankan pemeriksaan TypeScript sebelum membuat hasil produksi di `web/dist`.

## Supabase Edge Functions

Direktori `supabase/functions` berisi:

- `manage-workshop-users`: membuat akun staf dan mereset password; hanya Owner/Admin terautentikasi yang diizinkan.
- `issue-invoice`: menerbitkan atau mengganti token invoice; hanya Owner/Admin yang diizinkan.
- `public-invoice`: memvalidasi token dan mengembalikan hanya data invoice yang disetujui untuk akses publik.

Atur URL situs publik untuk tautan invoice, kemudian deploy fungsi:

```sh
supabase secrets set PUBLIC_APP_URL=https://cipta-karya-mandiri.pages.dev
supabase functions deploy manage-workshop-users
supabase functions deploy issue-invoice
supabase functions deploy public-invoice
```

Supabase menyediakan URL, anon key, dan service-role key ke Edge Functions sebagai environment backend. Jangan menaruh service-role key di aplikasi web, repository, atau pesan. Konfigurasi `verify_jwt = false` hanya berlaku untuk `public-invoice`; fungsi tersebut tetap mewajibkan token invoice valid.

## Deployment web

Build aplikasi dibuat dari direktori `web`:

```sh
npm run build
```

Untuk Cloudflare Pages, gunakan konfigurasi:

- **Root directory:** `web`
- **Build command:** `npm run build`
- **Build output directory:** `dist`

Atur `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` sebagai environment variables deployment. Setelah mengubah variabel tersebut, jalankan deployment baru.

## Alur pemakaian

### Owner/Admin

1. Masuk dengan akun internal.
2. Tambahkan pelanggan di menu **Pelanggan**.
3. Buat proyek di menu **Proyek**; lengkapi nilai kontrak, target selesai, dan detail pekerjaan.
4. Atur staf yang mengerjakan proyek melalui aksi **Atur staf**.
5. Catat progres proyek. Untuk menambahkan bukti foto, pilih proyek lalu tambahkan progres dan foto.
6. Buat invoice dari menu **Invoice**, kemudian gunakan **Terbitkan QR** untuk membuat tautan/QR yang dapat dibagikan.
7. Catat pembayaran melalui menu **Pembayaran**. Pembayaran invoice akan dicatat bersama transaksi kas.
8. Catat arus kas non-invoice di menu **Transaksi**, lalu tinjau ringkasan di **Dashboard** dan **Laporan**.
9. Tambah akun Workshop atau reset password dari menu **Pengguna**.

### Staf Workshop

1. Masuk memakai email dan password yang diberikan Owner/Admin.
2. Dashboard menampilkan ringkasan proyek yang ditugaskan.
3. Buka **Proyek** untuk melihat detail pekerjaan dan memperbarui progres.
4. Nilai kontrak/anggaran dan menu keuangan tidak ditampilkan untuk role Workshop.
5. Ganti password sendiri melalui **Pengaturan**.

## Keamanan dan pemecahan masalah

- RLS Supabase membatasi akses data; jangan mengandalkan penyembunyian menu di browser sebagai satu-satunya kontrol akses.
- Jangan pernah commit `web/.env.local`, `service_role` key, password database, atau data pelanggan. File `.gitignore` mengabaikan secret dan cache lokal.
- Jika aplikasi menampilkan pesan konfigurasi Supabase, periksa nama variabel `VITE_*` dan lakukan restart Vite setelah mengubah `.env.local`.
- Jika staf tidak dapat melihat proyek, pastikan akun aktif dan sudah ditugaskan ke proyek oleh Owner/Admin.
- Jika tautan invoice publik gagal, periksa status invoice, token, konfigurasi `PUBLIC_APP_URL`, serta log Edge Function `public-invoice`.
- Perubahan database harus dibuat sebagai migration di `supabase/migrations` dan ditinjau sebelum diterapkan ke produksi.

## Struktur repositori

```text
supabase/
  config.toml
  functions/       # Supabase Edge Functions
  migrations/      # Skema, policy, dan perubahan database
web/
  public/          # Aset publik, termasuk logo dan favicon
  src/             # Aplikasi React/TypeScript
```
