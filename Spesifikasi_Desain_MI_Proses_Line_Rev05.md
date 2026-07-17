# Spesifikasi Desain Aplikasi — CS EP1 Transaksi Stok  
## Dokumen A · AS-IS (Excel)

| Atribut | Nilai |
|---|---|
| **Peran dokumen** | Spesifikasi sistem **saat ini** (Excel) |
| **Dokumen pasangan** | [`Rancangan_Web_MySQL_MI_Proses_Line.md`](./Rancangan_Web_MySQL_MI_Proses_Line.md) · TO-BE (Web + MySQL) |
| **Versi paket sinkron** | **1.0** — 2026-07-17 |
| Cakupan as-is | `MI_Proses Line Rev.05.xlsm` + `AI_Transaksi Ke WC02.xlsm` + `SMT_Transaksi Ke WC02.xlsm` |
| Domain | Transaksi CS EP1 — IN (AI/SMT→WC02) & OUT (MI→Line) |
| Platform as-is | Microsoft Excel (`.xlsm`) + Power Query + VBA + CSV |
| Pembuat workbook MI | LUKMANUL ARIFIN |
| Workbook MI dibuat / diubah | 2025-12-16 / 2026-07-15 |

> **Sinkronisasi:** Aturan bisnis, rumus stok, field form, dan skema CSV di dokumen ini adalah **sumber kebenaran as-is**. Dokumen B (Rancangan Web) wajib memetakan 1:1 ke perilaku ini, kecuali fitur yang ditandai *(baru di web)*.

---

## 0. Matriks sinkron Dokumen A ↔ B

| Topik | Dokumen A (as-is) | Dokumen B (to-be) | Status |
|---|---|---|---|
| Rumus stok | §1, §6.3 | §1 | Sinkron |
| Form MI (Part, Qty, Line, PIC) | §5 | §7.4 | Sinkron |
| Form AI / SMT (No SLIP, To Loc, …) | **§5B** | §7.0–7.3 | Sinkron |
| CSV AI/SMT/MI | §7 | §4 `trx_mi_*` | Sinkron (mapping) |
| Dashboard stok | Tidak ada | §7.1 | Baru di B |
| Login / role / Admin | Tidak ada | §7.6–7.8 | Baru di B |
| Stack | Excel | Next/Nest + MySQL | Beda platform |

---

## 1. Ringkasan produk

Aplikasi operator shop-floor CS EP1 untuk mencatat **stok WIP**:

| Aplikasi Excel | Arah | Output |
|---|---|---|
| `AI_Transaksi Ke WC02.xlsm` | IN Auto Insert → WC02 | `Data-AI yyyymm.csv` |
| `SMT_Transaksi Ke WC02.xlsm` | IN SMT → WC02 | `Data-SMT yyyymm.csv` |
| `MI_Proses Line Rev.05.xlsm` | OUT MI → Line | `Data-MI yyyymm.csv` |
| `00.Data_LINE.xlsx` | Master Part ↔ Line | dikonsumsi Power Query |
| Folder `00.Data_Input R1\` | Penyimpanan CSV | dibaca semua workbook |

**Rumus stok (berlaku as-is & to-be):**

```
Total_Stock = Stocktaking.QTY + Accumulasi_IN − Accumulasi_OUT
```

Detail teknis MI (sheet, VBA, PQ) ada di pasal berikutnya. Detail form AI/SMT ada di **§5B**. Target web: lihat dokumen B.

---

## 2. Tujuan & ruang lingkup

### 2.1 Tujuan
- Mencatat qty keluar WIP ke line secara cepat (scan barcode Part No).
- Mencegah over-issue (Qty Out tidak boleh > Stok WIP).
- Menyimpan jejak transaksi ke CSV yang bisa diaudit.
- Menampilkan riwayat transaksi OUT hari ini / filter Part No & tanggal.
- Menjaga stok WIP tetap update via auto-refresh Power Query.

### 2.2 Dalam ruang lingkup
- Form input transaksi OUT (sheet `out`)
- Master/cache stok (sheet `data`)
- Simpan / Undo / Clear form
- Auto & manual refresh query
- Filter tampilan transaksi

### 2.3 Di luar ruang lingkup dokumen A (as-is)
- Transaksi IN **diimplementasi** di workbook AI/SMT (spesifikasi formnya ada di §5B; bukan di sheet MI)
- Stocktaking fisik (hanya dikonsumsi sebagai sumber)
- Approval workflow / autentikasi login terpusat
- Database relational / aplikasi web → **lihat Dokumen B**
- Dashboard agregat stok → **lihat Dokumen B §7.1**

---

## 3. Pengguna & peran

| Peran | Aktivitas utama |
|---|---|
| Operator Line / CS | Scan Part No, input Qty Out & PIC, Simpan |
| Leader / PIC | Cek tampilan transaksi hari ini, Undo jika salah input |
| Staff Control / Admin data | Kelola `00.Data_LINE.xlsx`, folder stocktaking, folder CSV |
| IT / Maintainer | Ubah path UNC, password sheet, interval refresh, query M |

---

## 4. Arsitektur sistem

```
┌──────────────────────────────────────────────────────────────────┐
│                    MI_Proses Line Rev.05.xlsm                    │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────────────────┐  │
│  │ Sheet: out  │   │ Sheet: data  │   │ VBA                    │  │
│  │ (UI input + │◄──│ (hasil PQ)   │◄──│ ModMain                │  │
│  │  FILTER)    │   │ Stock_MI     │   │ ModAutoRefresh         │  │
│  │             │   │ Transaksi_OUT│   │ ThisWorkbook / Sheet1  │  │
│  └──────┬──────┘   │ Update_Trans │   └───────────┬───────────┘  │
│         │          │ Tampilan     │               │              │
│         │          └──────▲───────┘               │              │
│         │                 │ Power Query (M)       │ append CSV   │
└─────────┼─────────────────┼───────────────────────┼──────────────┘
          │                 │                       │
          ▼                 ▼                       ▼
   Operator Excel    File Server UNC paths    Data-MI yyyymm.csv
                     (Folder.Files /          di 00.Data_Input R1
                      Excel.Workbook)
```

### 4.1 Komponen teknis

| Lapisan | Teknologi | Fungsi |
|---|---|---|
| Presentasi | Sheet `out` + ActiveX/Form Button | Form transaksi & grid FILTER |
| Logika UI | VBA `Sheet1` (Worksheet_Change) | Lookup Part No, validasi Qty real-time |
| Logika bisnis | VBA `ModMain` | Simpan/Undo/Clear/validasi/cache |
| Orkestrasi refresh | VBA `ModAutoRefresh` | Refresh query berkala & sinkron |
| Transformasi data | Power Query (M) | Gabung stocktaking + IN + OUT → stok |
| Persistensi transaksi | CSV bulanan | Append-only log transaksi MI |
| Master line | `00.Data_LINE.xlsx` tabel `CS_SMT` | Part No, Part Name, Nama Team |

### 4.2 Modul VBA

| Modul | Tanggung jawab |
|---|---|
| `ThisWorkbook` | `Workbook_Open`: pastikan CSV header, load cache, setup UI, start auto-refresh. `BeforeClose`: stop OnTime. `SheetActivate`: setup/reset UI |
| `Sheet1` (`out`) | `Change` pada C12 → lookup master; pada C15 → validasi qty vs stok; fokus ke PIC |
| `Sheet2` (`data`) | Sheet data (tanpa logika UI utama) |
| `ModMain` | Konfigurasi path/password, CSV I/O, validasi form, simpan, undo, clear, refresh sync, UI protect |
| `ModAutoRefresh` | Daftar query refresh, interval, OnTime scheduler, engine refresh sinkron |

---

## 5. Struktur workbook

### 5.1 Sheet `out` — UI operator

Judul area: **Data Stok WIP Siap Insert** (merge A1:N10).  
Freeze pane di baris 23. Gridlines & zeros disembunyikan. Zoom ~120%.

#### Form input (kolom B–C)

| Cell | Label | Sifat | Keterangan |
|---|---|---|---|
| C12 | Part No. | Input (scan) | Trigger lookup master |
| C13 | Part Name | Auto-fill (locked) | Dari cache `data!A:D` |
| C14 | Stok WIP | Auto-fill (locked) | = `Total_Stock` master |
| C15 | Qty Out | Input | Validasi angka & ≤ stok |
| C16 | Line | Auto-fill (locked) | = `Nama Team` (LINE 1..7 / LINE MIC) |
| C17 | PIC | Input | Dipertahankan setelah simpan |
| E12 | Short By (Part No filter) | Input filter | Filter grid transaksi |
| F12 | Tanggal filter | Formula `=TODAY()` / tombol | Filter grid transaksi |

Cell yang boleh dipilih saat UI terkunci: `C12, C15, C17, E12, F12`.

#### Tombol aksi

| Label UI | Macro terhubung | Fungsi aktual |
|---|---|---|
| `<` | `ResetSheetInUI` | Lepas proteksi / reset mode UI |
| `>` | `SetupSheetInUI` | Aktifkan proteksi UI (hanya cell input) |
| **Undo** | `UndoLastCsvRecord` | Hapus 1 baris terakhir di CSV bulan ini |
| **Refresh** | `ClearForm` | Bersihkan form C12:C16 *(label ≠ nama macro)* |
| **Simpan** | `SimpanDataCsv` | Validasi + append CSV + refresh query |
| **Hari ini** | `SetTodayToF12` | Set F12 = hari ini |

> Catatan desain: tombol berlabel "Refresh" memanggil `ClearForm`. Refresh master data sesungguhnya dilakukan otomatis setelah Simpan/Undo dan oleh `ModAutoRefresh`.

#### Area tampilan transaksi (dari baris 23)

Header B23:F23 — Tanggal | Part No | Part Name | Qty OUT | Input PIC  

Judul dinamis B21: `"Data Transaksi OUT " & TEXT(F12,"dd-mmm-yyy")`

Grid B24/C24/E24/F24 memakai formula `FILTER` terhadap `data!J:P` (tabel `Transaksi_OUT`), dengan filter:
- E12 & F12 kosong → tidak tampil
- Hanya E12 → `SEARCH(E12, Part No)`
- Hanya F12 → `SEARCH(F12, Tanggal)`
- Keduanya → Part No match **dan** Tanggal = F12

Area H24 mem-filter `data!T:Y` (`Update_Transaksi` = IN dari AI/SMT) dengan logika serupa.

---

## 5B. Spesifikasi as-is — AI & SMT (`AI_Transaksi` / `SMT_Transaksi`)

> Dipindahkan ke dokumen A agar sinkron dengan Dokumen B §7.0–7.3.  
> File `~$SMT_...` adalah lock file Excel, **bukan** sumber spesifikasi.

Tidak ada menu pembagi AI|SMT di dalam MI. Pemisahan = **file Excel terpisah**.

| Elemen | AI | SMT |
|---|---|---|
| File | `AI_Transaksi Ke WC02.xlsm` | `SMT_Transaksi Ke WC02.xlsm` |
| Judul sheet `in` | TRANSAKSI PCB AUTO INSERT TO WC02 | TRANSAKSI PCB SMT TO WC02 |
| CSV | `Data-AI yyyymm.csv` | `Data-SMT yyyymm.csv` |
| UserForm | `ShowForm` | `ShowForm01` |
| Label lokasi | To Location | To Loc |

### 5B.1 Field input (B11:H11 / UserForm) — AI & SMT identik

| # | Field | Wajib | Perilaku |
|---|---|---|---|
| 1 | No SLIP | Ya | Scan; cek duplikat di CSV; Enter dapat langsung Simpan |
| 2 | Part No | Ya | Lookup master |
| 3 | Part Name | Auto | Dari Part No |
| 4 | Qty OUT (Slip Qty) | Ya | Angka, boleh desimal |
| 5 | To Location / To Loc | Ya | Umumnya `WC02` |
| 6 | Catatan | Tidak | Bebas |
| 7 | Input PIC | Ya | Tidak di-clear setelah simpan |

### 5B.2 Tombol

SIMPAN · hapus 1 data terakhir · ClearFORM · Hari ini · Create CS (opsional)

### 5B.3 Kolom CSV AI & SMT

```
No Slip, Part No, Part Name, Slip Qty, To Location, PIC, Catatan, Timestamp
```

### 5B.4 Validasi

| Aturan | Keterangan |
|---|---|
| No Slip wajib & unik per file CSV area | Tolak duplikat |
| Part No terdaftar di master | Tolak jika tidak ada |
| Qty angka | Boleh desimal |
| To Loc wajib | Harus dipilih |

### 5B.5 Mapping ke web (Dokumen B)

| As-is | To-be |
|---|---|
| `AI_Transaksi Ke WC02.xlsm` | `/trx/ai` · `trx_mi_in.source=AI` |
| `SMT_Transaksi Ke WC02.xlsm` | `/trx/smt` · `trx_mi_in.source=SMT` |
| `MI_Proses Line Rev.05.xlsm` | `/trx/mi` · `trx_mi_out` |

---

### 5.2 Sheet `data` — hasil Power Query

| Range / Table | Query sumber | Kolom |
|---|---|---|
| `A1:D*` → **Stock_MI** | `Stock_MI` | Part No, Part Name, Total_Stock, Nama Team |
| `J1:P*` → **Transaksi_OUT** | `Transaksi_OUT` | Timestamp, Part No, Part Name, Qty Out, Line, PIC, Tanggal |
| `T1:Y*` → **Update_Transaksi** | `Update Transaksi` | Timestamp, Dari, Part No, Part Name, Slip Qty, Timestamp-Copy |
| `AB1:AF*` → **Tampilan** | `Tampilan` | Part No, Part Name, Timestamp, Sum_IN, Sum_OUT |

Beberapa connection juga punya `interval = 5` (menit) di level workbook connection.

---

## 6. Alur proses bisnis

### 6.1 Alur utama — Simpan transaksi OUT

```
1. Operator buka workbook
      └─ Workbook_Open
           ├─ EnsureCsvHeader (buat Data-MI yyyymm.csv jika belum ada)
           ├─ LoadMasterData (Dictionary Part No → Name, Stok, Line)
           ├─ SetTodayToF12 / SetupSheetInUI
           └─ StartAutoRefreshQueries

2. Scan / ketik Part No di C12
      └─ Worksheet_Change
           ├─ FillLookupByPartNo → isi C13, C14, C16
           └─ Fokus ke C15 (Qty Out)

3. Input Qty Out di C15
      └─ Validasi:
           ├─ Harus angka (dukung 10 / 10,5 / 10.5)
           ├─ Harus > 0
           ├─ Stok WIP harus valid
           └─ Qty ≤ Stok WIP
         Fokus ke C17 (PIC)

4. Input / pastikan PIC di C17

5. Klik Simpan
      └─ SimpanDataCsv
           ├─ ValidateForm (Part No, Name, Qty, Stok, PIC)
           ├─ Append baris ke CSV:
           │    Timestamp, Part No, Part Name, Stok WIP, Qty Out, Line, PIC
           ├─ UpdateCacheAfterSave (kurangi stok di Dictionary)
           ├─ RefreshMasterDataSync (refresh query terpilih + reload cache)
           └─ Clear C12:C16 (PIC C17 tetap)
```

### 6.2 Alur Undo

```
1. Klik Undo
2. Baca CSV bulan berjalan
3. Preview baris terakhir (Timestamp, Part No, Name, Stok, Qty, Line, PIC)
4. Konfirmasi Yes/No
5. Tulis ulang file tanpa baris terakhir (header tetap)
6. Refresh query + reload master + clear form C12:C17
```

### 6.3 Rumus stok

```
Total_Stock = STOCK.QTY (stocktaking WC02 terbaru)
            + ACC.Sum_IN  (Σ Slip Qty dari CSV AI + SMT bulan ini)
            − ACC.Sum_OUT (Σ Qty Out dari CSV MI bulan ini)
```

Master Part berasal dari `DATA_LINE` (left join ke stocktaking & akumulasi).

---

## 7. Spesifikasi data

### 7.1 File CSV keluaran MI

| Properti | Nilai |
|---|---|
| Folder | `\\ymma-filesvr01\02_PROD_Dept\06_EP1\PUBLIC\00000. EP1&EP2\08. Transaksi CS EP1\00.Data_Input R1\` |
| Nama file | `Data-MI yyyymm.csv` (contoh: `Data-MI 202607.csv`) |
| Encoding tulis | Text CSV quoted (`"a","b",...`) |
| Mode | Append; buat baru + header jika belum ada |

| # | Kolom | Tipe | Contoh |
|---|---|---|---|
| 1 | Timestamp | datetime `yyyy-mm-dd hh:nn:ss` | 2026-07-13 15:59:00 |
| 2 | Part No | text | WF4623E |
| 3 | Part Name | text | PCB ASSY 88L YMMA 88L AVK |
| 4 | Stok WIP | number | 200.333 |
| 5 | Qty Out | number (boleh desimal) | 32.66 |
| 6 | Line | text | LINE 1 |
| 7 | PIC | text | 3009999 - DIAN WAHYUNI |

### 7.2 CSV sumber IN (AI / SMT) — dikonsumsi query

Filter nama file mengandung `"AI"` atau `"SMT"`, hanya file **bulan berjalan**.  
Kolom yang dipakai query: Timestamp, Part No, Part Name, Slip Qty, serta label `Dari` dari nama file.

### 7.3 Master DATA_LINE

| Properti | Nilai |
|---|---|
| Path | `\\ymma-filesvr01\...\08. Transaksi CS EP1\00.Data_LINE.xlsx` |
| Objek | Table `CS_SMT` |
| Kolom dipakai | Part No, Part Name, Nama Team |

### 7.4 Stocktaking

| Properti | Nilai |
|---|---|
| Folder | `\\ymma-filesvr01\02_PROD_Dept\07_EP2\PUBLIC\03. STAFF CONTROL\00. OTHERS\STOCKTAKING\2026` |
| Filter | Ext `.xlsx`, nama mengandung `single`/`SINGLE`/`Single`, dan `01. WC02 ` atau `02. WC02` |
| Seleksi | File terbaru (`Date created` desc, FirstN=1) |
| Kolom dipakai | No Part, QTY (+ deskripsi/keterangan di pipeline) |

### 7.5 Entitas logis

```
Part (master)
  Part No PK
  Part Name
  Nama Team / Line
  Total_Stock (computed)

TransaksiOUT
  Timestamp
  Part No FK
  Part Name
  Stok WIP (snapshot saat input)
  Qty Out
  Line
  PIC

TransaksiIN (dari AI/SMT)
  Timestamp
  Dari {AI|SMT}
  Part No FK
  Part Name
  Slip Qty
```

---

## 8. Power Query — katalog & dependency

### 8.1 Query inti (load ke sheet)

| Query | Load ke | Refresh otomatis (VBA list) |
|---|---|---|
| `Stock_MI` | Table Stock_MI | Ya |
| `Transaksi_OUT` | Table Transaksi_OUT | Ya |
| `Update Transaksi` | Table Update_Transaksi | Ya |
| `Tampilan` | Table Tampilan | Ya |
| `Accumulasi_IN` | (dipakai join) | Ya |
| `Accumulasi_OUT` | (dipakai join) | Ya |

### 8.2 Query pendukung

| Query | Peran |
|---|---|
| `DATA_LINE` | Baca master Excel |
| `Stocktaking` | Baca file stocktaking WC02 terbaru |
| `Transaksi_IN` | Detail IN bulan ini |
| `Today_IN` / `Today_OUT` | Agregasi harian → digabung di `Tampilan` |
| `Transform File` / `(2)` | Fungsi transform xlsx / csv |
| `Sample File` / `Parameter*` | Parameter helper folder combine |

### 8.3 Dependency graph

```
DATA_LINE ────────┐
Stocktaking ──────┼──► Stock_MI
Accumulasi_IN ────┤         ▲
Accumulasi_OUT ───┘         │
       ▲                    │
       │                    │
Transaksi_OUT ──► Accumulasi_OUT
CSV AI/SMT    ──► Accumulasi_IN / Transaksi_IN / Update Transaksi / Today_IN
Transaksi_OUT ──► Today_OUT ──┐
Today_IN ─────────────────────┴──► Tampilan (filter hari ini)
```

### 8.4 Daftar refresh VBA (`ModAutoRefresh`)

Query yang di-refresh bersama (auto & setelah simpan):
1. `Query - Update Transaksi`
2. `Query - Transaksi_OUT`
3. `Query - Tampilan`
4. `Query - Accumulasi_IN`
5. `Query - Accumulasi_OUT`
6. `Query - Stock_MI`

Interval auto-refresh: dikonfigurasi di `REFRESH_INTERVAL_MINUTES` (modul `ModAutoRefresh`); connection workbook juga menyetel `interval=5` pada beberapa query.

---

## 9. Aturan bisnis & validasi

| ID | Aturan | Pesan / perilaku |
|---|---|---|
| BR-01 | Part No (C12) wajib | "Part No (C12) wajib diisi." |
| BR-02 | Part harus ada di master cache | "Part Name (C13) kosong / tidak ditemukan." |
| BR-03 | Qty Out wajib angka (`.` atau `,`) | "Qty Out harus berupa angka..." |
| BR-04 | Qty Out > 0 | "Qty Out harus lebih besar dari 0." |
| BR-05 | Qty Out ≤ Stok WIP | Tampilkan Stok vs Input |
| BR-06 | Stok WIP harus numerik valid | Blok simpan / change C15 |
| BR-07 | PIC (C17) wajib | "PIC (C17) wajib diisi." |
| BR-08 | PIC tidak di-clear setelah simpan | Mempercepat transaksi beruntun |
| BR-09 | Setelah simpan, cache stok dikurangi Qty | Tanpa menunggu PQ selesai penuh |
| BR-10 | Undo hanya baris terakhir CSV bulan ini | Preview + konfirmasi |
| BR-11 | Duplicate Part No di CSV bulan ini | Tersedia di kode, **nonaktif** secara default |
| BR-12 | Stok dihitung dari stocktaking + IN − OUT | Formula `Stock_MI` |

---

## 10. Spesifikasi antarmuka (UI/UX)

### 10.1 Prinsip
- Mode **kiosk-like**: sheet diproteksi, hanya cell input yang selectable.
- Alur fokus: **Part No → Qty Out → PIC → Simpan**.
- Feedback via `MsgBox` (Critical / Exclamation / Information / Question).
- Status bar menampilkan `"Refreshing Power Query..."` saat refresh.

### 10.2 Proteksi sheet
- Password sheet: konstanta `PWD_SHEET` di `ModMain` (boleh diganti maintainer).
- `UserInterfaceOnly := True` agar VBA tetap bisa menulis cell terkunci.
- Tombol `>` mengaktifkan mode operator; `<` melepaskan restriksi.

### 10.3 Wireframe logis sheet `out`

```
┌─────────────────────────────────────────────────────────────┐
│  Data Stok WIP Siap Insert                                  │
├──────────────┬──────────────────┬───────────┬───────────────┤
│ Part No.     │ [C12 scan     ]  │ Short By: │ [E12]  [F12]  │
│ Part Name    │ (auto)           │           │ [Hari ini]    │
│ Stok WIP     │ (auto)           │           │               │
│ Qty Out      │ [C15          ]  │           │               │
│ Line         │ (auto)           │           │               │
│ PIC          │ [C17          ]  │           │               │
├──────────────┴──────────────────┴───────────┴───────────────┤
│  [<] [>]  [Undo]  [Refresh/Clear]  [Simpan]                 │
├─────────────────────────────────────────────────────────────┤
│  Data Transaksi OUT <tanggal>                               │
│  Tanggal | Part No | Part Name | Qty OUT | Input PIC        │
│  (hasil FILTER dinamis)                                     │
│  + panel Update Transaksi (IN) di kolom H...                │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. Event & API internal VBA

### 11.1 Lifecycle

| Event | Aksi |
|---|---|
| `Workbook_Open` | Ensure CSV, LoadMasterData, SetToday, Setup UI, StartAutoRefresh |
| `Workbook_BeforeClose` | StopAutoRefresh (batalkan OnTime) |
| `Workbook_SheetActivate` | Jika sheet `out` → Setup UI; else Reset |
| `Worksheet_Change` (C12/C15) | Lookup / validasi qty |
| `Worksheet_Activate/Deactivate` | Setup / reset UI |

### 11.2 Prosedur publik utama

| Prosedur | Dipanggil dari |
|---|---|
| `SimpanDataCsv` | Tombol Simpan |
| `UndoLastCsvRecord` | Tombol Undo |
| `ClearForm` | Tombol Refresh (label) |
| `SetupSheetInUI` / `ResetSheetInUI` | Tombol `>` / `<` |
| `SetTodayToF12` | Tombol Hari ini |
| `RefreshMasterData` / `RefreshMasterDataSync` | Manual / setelah simpan |
| `StartAutoRefreshQueries` / `StopAutoRefreshQueries` | Open / Close |
| `RefreshSelectedQueriesNow` | Engine refresh tanpa reschedule |

### 11.3 Cache in-memory

```
gDataDict : Scripting.Dictionary
  Key   = Part No (text compare)
  Value = Array(Part Name, Stok WIP, Line)
Sumber  = sheet data kolom A:D (header di baris 1, data dari baris 2)
```

---

## 12. Integrasi & dependency eksternal

| Dependency | Path / sumber | Critical? |
|---|---|---|
| Folder CSV transaksi | `...\08. Transaksi CS EP1\00.Data_Input R1\` | Ya |
| Master line | `...\00.Data_LINE.xlsx` | Ya |
| Stocktaking EP2 | `...\STOCKTAKING\2026\` (file WC02 single terbaru) | Ya (untuk baseline stok) |
| CSV AI / SMT | File nama mengandung AI/SMT di folder R1 | Ya (untuk Sum_IN) |
| Excel 365 / 2021+ | Fungsi `FILTER` dinamis di sheet `out` | Ya (untuk grid) |
| Power Query / Mashup | Engine koneksi OLE DB Mashup | Ya |
| Akses UNC file server | `\\ymma-filesvr01\...` | Ya |

Jika folder CSV tidak ditemukan → MsgBox **"Folder Tidak Ditemukan"** dan proses simpan gagal.

---

## 13. Non-functional requirements

| Aspek | Spesifikasi |
|---|---|
| Performa input | Lookup Part No dari Dictionary (O(1)), tidak query sheet penuh tiap ketik |
| Konsistensi stok | Optimistic update cache + refresh PQ setelah simpan |
| Ketersediaan | Bergantung file server; offline = tidak bisa refresh/simpan |
| Keamanan | Proteksi sheet password; tidak ada autentikasi user terpusat |
| Auditability | Semua transaksi tersimpan di CSV bulanan |
| Concurrency | Multi-user append ke CSV yang sama — risiko race condition (tidak ada file lock eksplisit di desain saat ini) |
| Recoverability | Undo 1 langkah terakhir; sisanya restore dari backup CSV |
| Maintainability | Path & password di konstanta `ModMain`; query M tersentral di Section1 |

---

## 14. Matriks risiko & batasan diketahui

| Risiko | Dampak | Mitigasi saat ini / saran |
|---|---|---|
| Race condition 2 operator simpan bersamaan | Baris CSV hilang/timpa | Saran: antrian server / rename-atomic write |
| Tombol "Refresh" = ClearForm | Operator bingung | Relabel tombol atau wire ke `RefreshMasterData` |
| Stok negatif di data contoh | Over-issue historis / baseline stocktaking | Monitoring `Total_Stock < 0` |
| Path UNC hardcoded | Pindah server = aplikasi putus | Parameterisasi path |
| Duplicate check nonaktif | Part bisa diinput berkali-kali (by design) | Aktifkan bila kebijakan berubah |
| Defined name `WIP00` = `#REF!` | Legacy rusak | Bersihkan named range |

---

## 15. Skenario uji (UAT)

| ID | Skenario | Hasil diharapkan |
|---|---|---|
| TC-01 | Buka file pertama kali bulan baru | File `Data-MI yyyymm.csv` dibuat + header |
| TC-02 | Scan Part No valid | C13/C14/C16 terisi, fokus C15 |
| TC-03 | Part No tidak ada | Part Name kosong / blok simpan |
| TC-04 | Qty = 10,5 atau 10.5 | Diterima |
| TC-05 | Qty = 0 atau negatif | Ditolak |
| TC-06 | Qty > Stok WIP | Ditolak + tampil stok vs input |
| TC-07 | PIC kosong + Simpan | Ditolak |
| TC-08 | Simpan sukses | Baris CSV bertambah; form clear kecuali PIC; stok cache turun |
| TC-09 | Undo | Baris terakhir hilang setelah konfirmasi; query refresh |
| TC-10 | Filter E12 + F12 | Grid FILTER hanya transaksi cocok |
| TC-11 | Tombol Hari ini | F12 = TODAY |
| TC-12 | Auto refresh interval | Query list ter-refresh berkala tanpa crash OnTime |
| TC-13 | Tutup workbook | OnTime dibatalkan (tidak error "macro not available") |

---

## 16. Deployment & operasional

1. Letakkan workbook di folder kerja CS EP1 (share yang sama dengan path UNC query, atau pastikan path query tetap valid).
2. Pastikan operator punya **read** ke stocktaking & DATA_LINE, **read/write** ke `00.Data_Input R1`.
3. Enable macro (Trusted Location / digital sign bila diperlukan).
4. Pastikan Excel mendukung Dynamic Array (`FILTER`).
5. Verifikasi Power Query privacy / organizational settings mengizinkan akses folder UNC.
6. Uji TC-01 s/d TC-08 sebelum go-live shift.

### Struktur folder terkait

```
08. Transaksi CS EP1\
├── MI_Proses Line Rev.05.xlsm          ← aplikasi ini
├── SMT_Transaksi Ke WC02.xlsm
├── AI_Transaksi Ke WC02.xlsm
├── 00.Data_LINE.xlsx                   ← master Part ↔ Line
├── 00.Data_Input R1\
│   ├── Data-MI 202607.csv              ← OUT dari aplikasi ini
│   ├── Data-AI 202607.csv              ← IN AI
│   └── Data-SMT 202607.csv             ← IN SMT
├── 00.Data_Input\                      ← legacy harian (opsional)
└── 01.Data_CS\                         ← referensi CS
```

---

## 17. Evolusi versi (dari folder `new\`)

| Rev | File | Catatan |
|---|---|---|
| 01–04 | `new\MI_Proses Line Rev.0x.xlsm` | Iterasi awal |
| 04 | Root `MI_Proses Line Rev.04.xlsm` | Versi sebelumnya |
| **05** | **Root `MI_Proses Line Rev.05.xlsm`** | Versi spesifikasi ini |

---

## 18. Rekomendasi & dokumen pasangan

**Perbaikan jangka pendek (tetap Excel):**
1. Samakan label tombol **Refresh** dengan aksi aktual (`ClearForm`), atau pisah Clear vs Refresh Master.
2. Atomic write CSV untuk kurangi korupsi multi-user.
3. Parameterisasi UNC path.
4. Peringatan visual jika `Total_Stock < 0`.

**Migrasi web (wajib ikut Dokumen B):**  
Lihat [`Rancangan_Web_MySQL_MI_Proses_Line.md`](./Rancangan_Web_MySQL_MI_Proses_Line.md) — login, role, dashboard, Admin, AI/SMT/MI satu aplikasi, MySQL.

Setiap perubahan aturan bisnis di Excel **harus** di-update di dokumen A lalu dipetakan ulang di dokumen B (naikkan Versi paket sinkron bersama).

---

## 19. Lampiran — mapping cell & sumber data (MI)

| UI Cell | Sumber nilai |
|---|---|
| C13 Part Name | `gDataDict(PartNo)(0)` ← `data!B` / Stock_MI |
| C14 Stok WIP | `gDataDict(PartNo)(1)` ← `data!C` Total_Stock |
| C16 Line | `gDataDict(PartNo)(2)` ← `data!D` Nama Team |
| Grid OUT | FILTER `data!J:P` Transaksi_OUT |
| Grid IN | FILTER `data!T:Y` Update_Transaksi |

---

*Dokumen A (AS-IS). Dihasilkan dari analisis workbook MI/AI/SMT, Power Query M, VBA, dan sample CSV. Paket sinkron 1.0 · 2026-07-17 · pasangan: `Rancangan_Web_MySQL_MI_Proses_Line.md`.*
