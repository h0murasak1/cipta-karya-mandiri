# Sistem Manajemen Workshop

Aplikasi React/TypeScript untuk operasional Cipta Karya Mandiri, dengan Supabase sebagai backend.

## Menjalankan aplikasi

1. Pastikan project Supabase pengembangan sudah menyiapkan tabel dan policy dari schema yang disetujui.
2. Salin `.env.example` menjadi `.env.local`, lalu isi URL project dan anon/publishable key Supabase. Jangan pernah menaruh service-role key di frontend.
3. Dari folder `web`, jalankan:

   ```sh
   npm install
   npm run dev
   ```

4. Jalankan `npm run build` dan `npm run lint` untuk validasi lokal.

## Fungsi Supabase

Invoice publik dan penerbitan token memakai Edge Functions di folder `../supabase/functions`:

- `issue-invoice` memerlukan pengguna Owner/Admin yang terautentikasi. Fungsi menyimpan hash SHA-256 dan hanya mengembalikan token mentah sekali saat penerbitan.
- `public-invoice` menerima token mentah dan hanya mengembalikan kolom invoice yang disetujui untuk ditampilkan. JWT verification dinonaktifkan hanya untuk fungsi ini di `../supabase/config.toml`; validasi token tetap dilakukan di fungsi.
- Atur `PUBLIC_APP_URL` ke origin aplikasi publik sebelum deploy. Deploy kedua fungsi ke project Supabase yang sudah memakai schema kompatibel.

Contoh deploy menggunakan Supabase CLI yang sudah terpasang dan terhubung:

```sh
supabase secrets set PUBLIC_APP_URL=https://app.example.com
supabase functions deploy issue-invoice
supabase functions deploy public-invoice
```

Jangan deploy fungsi atau menjalankan SQL terhadap database produksi sebelum konfigurasi, schema, dan policy ditinjau serta disetujui.

## Batasan akses

- Role Workshop tidak mendapatkan menu keuangan dan hanya dapat melihat proyek sesuai Row Level Security/penugasan yang berlaku di database.
- Owner/Admin dapat menugaskan satu atau lebih staf Workshop aktif pada setiap proyek; daftar akun Workshop diatur sesuai policy RLS yang ada di proposal migration.
- Akun internal dibuat melalui backend tepercaya, bukan dari browser.
- Pembayaran invoice dicatat melalui RPC `record_invoice_payment` agar pembayaran dan transaksi kas terhubung secara atomik.
- Pengujian end-to-end memerlukan project Supabase development yang memiliki schema dan kredensial lokal; tidak ada kredensial yang disimpan di repository.
