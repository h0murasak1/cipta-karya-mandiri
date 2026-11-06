# Web application

Dokumentasi instalasi, konfigurasi Supabase, hak akses, deployment, dan panduan pemakaian tersedia di [README utama](../README.md).

## Development

1. Pastikan Node.js `20.19+` atau `22.12+` tersedia.
2. Salin `.env.example` sebagai `.env.local` dan isi `VITE_SUPABASE_URL` serta `VITE_SUPABASE_ANON_KEY`.
3. Jalankan:

   ```sh
   npm install
   npm run dev
   ```

4. Validasi perubahan dengan `npm run build` dan `npm run lint`.

Jangan simpan service-role key atau secret backend dalam variabel `VITE_*`; variabel tersebut dikirim ke browser.
