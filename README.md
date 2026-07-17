# CS EP1 — Transaksi Stok (Web)

Aplikasi web sesuai `Rancangan_Web_MySQL_MI_Proses_Line.md` (Dokumen B).

## Stack

- **Next.js 15** (App Router) + TypeScript + Tailwind
- **Prisma 5** + **SQLite** (default lokal; siap ganti MySQL)
- Auth JWT (cookie httpOnly)

## Fitur

| Halaman | Keterangan |
|---|---|
| `/login` | Login NIK + password |
| `/trx/ai` | Transaksi AI → WC02 (No SLIP, Part, Qty, To Loc, PIC) |
| `/trx/smt` | Transaksi SMT → WC02 |
| `/trx/mi` | Transaksi MI ke Line + cek stok |
| `/dashboard` | KPI stok, per line, low/negatif, IN vs OUT, top issue |
| `/admin` | Master part, stocktaking, export CSV, user |

Rumus stok: `stocktaking + Σ IN − Σ OUT`

## Cara pakai untuk pemula (Windows)

Cukup double-klik file `.bat` di folder `cs-ep1-web`:

| File | Kapan |
|---|---|
| **`INSTALL.bat`** | Setup pertama di PC server |
| **`START-SERVER.bat`** | Setiap kali mau memakai aplikasi |
| **`BUKA-BROWSER.bat`** | Buka halaman login |
| **`BUILD.bat`** | Setelah update kode |
| **`CARA-PAKAI.txt`** | Panduan singkat |

Detail langkah: lihat `CARA-PAKAI.txt`.

### Setup developer (manual)

```bash
cd cs-ep1-web
npm install
npm run db:setup
npm run dev
```

Buka http://localhost:3000

### Akses dari komputer klien (intranet)

Aplikasi dijalankan di **satu PC server** (atau VM). Klien hanya buka **browser** (Chrome), tidak perlu install Node.

1. Di PC server, pastikan Node.js terpasang, lalu:

```bash
cd cs-ep1-web
npm install
npm run db:setup
npm run build
npm run start:lan
```

`start:lan` mendengarkan semua interface di port **3000** (bukan hanya localhost).

2. Cek IP server di jaringan, contoh:

```bash
ipconfig
```

Misal IP = `192.168.10.25`.

3. Di **Windows Firewall** (PC server), izinkan inbound **TCP 3000** (atau nonaktifkan firewall sementara untuk uji).

4. Di komputer klien (satu LAN/Wi‑Fi dengan server), buka browser:

```
http://192.168.10.25:3000
```

5. Login dengan akun yang sudah dibuat (mis. `admin` / `admin123`).

**Tips produksi:**
- Pakai IP tetap (static) atau hostname, contoh shortcut desktop ke URL tersebut.
- Jangan pakai `npm run dev` untuk shift produksi — gunakan `build` + `start:lan`.
- Untuk MySQL bersama banyak user, ikuti bagian “Ganti ke MySQL” di bawah (SQLite cocok uji lokal, kurang ideal multi-klien berat).
- Opsional: pasang sebagai Windows Service (NSSM / pm2-windows) agar auto-start saat server reboot.

## Migrasi data lama (Excel/CSV → aplikasi)

### Sumber data lama

| Data | File lama | Tabel baru |
|---|---|---|
| Master Part ↔ Line | `00.Data_LINE.xlsx` | `mst_part`, `mst_line` |
| IN AI | `00.Data_Input R1/Data-AI yyyymm.csv` | `trx_mi_in` (source=AI) |
| IN SMT | `00.Data_Input R1/Data-SMT yyyymm.csv` | `trx_mi_in` (source=SMT) |
| OUT MI | `00.Data_Input R1/Data-MI yyyymm.csv` | `trx_mi_out` |
| Stocktaking | file WC02 / CSV Part No,QTY | `trx_stocktaking_bal` |

### Urutan migrasi (wajib)

1. **Backup** folder `00.Data_Input R1` + `00.Data_LINE.xlsx`
2. Setup DB aplikasi (jika belum):
   ```bash
   cd cs-ep1-web
   npm run db:setup
   ```
3. Jalankan impor legacy:
   ```bash
   npm run db:migrate-legacy
   ```
4. (Opsional) impor baseline stocktaking:
   ```bash
   # CSV header: Part No,QTY
   set MIGRATE_STOCK_CSV=D:\path\to\stocktaking.csv
   npm run db:migrate-legacy
   ```
5. Cek di web: Admin → Part, Dashboard, Transaksi AI/SMT/MI
6. **Parallel run** 1–2 minggu: Excel masih jalan, web dipakai uji
7. **Cutover**: operator pindah ke web; Excel hanya baca/arsip

### Perilaku skrip

- Part & Line dibuat/diupdate dari `Data_LINE`
- AI/SMT: skip jika `No Slip` sudah ada (unik per area)
- MI: skip duplikat kasar (Part + Qty + Timestamp sama)
- PIC di CSV (`3009999 - NAMA`) → user baru (password default `operator123`) — **ganti di Admin**
- Tanpa stocktaking, stok = 0 + IN − OUT (bisa negatif sampai baseline diimpor)

### Cutover checklist

- [ ] Jumlah part web ≈ Data_LINE  
- [ ] Sample No Slip AI/SMT muncul di `/trx/ai` & `/trx/smt`  
- [ ] Sample transaksi MI muncul di `/trx/mi`  
- [ ] Dashboard stok masuk akal setelah stocktaking  
- [ ] User/PIC sudah punya akun & role benar  
- [ ] Backup CSV terakhir sebelum matikan input Excel  

### Akun seed

| NIK | Password | Role / area |
|---|---|---|
| `admin` | `admin123` | ADMIN (semua) |
| `leader` | `operator123` | LEADER + dashboard |
| `3009999` | `operator123` | OPERATOR MI |
| `ai01` | `operator123` | OPERATOR AI |
| `smt01` | `operator123` | OPERATOR SMT |

## Ganti ke MySQL (produksi)

1. Jalankan `docker compose up -d` (atau MySQL sendiri)
2. Di `prisma/schema.prisma` ubah:

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

3. `.env`:

```
DATABASE_URL="mysql://epstok:epstok@localhost:3306/ep_stok_cs"
```

4. `npm run db:setup`

## Dokumen terkait

- `../Spesifikasi_Desain_MI_Proses_Line_Rev05.md` — AS-IS Excel
- `../Rancangan_Web_MySQL_MI_Proses_Line.md` — TO-BE desain
