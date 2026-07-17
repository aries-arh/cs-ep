# Rancangan Migrasi — CS EP1 Transaksi Stok → Web + MySQL  
## Dokumen B · TO-BE (Web)

| Atribut | Nilai |
|---|---|
| **Peran dokumen** | Rancangan sistem **target** (Web + MySQL) |
| **Dokumen pasangan** | [`Spesifikasi_Desain_MI_Proses_Line_Rev05.md`](./Spesifikasi_Desain_MI_Proses_Line_Rev05.md) · AS-IS (Excel) |
| **Versi paket sinkron** | **1.0** — 2026-07-17 |
| Sumber as-is | MI Rev.05 + AI_Transaksi + SMT_Transaksi (lihat Dokumen A) |
| Target | Aplikasi web shop-floor + MySQL |
| Domain | Transaksi CS EP1 — IN (AI/SMT→WC02) & OUT (MI→Line) + Dashboard + Admin |
| Prinsip | Pertahankan alur operator Excel; ganti CSV/PQ dengan DB; tambah login, role, dashboard |
| Stack saran | Next.js/React + NestJS (atau Laravel) + MySQL 8 |

> **Sinkronisasi:** Perilaku form & validasi AI/SMT/MI **harus** sesuai Dokumen A (§5, §5B, §9). Fitur bertanda *(baru di web)* boleh melampaui Excel (dashboard, Admin, auth).

### Matriks sinkron Dokumen B ↔ A

| Topik | Sumber kebenaran | Pasal B |
|---|---|---|
| Rumus stok | Dokumen A §1 | §1 (identik) |
| Form & validasi MI | Dokumen A §5, §9 | §7.4, §5 |
| Form & validasi AI/SMT | Dokumen A §5B | §7.0–7.3, §6.4 |
| CSV → tabel | Dokumen A §7 | §4 `trx_mi_in` / `trx_mi_out` |
| Dashboard / Login / Admin | *(baru)* | §7.1, §7.6–7.8 |
| Struktur script | *(baru)* | §12 |

---

## 1. Ringkasan arah desain

Sistem Excel (3 workbook) diganti menjadi **satu aplikasi web 3-tier**:

| Excel (sekarang) — Dokumen A | Web + MySQL (target) — Dokumen B |
|---|---|
| `AI_Transaksi Ke WC02.xlsm` | Halaman **Transaksi AI** `/trx/ai` |
| `SMT_Transaksi Ke WC02.xlsm` | Halaman **Transaksi SMT** `/trx/smt` |
| `MI_Proses Line Rev.05` sheet `out` | Halaman **Transaksi MI** `/trx/mi` |
| Sheet `data` + Power Query | **View/SQL** + API stok real-time |
| Stok hanya di C14 (per part) | **Dashboard Stok** (per line, low/negatif, IN vs OUT, top issue) |
| Tidak ada login/Admin menu | Login + role + **Admin** (master/import/export) |
| VBA `ModMain` | Backend service (validasi + transaksi) |
| CSV `Data-AI/SMT/MI yyyymm.csv` | Tabel `trx_mi_in` / `trx_mi_out` |
| Auto-refresh PQ 5 menit | Stok on-read; dashboard poll 60 dtk |
| File lock lemah (multi-user) | Transaksi DB + row lock |

**Rumus bisnis tetap sama:**

```
stok_wip = qty_stocktaking + SUM(qty_in) − SUM(qty_out)
```

---

## 2. Arsitektur target

```mermaid
flowchart TB
  subgraph clients [Client]
    OP[Operator Browser / Tablet]
    AD[Admin Web]
  end

  subgraph app [Application Tier]
    UI[Frontend SPA / SSR]
    API[Backend API REST]
    AUTH[Auth JWT / Session]
    JOB[Job Importer - opsional]
  end

  subgraph data [Data Tier]
    DB[(MySQL)]
  end

  subgraph external [Sumber eksternal - fase migrasi]
    ST[Stocktaking Excel/CSV]
    LINE[Master Data Line]
    AISMT[CSV AI/SMT legacy]
    COSSY[Cossy CS Open - fase lanjut opsional]
  end

  OP --> UI
  AD --> UI
  UI --> AUTH
  UI --> API
  API --> DB
  JOB --> ST
  JOB --> LINE
  JOB --> AISMT
  JOB --> DB
  COSSY -.-> API
```

### 2.1 Rekomendasi stack (standar tim pengembang)

| Lapisan | Pilihan utama | Alternatif |
|---|---|---|
| Frontend | HTML5 + JavaScript Vanilla (ES6+) | Vanilla CSS (tanpa framework) |
| Backend Utama | PHP CodeIgniter 3 (Modular/HMVC) | base class MY_Controller & MY_Model |
| Backend Tambahan | Python (FastAPI/Flask) | pemrosesan data berat via JSON API |
| DB Transaksional | MySQL 8.x | MariaDB 10.11+ |
| DB Analitik | PostgreSQL | data warehouse / report query berat |
| Linter & Standar | PSR-12 Linting | Filter XSS diaktifkan default |
| Auth | Session NIK + Role-based control | JWT Token (untuk komunikasi FastAPI) |
| Deploy | IIS / Apache / Nginx | VM internal / Docker on-premise |

> Menggunakan standar arsitektur tim: CodeIgniter 3 Modular, filter XSS, PSR-12 linting, dan Python FastAPI untuk pemrosesan/analitik data dengan PostgreSQL.

---

## 3. Pemetaan modul Excel → Web

| Fitur Excel | Modul Web | Endpoint contoh |
|---|---|---|
| `AI_Transaksi Ke WC02.xlsm` form IN | **Transaksi AI** (`/trx/ai`) | `POST /api/mi-in` `source=AI` |
| `SMT_Transaksi Ke WC02.xlsm` form IN | **Transaksi SMT** (`/trx/smt`) | `POST /api/mi-in` `source=SMT` |
| Scan No SLIP + cek duplikat | Lookup / unique constraint | `GET /api/mi-in/slips/{noSlip}` |
| Scan Part No → lookup (MI) | Lookup master + stok | `GET /api/parts/{partNo}/stock` |
| Validasi qty ≤ stok (MI) | Service validasi | di dalam `POST /api/mi-out` |
| Tombol Simpan MI | Buat transaksi OUT | `POST /api/mi-out` |
| Tombol Undo / hapus 1 terakhir | Void last | `POST /api/mi-*/{id}/void` |
| Clear form | State UI frontend | client-only |
| Filter transaksi hari ini | Grid riwayat | `GET /api/mi-out` / `GET /api/mi-in` |
| Panel IN di MI (Grup AI/SMT) | Tab/filter di MI + halaman AI/SMT | `GET /api/mi-in?source=` |
| Stok WIP per part (C14) | Form MI + **Dashboard Stok** | `GET /api/dashboard/*` |
| *(baru)* | Dashboard: stok/line, low/negatif, IN vs OUT, top issue | lihat §7.1 |
| Refresh master | Tidak perlu (real-time DB) | — |
| Proteksi sheet | Role-based UI per area AI/SMT/MI | middleware auth |
| Auto-refresh PQ | Polling dashboard 30–60s | `GET /api/dashboard/summary` |

---

## 4. Model data MySQL

### 4.1 ER diagram (inti)

```mermaid
erDiagram
  mst_part ||--o{ trx_stocktaking_bal : has
  mst_part ||--o{ trx_mi_in : receives
  mst_part ||--o{ trx_mi_out : issues
  mst_line ||--o{ mst_part : assigns
  mst_user ||--o{ trx_mi_out : posts
  mst_user ||--o{ trx_mi_in : posts

  mst_line {
    int id PK
    varchar code "LINE 1..7, LINE MIC"
    varchar name
    tinyint is_active
  }

  mst_part {
    int id PK
    varchar part_no UK
    varchar part_name
    int line_id FK
    tinyint is_active
  }

  mst_user {
    int id PK
    varchar nik UK
    varchar name
    varchar role "OPERATOR|LEADER|ADMIN"
    varchar password_hash
  }

  trx_stocktaking_bal {
    int id PK
    int part_id FK
    date stock_date
    decimal qty
    varchar source_file
    datetime imported_at
  }

  trx_mi_in {
    bigint id PK
    enum source "AI|SMT"
    varchar no_slip UK
    int part_id FK
    datetime trx_at
    decimal qty
    varchar to_location
    varchar catatan
    int pic_user_id FK
    tinyint is_void
  }

  trx_mi_out {
    bigint id PK
    int part_id FK
    datetime trx_at
    decimal qty
    decimal stock_snapshot
    int line_id FK
    int pic_user_id FK
    int created_by FK
    tinyint is_void
    bigint void_of_id
    datetime created_at
  }
```

### 4.2 DDL inti (sketch)

```sql
CREATE TABLE mst_line (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,   -- LINE 1, LINE 3, LINE MIC
  name VARCHAR(100) NULL,
  is_active TINYINT NOT NULL DEFAULT 1
);

CREATE TABLE mst_part (
  id INT AUTO_INCREMENT PRIMARY KEY,
  part_no VARCHAR(40) NOT NULL UNIQUE,
  part_name VARCHAR(255) NOT NULL,
  line_id INT NULL,
  is_active TINYINT NOT NULL DEFAULT 1,
  CONSTRAINT fk_part_line FOREIGN KEY (line_id) REFERENCES mst_line(id)
);

CREATE TABLE mst_user (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nik VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  role ENUM('OPERATOR','LEADER','ADMIN') NOT NULL DEFAULT 'OPERATOR',
  password_hash VARCHAR(255) NOT NULL,
  can_ai TINYINT NOT NULL DEFAULT 0,    -- akses menu Transaksi AI
  can_smt TINYINT NOT NULL DEFAULT 0,   -- akses menu Transaksi SMT
  can_mi TINYINT NOT NULL DEFAULT 0,    -- akses menu Transaksi MI
  is_active TINYINT NOT NULL DEFAULT 1
);

-- Baseline stocktaking (bisa 1 row aktif per part, atau histori)
CREATE TABLE trx_stocktaking_bal (
  id INT AUTO_INCREMENT PRIMARY KEY,
  part_id INT NOT NULL,
  stock_date DATE NOT NULL,
  qty DECIMAL(18,6) NOT NULL DEFAULT 0,
  source_file VARCHAR(255) NULL,
  imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_part_date (part_id, stock_date),
  CONSTRAINT fk_st_part FOREIGN KEY (part_id) REFERENCES mst_part(id)
);

CREATE TABLE trx_mi_in (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source ENUM('AI','SMT','MANUAL','IMPORT') NOT NULL,  -- area input (AI vs SMT)
  no_slip VARCHAR(64) NOT NULL,                       -- No SLIP (unik per source)
  part_id INT NOT NULL,
  trx_at DATETIME NOT NULL,                           -- Timestamp
  qty DECIMAL(18,6) NOT NULL,                         -- Slip Qty / Qty OUT di form Excel
  to_location VARCHAR(32) NOT NULL DEFAULT 'WC02',    -- To Location / To Loc
  catatan VARCHAR(255) NULL,
  pic_user_id INT NULL,                              -- Input PIC
  created_by INT NULL,
  is_void TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_source_slip (source, no_slip),        -- setara cek duplikat No Slip di CSV
  KEY ix_in_part_time (part_id, trx_at),
  KEY ix_in_day (trx_at),
  CONSTRAINT fk_in_part FOREIGN KEY (part_id) REFERENCES mst_part(id)
);

CREATE TABLE trx_mi_out (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  part_id INT NOT NULL,
  trx_at DATETIME NOT NULL,
  qty DECIMAL(18,6) NOT NULL,
  stock_snapshot DECIMAL(18,6) NULL,  -- stok saat input (seperti CSV)
  line_id INT NULL,
  pic_user_id INT NULL,
  created_by INT NULL,
  is_void TINYINT NOT NULL DEFAULT 0,
  void_of_id BIGINT NULL,
  remark VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_out_part_time (part_id, trx_at),
  KEY ix_out_day (trx_at),
  CONSTRAINT fk_out_part FOREIGN KEY (part_id) REFERENCES mst_part(id)
);
```

### 4.3 View stok (ganti Power Query `Stock_MI`)

```sql
CREATE OR REPLACE VIEW vw_stock_mi AS
SELECT
  p.id AS part_id,
  p.part_no,
  p.part_name,
  l.code AS line_code,
  COALESCE(st.qty, 0) AS qty_stocktaking,
  COALESCE(i.sum_in, 0) AS sum_in,
  COALESCE(o.sum_out, 0) AS sum_out,
  COALESCE(st.qty, 0) + COALESCE(i.sum_in, 0) - COALESCE(o.sum_out, 0) AS total_stock
FROM mst_part p
LEFT JOIN mst_line l ON l.id = p.line_id
LEFT JOIN (
  -- ambil stocktaking terbaru per part
  SELECT s.part_id, s.qty
  FROM trx_stocktaking_bal s
  INNER JOIN (
    SELECT part_id, MAX(stock_date) AS max_date
    FROM trx_stocktaking_bal
    GROUP BY part_id
  ) t ON t.part_id = s.part_id AND t.max_date = s.stock_date
) st ON st.part_id = p.id
LEFT JOIN (
  SELECT part_id, SUM(qty) AS sum_in
  FROM trx_mi_in
  WHERE is_void = 0
  GROUP BY part_id
) i ON i.part_id = p.id
LEFT JOIN (
  SELECT part_id, SUM(qty) AS sum_out
  FROM trx_mi_out
  WHERE is_void = 0
  GROUP BY part_id
) o ON o.part_id = p.id
WHERE p.is_active = 1;
```

> Opsional performa: materialize ke tabel `stock_balance` yang di-update lewat trigger / transaksi aplikasi (lebih cepat untuk scan massal).

---

## 5. Aturan bisnis di backend (port dari VBA)

| ID | Aturan Excel | Implementasi Web |
|---|---|---|
| BR-01 | Part No wajib & ada di master | 404 jika part tidak ditemukan |
| BR-02 | Qty > 0, decimal ok | validasi DTO `qty > 0` |
| BR-03 | Qty ≤ stok | cek `vw_stock_mi.total_stock` **dalam transaksi DB** |
| BR-04 | PIC wajib | `pic_user_id` required |
| BR-05 | PIC tetap setelah simpan | state UI; backend tidak peduli |
| BR-06 | Undo 1 terakhir | void record milik user/shift (bukan hapus fisik) |
| BR-07 | Snapshot stok saat simpan | isi `stock_snapshot` |
| BR-08 | Race 2 operator | `SELECT ... FOR UPDATE` pada baris part/balance |

### 5.1 Pseudocode simpan (inti)

```text
BEGIN TRANSACTION
  lock stock row for part_id
  stock = hitung / baca balance
  IF qty > stock THEN ROLLBACK + error "Qty melebihi stok"
  INSERT trx_mi_out (..., stock_snapshot = stock)
  optional: UPDATE stock_balance SET qty = qty - :qty
COMMIT
return { id, new_stock }
```

Ini memperbaiki kelemahan CSV append multi-user.

---

## 6. Desain API (REST)

### 6.1 Auth
- `POST /api/auth/login` → token
- `POST /api/auth/logout`

### 6.2 Master & stok
- `GET /api/parts?q=` — autocomplete
- `GET /api/parts/{partNo}` — detail + line
- `GET /api/parts/{partNo}/stock` — `total_stock`, `sum_in`, `sum_out`, `stocktaking`

### 6.3 Transaksi MI OUT
- `POST /api/mi-out`  
  body: `{ partNo, qty, picNik, lineCode? }`
- `GET /api/mi-out?date=YYYY-MM-DD&partNo=&line=`
- `POST /api/mi-out/{id}/void` — ganti Undo
- `GET /api/mi-out/last` — kandidat undo (opsional)

### 6.4 Transaksi IN — AI & SMT (setara Excel AI/SMT)

Sumber Excel:
- `AI_Transaksi Ke WC02.xlsm` → halaman **Transaksi AI**
- `SMT_Transaksi Ke WC02.xlsm` → halaman **Transaksi SMT**  
  *(file `~$SMT_...` adalah lock file Excel sementara, bukan aplikasi)*

API dipakai bersama; bedanya `source`:

- `POST /api/mi-in`  
  body: `{ source: "AI"|"SMT", noSlip, partNo, qty, toLocation, catatan?, picNik }`
- `GET /api/mi-in?source=AI|SMT&date=&partNo=&noSlip=`
- `GET /api/mi-in/slips/{noSlip}?source=` — lookup slip / cek duplikat
- `POST /api/mi-in/{id}/void` — ganti “hapus 1 data terakhir”
- `GET /api/mi-in/last?source=` — kandidat void
- `POST /api/imports/csv` — impor legacy `Data-AI` / `Data-SMT`

### 6.5 Admin — master, import, export
- `CRUD /api/parts`, `/api/lines`, `/api/locations`, `/api/users`
- `POST /api/stocktaking/import` — unggah / tarik file stocktaking
- `POST /api/imports/parts` — impor master Part/Line
- `POST /api/imports/csv` — impor histori AI/SMT/MI
- `GET /api/exports/mi-in?source=&from=&to=` — export CSV/XLSX setara Data-AI/SMT
- `GET /api/exports/mi-out?from=&to=` — export setara Data-MI
- `GET /api/exports/stock?line=&status=` — export stok WIP

### 6.6 Dashboard stok
- `GET /api/dashboard/summary` — KPI ringkas (total part, stok negatif, IN/OUT hari ini)
- `GET /api/dashboard/stock-by-line` — agregat stok & jumlah part per line
- `GET /api/dashboard/low-stock?threshold=10` — part stok rendah / negatif
- `GET /api/dashboard/in-out-today` — total IN vs OUT hari ini (+ breakdown AI/SMT)
- `GET /api/dashboard/top-issued?limit=10&from=&to=` — top part issue (qty OUT)
- `GET /api/dashboard/stock-list?line=&status=negative|low|ok` — tabel detail (opsional drill-down)

Query param umum: `line`, `date` (default hari ini), `threshold` (default dari config).

---

## 7. Desain UI web

Navigasi utama (pemisah area AI / SMT / MI seperti 3 file Excel terpisah):

```
[ Dashboard Stok ]  [ Transaksi AI ]  [ Transaksi SMT ]  [ Transaksi MI ]  [ Admin ]
```

| Menu web | Setara Excel | Peran input |
|---|---|---|
| **Transaksi AI** | `AI_Transaksi Ke WC02.xlsm` | IN dari Auto Insert → WC02 |
| **Transaksi SMT** | `SMT_Transaksi Ke WC02.xlsm` | IN dari SMT → WC02 |
| **Transaksi MI** | `MI_Proses Line Rev.05.xlsm` | OUT WIP ke Line |
| Dashboard Stok | *(baru)* | Pantauan Leader/Admin |

- **Operator AI** → default **Transaksi AI**
- **Operator SMT** → default **Transaksi SMT**
- **Operator Line/CS** → default **Transaksi MI**
- Role bisa dibatasi per menu (AI tidak perlu akses form SMT, dst.)

---

### 7.0 Pemetaan form AI / SMT dari Excel

> Spesifikasi as-is lengkap: **Dokumen A §5B**. Pasal ini = mapping ke UI/API web (wajib 1:1 field & validasi).

Kedua file Excel memakai layout **hampir identik** (sheet `in` + UserForm). Perbedaan utama hanya judul & file CSV.

| Elemen | AI Excel | SMT Excel | Web |
|---|---|---|---|
| Judul | `TRANSAKSI PCB AUTO INSERT TO WC02` | `TRANSAKSI PCB SMT TO WC02` | Judul halaman + badge area |
| CSV | `Data-AI yyyymm.csv` | `Data-SMT yyyymm.csv` | `trx_mi_in.source = AI\|SMT` |
| Qty di grid data | kolom `Qty AI` | kolom `Qty SMT` | field `qty` + filter `source` |
| UserForm | `ShowForm` | `ShowForm01` | Form HTML sama, `source` beda |
| To Loc label | To Location | To Loc | `toLocation` (default WC02) |

#### Field input (baris form Excel B11:H11 / UserForm)

| Urutan | Field Excel | Cell / kontrol | Wajib | Perilaku |
|---|---|---|---|---|
| 1 | **No SLIP** | B11 / `txtSlipNo` | Ya | Scan; cek duplikat; Enter bisa langsung Simpan |
| 2 | **Part No** | C11 / `TextNoPart` | Ya | Combo/lookup master `data` kolom B |
| 3 | **Part Name** | D11 / `txtPartName` | Auto | Lookup dari Part No |
| 4 | **Qty OUT** (Slip Qty) | E11 / `txtQty` | Ya | Angka, boleh desimal |
| 5 | **To Location / To Loc** | F11 / `cboToLoc` | Ya | Combo; nilai umum `WC02` |
| 6 | **Catatan** | G11 | Tidak | Bebas |
| 7 | **Input PIC** | H11 | Ya | Dipertahankan setelah simpan |

#### Tombol (setara Excel)

| Excel | Web |
|---|---|
| **SIMPAN** / Simpan | Simpan → `POST /api/mi-in` |
| **hapus 1 data terakhir** | Void last → `POST /api/mi-in/{id}/void` |
| **ClearFORM** | Clear form (PIC tetap) |
| **Hari ini** | Set filter tanggal = today |
| **Create CS** | Opsional fase lanjut (buat dokumen CS); tidak memblokir MVP |

#### Area filter + grid riwayat (setara baris 13–17 Excel)

| Elemen | AI | SMT | Web |
|---|---|---|---|
| Filter label | Short by Date/Part No | Short by Part No./Date | Filter Part No + Tanggal |
| Total qty tampilan | `SUMPRODUCT` kolom Qty | sama | Sum qty hasil filter |
| Kolom grid | Tanggal, Part No, Part Name, Qty OUT, Input PIC | Tanggal, Part No, Part Name, Qty OUT, PIC | sama + No Slip + To Loc |

#### Kolom CSV / payload simpan

```
No Slip, Part No, Part Name, Slip Qty, To Location, PIC, Catatan, Timestamp
```

#### Validasi (port dari VBA AI/SMT)

| Aturan | Pesan Excel |
|---|---|
| No Slip wajib | No Slip (B11) masih kosong |
| No Slip unik per area | No Slip sudah pernah diinput di file CSV |
| Part No terdaftar | Part No tidak terdaftar di sheet data |
| Qty angka > 0 | Qty SLIP harus berupa angka |
| To Loc wajib | To Loc wajib dipilih |

---

### 7.1 Halaman Dashboard Stok *(baru — tidak ada di Excel)*

Tujuan: pantauan stok WIP CS EP1 secara agregat, mengganti keterbatasan Excel yang hanya menampilkan stok **per part saat scan**.

#### 7.1.1 Wireframe

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Dashboard Stok WIP — CS EP1     Tanggal: [hari ini ▼]  Line: [Semua ▼] │
│  Auto-refresh: 60 dtk                              User: LEADER [Logout]│
├──────────────┬──────────────┬──────────────┬────────────────────────────┤
│ Part aktif   │ Stok negatif │ Stok rendah  │ Net hari ini (IN−OUT)      │
│    264       │     12       │     28       │   +1.240                   │
├──────────────┴──────────────┴──────────────┴────────────────────────────┤
│                                                                         │
│  ┌─ Stok per Line ─────────────┐  ┌─ IN vs OUT hari ini ─────────────┐ │
│  │ LINE 1 ████████░░  12,400   │  │  IN  ████████████  3,200         │ │
│  │ LINE 2 ██████░░░░   8,100   │  │  OUT ████████░░░░  1,960         │ │
│  │ LINE 3 █████████░  15,020   │  │  AI / SMT stacked (opsional)     │ │
│  │ LINE 4 …                    │  │                                  │ │
│  │ (bar horizontal qty stok)   │  │                                  │ │
│  └─────────────────────────────┘  └──────────────────────────────────┘ │
│                                                                         │
│  ┌─ Part stok rendah / negatif ────────┐  ┌─ Top part issue (OUT) ───┐ │
│  │ Status│Part No │Name    │Line│Stok  │  │ # │Part No│Name│Qty OUT │ │
│  │ NEG   │VEP895C │PCB…    │L3  │-516  │  │ 1 │VAZ851C│…   │ 450    │ │
│  │ LOW   │V64693E │…       │L1  │  0   │  │ 2 │…      │…   │ 320    │ │
│  │ LOW   │…       │…       │…   │  5   │  │ …                              │
│  │ klik baris → buka Transaksi / detail│  │ periode: hari ini / 7 hari│ │
│  └─────────────────────────────────────┘  └──────────────────────────┘ │
│                                                                         │
│  [Export Excel]  Threshold rendah: [10]  Terakhir update: 12:58:02     │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 7.1.2 Widget & definisi metrik

| Widget | Definisi | Sumber |
|---|---|---|
| **KPI Part aktif** | `COUNT` part `is_active=1` (filter line jika dipilih) | `mst_part` |
| **KPI Stok negatif** | part dengan `total_stock < 0` | `vw_stock_mi` |
| **KPI Stok rendah** | `0 ≤ total_stock ≤ threshold` (default 10, configurable) | `vw_stock_mi` |
| **KPI Net hari ini** | `SUM(IN hari ini) − SUM(OUT hari ini)` | `trx_mi_in` / `trx_mi_out` |
| **Stok per Line** | `SUM(total_stock)`, `COUNT(part)` group by `line_code` | `vw_stock_mi` |
| **IN vs OUT hari ini** | total qty IN & OUT tanggal dipilih; breakdown `source` AI/SMT | transaksi |
| **Part stok rendah/negatif** | list sort: negatif dulu, lalu terendah | `vw_stock_mi` |
| **Top part issue** | `SUM(qty OUT)` group by part, rank DESC, default top 10 | `trx_mi_out` |

**Aturan status stok:**

| Status | Kondisi | Warna UI |
|---|---|---|
| `NEGATIVE` | `total_stock < 0` | merah |
| `LOW` | `0 ≤ total_stock ≤ threshold` | amber |
| `OK` | `total_stock > threshold` | netral / hijau soft |

#### 7.1.3 SQL pendukung dashboard

```sql
-- Stok per line
SELECT
  COALESCE(line_code, 'UNASSIGNED') AS line_code,
  COUNT(*) AS part_count,
  SUM(total_stock) AS total_stock,
  SUM(CASE WHEN total_stock < 0 THEN 1 ELSE 0 END) AS negative_count,
  SUM(CASE WHEN total_stock >= 0 AND total_stock <= :threshold THEN 1 ELSE 0 END) AS low_count
FROM vw_stock_mi
WHERE (:line IS NULL OR line_code = :line)
GROUP BY COALESCE(line_code, 'UNASSIGNED')
ORDER BY line_code;

-- Part stok rendah / negatif
SELECT part_no, part_name, line_code, total_stock,
  CASE
    WHEN total_stock < 0 THEN 'NEGATIVE'
    WHEN total_stock <= :threshold THEN 'LOW'
    ELSE 'OK'
  END AS stock_status
FROM vw_stock_mi
WHERE total_stock <= :threshold
  AND (:line IS NULL OR line_code = :line)
ORDER BY total_stock ASC, part_no
LIMIT 100;

-- IN vs OUT hari ini
SELECT
  COALESCE((
    SELECT SUM(qty) FROM trx_mi_in
    WHERE is_void = 0 AND DATE(trx_at) = :date
  ), 0) AS qty_in,
  COALESCE((
    SELECT SUM(qty) FROM trx_mi_out
    WHERE is_void = 0 AND DATE(trx_at) = :date
  ), 0) AS qty_out;

-- Breakdown IN by source (hari ini)
SELECT source, SUM(qty) AS qty
FROM trx_mi_in
WHERE is_void = 0 AND DATE(trx_at) = :date
GROUP BY source;

-- Top part issue (OUT)
SELECT p.part_no, p.part_name, l.code AS line_code, SUM(o.qty) AS qty_out
FROM trx_mi_out o
JOIN mst_part p ON p.id = o.part_id
LEFT JOIN mst_line l ON l.id = COALESCE(o.line_id, p.line_id)
WHERE o.is_void = 0
  AND o.trx_at >= :from_ts AND o.trx_at < :to_ts
  AND (:line IS NULL OR l.code = :line)
GROUP BY p.part_no, p.part_name, l.code
ORDER BY qty_out DESC
LIMIT :limit;
```

#### 7.1.4 Perilaku UI dashboard
- Auto-refresh tiap **60 detik** (bisa pause); tombol Refresh manual.
- Filter **Line** dan **Tanggal** berlaku ke semua widget yang relevan.
- Klik baris stok rendah → navigasi ke **Transaksi MI** dengan Part No terisi, atau drawer detail (stocktaking / sum IN / sum OUT).
- Klik bar top issue → filter riwayat OUT part tersebut.
- Export: unduh CSV/XLSX snapshot widget aktif.
- Role: `LEADER` & `ADMIN` full; `OPERATOR` boleh lihat read-only (kebijakan opsional).

#### 7.1.5 Response JSON contoh `GET /api/dashboard/summary`

```json
{
  "asOf": "2026-07-17T12:58:02+07:00",
  "date": "2026-07-17",
  "line": null,
  "threshold": 10,
  "kpi": {
    "partActive": 264,
    "stockNegative": 12,
    "stockLow": 28,
    "qtyInToday": 3200,
    "qtyOutToday": 1960,
    "netToday": 1240
  },
  "stockByLine": [
    { "lineCode": "LINE 1", "partCount": 40, "totalStock": 12400, "negativeCount": 2, "lowCount": 5 }
  ],
  "lowStock": [
    { "partNo": "VEP895C", "partName": "PCB ASSY DM SMT-A 000963", "lineCode": "LINE 3", "totalStock": -516, "status": "NEGATIVE" }
  ],
  "inOutToday": {
    "qtyIn": 3200,
    "qtyOut": 1960,
    "inBySource": [{ "source": "SMT", "qty": 2100 }, { "source": "AI", "qty": 1100 }]
  },
  "topIssued": [
    { "rank": 1, "partNo": "VAZ851C", "partName": "PCB DML SMT-A 000513", "lineCode": "LINE 3", "qtyOut": 450 }
  ]
}
```

> Untuk performa, endpoint `summary` boleh menggabungkan beberapa query dalam 1 response agar UI 1 round-trip. Endpoint terpisah (§6.6) tetap tersedia untuk refresh widget tunggal.

---

### 7.2 Halaman Transaksi AI  
*(setara `AI_Transaksi Ke WC02.xlsm` — sheet `in`)*

```
┌──────────────────────────────────────────────────────────────┐
│  TRANSAKSI PCB AUTO INSERT TO WC02          PIC: NUNUNG      │
│  Area: [AI]                              User: …  [Logout]   │
├──────────────────────────────────────────────────────────────┤
│  No SLIP      [████ scan / ketik          ]                  │
│  Part No      [combo / scan               ]                  │
│  Part Name    (auto)                                         │
│  Qty OUT      [                           ]                  │
│  To Location  [WC02 ▼                     ]                  │
│  Catatan      [                           ]                  │
│  Input PIC    [NUNUNG                     ]  ← tetap         │
│                                                              │
│  [Simpan] [hapus 1 data terakhir] [ClearFORM] [Hari ini]     │
│  [Create CS — opsional]                                      │
├──────────────────────────────────────────────────────────────┤
│  Short by: Part No [    ]  Tanggal [hari ini]   Total Qty: n │
│  Tanggal | No Slip | Part No | Part Name | Qty OUT | PIC     │
│  (riwayat source=AI saja)                                    │
└──────────────────────────────────────────────────────────────┘
```

- Fokus awal: **No SLIP** (scanner).
- Setelah lookup Part No sukses → fokus Qty / To Loc sesuai alur Excel.
- Simpan sukses → clear No SLIP…Catatan; **PIC tetap**.
- Duplikat No SLIP → tolak (unik untuk `source=AI`).

---

### 7.3 Halaman Transaksi SMT  
*(setara `SMT_Transaksi Ke WC02.xlsm` — sheet `in`)*

Layout **sama dengan Transaksi AI**, perbedaan:

| Item | Nilai SMT |
|---|---|
| Judul | `TRANSAKSI PCB SMT TO WC02` |
| Badge area | `[SMT]` |
| API `source` | `"SMT"` |
| Riwayat | filter `source=SMT` saja |
| Label To Loc | `To Loc` (alias UI; field DB tetap `to_location`) |

```
┌──────────────────────────────────────────────────────────────┐
│  TRANSAKSI PCB SMT TO WC02                  PIC: MARZA       │
│  Area: [SMT]                              User: …  [Logout]  │
├──────────────────────────────────────────────────────────────┤
│  (form identik: No SLIP → Part No → Part Name → Qty OUT →    │
│   To Loc → Catatan → Input PIC)                              │
│  [Simpan] [hapus 1 data terakhir] [ClearFORM] [Hari ini]     │
├──────────────────────────────────────────────────────────────┤
│  Short by: Part No / Tanggal     Total Qty: …                │
│  Grid riwayat source=SMT                                     │
└──────────────────────────────────────────────────────────────┘
```

> Satu komponen frontend `InTransactionPage` dengan prop `source: 'AI' | 'SMT'` agar UI tidak diduplikasi; route terpisah `/trx/ai` dan `/trx/smt`.

---

### 7.4 Halaman Transaksi MI (setara sheet `out`)

Layout 1 layar (tablet landscape / PC shop-floor):

```
┌──────────────────────────────────────────────────────────┐
│  MI Proses Line — CS EP1          User: DEBI   [Logout]  │
├────────────────────────────┬─────────────────────────────┤
│  FORM INPUT                │  FILTER                     │
│  Part No  [████ scan   ]   │  Part  [    ]  Tgl [hari ini]│
│  Part Name  PCB ASSY...    │                             │
│  Stok WIP   187.00         │  ← jika <0 atau ≤threshold  │
│  Qty Out  [     ]          │    badge merah/amber        │
│  Line       LINE 7         │                             │
│  PIC      [combo/nik   ]   │                             │
│                            │                             │
│  [Batal] [Undo] [Simpan]   │                             │
├────────────────────────────┴─────────────────────────────┤
│  Riwayat OUT (hari ini / filter)                         │
│  Waktu | Part No | Part Name | Qty | Line | PIC          │
├──────────────────────────────────────────────────────────┤
│  Riwayat IN (AI/SMT) — tab / filter Grup                 │
└──────────────────────────────────────────────────────────┘
```

Link cepat dari form: **Lihat di Dashboard** (filter part/line terkait).

**Beda penting MI vs AI/SMT:** MI tidak memakai No SLIP / To Location; fokus Part No + Qty Out + Line + cek stok WIP.

### 7.5 UX shop-floor (wajib)
- Fokus otomatis ke field scan utama (No SLIP untuk AI/SMT; Part No untuk MI).
- Scanner barcode = keyboard input + Enter → trigger lookup / simpan (AI/SMT: Enter di No SLIP bisa langsung Simpan jika form valid — setara Excel).
- Tombol besar, kontras tinggi, font besar.
- Suara/beep + toast sukses/gagal.
- PIC tersimpan di localStorage per area (`ai` / `smt` / `mi`) sampai diganti.
- Konfirmasi modal sebelum hapus/void data terakhir.
- Di form MI: warnai **Stok WIP** merah jika negatif, amber jika ≤ threshold.

### 7.6 Modul Admin — Data Master, Import/Export, User

Di Excel **tidak ada menu Admin**. Master diedit lewat file terpisah (`00.Data_LINE.xlsx`, stocktaking), transaksi “ter-export” otomatis ke CSV.  
Di web, semuanya digabung di menu **Admin** (hanya role `ADMIN` / `LEADER` terbatas).

Navigasi penuh:

```
[ Dashboard Stok ] [ Transaksi AI ] [ Transaksi SMT ] [ Transaksi MI ] [ Admin ▼ ]
                                                                      ├─ Data Master
                                                                      │   ├─ Part (mst_part)
                                                                      │   ├─ Line / Nama Team
                                                                      │   └─ Lokasi (WC02, …)
                                                                      ├─ Import
                                                                      │   ├─ Impor Data_LINE / Part
                                                                      │   ├─ Impor Stocktaking
                                                                      │   └─ Impor CSV histori (AI/SMT/MI)
                                                                      ├─ Export
                                                                      │   ├─ Export transaksi AI
                                                                      │   ├─ Export transaksi SMT
                                                                      │   ├─ Export transaksi MI
                                                                      │   └─ Export stok (vw_stock_mi)
                                                                      ├─ User & Role
                                                                      ├─ Pengaturan (threshold stok rendah, …)
                                                                      └─ Log / Audit void
```

#### 7.6.1 Data Master

| Submenu | Fungsi | Setara Excel |
|---|---|---|
| **Part** | CRUD Part No, Part Name, Line, aktif/nonaktif | `00.Data_LINE.xlsx` + sheet `data` |
| **Line** | CRUD LINE 1…7, LINE MIC | kolom Nama Team |
| **Lokasi** | Master To Loc (default WC02) | combo `cboToLoc` di AI/SMT |

#### 7.6.2 Import

| Submenu | Fungsi |
|---|---|
| Impor Part/Line | Upload Excel/CSV dari `00.Data_LINE.xlsx` |
| Impor Stocktaking | Upload file WC02 stocktaking (baseline stok) |
| Impor CSV histori | `Data-AI` / `Data-SMT` / `Data-MI` saat cutover |

#### 7.6.3 Export

| Submenu | Output | Kompatibilitas |
|---|---|---|
| Export AI | CSV/XLSX filter tanggal | format kolom seperti `Data-AI yyyymm.csv` |
| Export SMT | CSV/XLSX | seperti `Data-SMT yyyymm.csv` |
| Export MI | CSV/XLSX | seperti `Data-MI yyyymm.csv` |
| Export stok | Part No, Name, Line, Total_Stock, status | setara tabel `Stock_MI` |
| Dari Dashboard | tombol **Export Excel** per widget | snapshot KPI / low stock / top issue |

API terkait (§6.5 dilengkapi):

- `GET /api/exports/mi-in?source=AI|SMT&from=&to=`
- `GET /api/exports/mi-out?from=&to=`
- `GET /api/exports/stock?line=&status=`
- `POST /api/imports/parts`, `POST /api/imports/stocktaking`, `POST /api/imports/csv`

#### 7.6.4 Wireframe ringkas Admin

```
┌─────────────────────────────────────────────────────────────┐
│  Admin — CS EP1 Transaksi                    [User ADMIN]   │
├──────────────┬──────────────────────────────────────────────┤
│ Data Master  │  Part                              [+ Tambah]│
│  • Part      │  Part No | Part Name | Line | Status | Aksi  │
│  • Line      │  …                                           │
│  • Lokasi    │  [Import Excel] [Export]                     │
│ Import       │                                              │
│ Export       │                                              │
│ User & Role  │                                              │
│ Pengaturan   │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

#### 7.6.5 Hak akses

| Role | Data Master | Import | Export | User |
|---|---|---|---|---|
| OPERATOR | — | — | — | — |
| LEADER | lihat | — | Ya | — |
| ADMIN | CRUD | Ya | Ya | Ya |

---

### 7.7 Desain halaman: Login, User biasa, Admin

#### 7.7.1 Halaman Login

URL: `/login` (tanpa auth). Setelah sukses → redirect sesuai role/area default.

```
┌─────────────────────────────────────────┐
│                                         │
│         CS EP1 — Transaksi Stok         │
│              EP-STOK / MI               │
│                                         │
│     NIK / Username  [______________]    │
│     Password        [______________]    │
│                                         │
│              [  Masuk  ]                │
│                                         │
│     Intranet only · Hubungi Admin       │
│     jika akun terkunci                  │
└─────────────────────────────────────────┘
```

Perilaku:
- Submit → `POST /api/auth/login` → simpan JWT/session di httpOnly cookie atau localStorage
- Salah kredensial → pesan merah, fokus ke password
- Akun nonaktif → “Akun dinonaktifkan”
- Setelah login, **PIC default** = nama user (bisa diganti di form transaksi)

#### 7.7.2 Shell aplikasi (layout bersama)

```
┌──────────────────────────────────────────────────────────────┐
│ Logo CS EP1 │ {menu sesuai role} │ 🟢 User · Role │ [Keluar] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                     { isi halaman }                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Menu yang tampil bergantung role + flag area (`can_ai`, `can_smt`, `can_mi`):

| Role | Menu terlihat | Home default |
|---|---|---|
| **OPERATOR_AI** | Transaksi AI | `/trx/ai` |
| **OPERATOR_SMT** | Transaksi SMT | `/trx/smt` |
| **OPERATOR_MI** | Transaksi MI | `/trx/mi` |
| **LEADER** | Dashboard + AI + SMT + MI + Export (di Admin terbatas) | `/dashboard` |
| **ADMIN** | Semua + Admin penuh | `/admin` atau `/dashboard` |

Di DB, role bisa disederhanakan jadi `OPERATOR | LEADER | ADMIN` + kolom akses area:

```sql
ALTER TABLE mst_user
  ADD can_ai TINYINT NOT NULL DEFAULT 0,
  ADD can_smt TINYINT NOT NULL DEFAULT 0,
  ADD can_mi TINYINT NOT NULL DEFAULT 0;
```

#### 7.7.3 Halaman User biasa (Operator)

Fokus **satu layar transaksi**, minim distraksi (setara Excel kiosk).

**Contoh Operator MI** (`/trx/mi`):

```
┌──────────────────────────────────────────────────────────────┐
│ CS EP1 │ Transaksi MI │          DEBI · OPERATOR │ [Keluar] │
├──────────────────────────────────────────────────────────────┤
│  Part No   [scan____________]     Stok WIP: 187   LINE 7     │
│  Part Name  PCB ASSY …                                       │
│  Qty Out   [____]   PIC [DEBI S. FATIMAH ▼]                  │
│  [Simpan] [Undo] [Clear]                                     │
├──────────────────────────────────────────────────────────────┤
│  Riwayat hari ini (hanya milik area / filter tanggal)        │
└──────────────────────────────────────────────────────────────┘
```

**Operator AI / SMT** — layout §7.2 / §7.3; tidak ada link Admin/Master.

Yang **tidak** muncul untuk user biasa:
- Menu Admin, Data Master, Import, User & Role
- Edit Part/Line
- (Opsional) Dashboard — hanya jika diberi akses LEADER

#### 7.7.4 Halaman Admin

URL group: `/admin/*` — guard role `ADMIN` (LEADER hanya export/lihat).

**Home Admin** (`/admin`):

```
┌──────────────────────────────────────────────────────────────┐
│ CS EP1 │ Dashboard │ AI │ SMT │ MI │ Admin │  ADMIN │ Keluar│
├────────────┬─────────────────────────────────────────────────┤
│ Data Master│  Ringkasan Admin                                │
│  Part      │  • Part aktif: 264                              │
│  Line      │  • User aktif: 18                               │
│  Lokasi    │  • Stok negatif: 12   [ke Dashboard]            │
│ Import     │  • Transaksi hari ini: AI 40 · SMT 85 · MI 62   │
│ Export     │                                                 │
│ User & Role│  [Impor Stocktaking]  [Export MI hari ini]      │
│ Pengaturan │                                                 │
│ Audit Log  │                                                 │
└────────────┴─────────────────────────────────────────────────┘
```

**Admin — User & Role** (`/admin/users`):

```
│ NIK | Nama | Role | AI | SMT | MI | Status | Aksi            │
│ 3009999 | DIAN | OPERATOR | ☐ | ☐ | ☑ | Aktif | Edit Reset │
```

**Admin — Export** (`/admin/export`): pilih sumber AI/SMT/MI/Stok + rentang tanggal + unduh CSV/XLSX.

#### 7.7.5 Peta route frontend

| Route | Role | Halaman |
|---|---|---|
| `/login` | public | Login |
| `/dashboard` | LEADER, ADMIN | Dashboard Stok |
| `/trx/ai` | can_ai | Transaksi AI |
| `/trx/smt` | can_smt | Transaksi SMT |
| `/trx/mi` | can_mi | Transaksi MI |
| `/admin` | ADMIN | Home Admin |
| `/admin/parts` | ADMIN | Master Part |
| `/admin/lines` | ADMIN | Master Line |
| `/admin/locations` | ADMIN | Master Lokasi |
| `/admin/import` | ADMIN | Import |
| `/admin/export` | LEADER+, ADMIN | Export |
| `/admin/users` | ADMIN | User & Role |
| `/admin/settings` | ADMIN | Threshold dll. |
| `/admin/audit` | ADMIN | Log void |

Unauthorized → redirect `/login` atau halaman 403.

---

### 7.8 Alur setelah login

```mermaid
flowchart TD
  L[Login sukses] --> R{Role?}
  R -->|OPERATOR + can_ai| AI[/trx/ai]
  R -->|OPERATOR + can_smt| SMT[/trx/smt]
  R -->|OPERATOR + can_mi| MI[/trx/mi]
  R -->|LEADER| D[/dashboard]
  R -->|ADMIN| A[/admin]
```

---

## 8. Integrasi & migrasi data

### 8.1 Fase data awal (cutover)

| Sumber lama | Target tabel | Cara |
|---|---|---|
| `00.Data_LINE.xlsx` | `mst_part`, `mst_line` | Script impor sekali |
| Stocktaking WC02 terbaru | `trx_stocktaking_bal` | Job impor / unggah manual |
| `Data-MI yyyymm.csv` | `trx_mi_out` | Impor histori bulan berjalan (+ opsional arsip) |
| `Data-AI` / `Data-SMT` | `trx_mi_in` | Impor histori bulan berjalan |
| PIC string di CSV | `mst_user` | Parse NIK dari teks `"3009999 - NAMA"` |

### 8.2 Strategi coexistence (disarankan 2–4 minggu)

```mermaid
flowchart LR
  A[Excel AI/SMT tetap tulis CSV] --> B[Importer job tiap 1-5 menit]
  B --> C[(MySQL trx_mi_in)]
  D[Web MI OUT] --> E[(MySQL trx_mi_out)]
  C --> F[vw_stock_mi]
  E --> F
  F --> D
```

- **Fase 1:** Web MI OUT + Web AI + Web SMT (halaman terpisah); importer CSV hanya untuk histori.
- **Fase 2:** Matikan Excel AI/SMT/MI setelah UAT.
- **Fase 3 (opsional):** Tarik master/order dari **Cossy CS Open** jika dibutuhkan (saat ini Excel MI **tidak** memakai Cossy).

> Catatan: `~$SMT_Transaksi Ke WC02.xlsm` adalah file kunci sementara Excel (workbook sedang terbuka), bukan sumber spesifikasi. Spesifikasi SMT diambil dari `SMT_Transaksi Ke WC02.xlsm`.

### 8.3 Cossy CS Open (opsional, belum ada di Excel)

Jika nanti dibutuhkan, sisipkan sebagai sumber master/order — **bukan** pengganti stok WIP:

| Data Cossy | Digunakan untuk |
|---|---|
| CS Open / open order | Validasi part yang boleh di-issue, qty plan |
| Part master | Sinkron `mst_part` |

Integrasi: API/DB view read-only → job sync ke `mst_part` / tabel `cs_open_order`.  
Stok tetap dihitung internal (stocktaking + IN − OUT) kecuali bisnis memutuskan stok dari Cossy.

---

## 9. Keamanan & operasional

| Aspek | Desain |
|---|---|
| Autentikasi | Login NIK + password; PIC transaksi tercatat |
| Otorisasi | OPERATOR: create OUT; LEADER: void; ADMIN: master & impor |
| Audit | Jangan hard-delete; `is_void` + timestamp + user |
| Jaringan | Hanya intranet; HTTPS internal bila memungkinkan |
| Backup | MySQL daily dump + binlog |
| Observability | Log API + metrik error simpan / stok negatif |
| Perf | Index `(part_id, trx_at)`; pertimbangkan tabel balance |

---

## 10. Non-functional (target)

| Metrik | Target |
|---|---|
| Lookup Part No | < 200 ms |
| Simpan transaksi | < 500 ms (termasuk lock) |
| Concurrent operator | ≥ 10 tanpa kehilangan data |
| Ketersediaan | Shift produksi (mis. 06:00–22:00) |
| Recovery | RPO ≤ 1 jam (backup); Undo/void real-time |

---

## 11. Rencana implementasi (phased)

| Fase | Durasi (estimasi) | Deliverable |
|---|---|---|
| **0. Discovery** | 1 minggu | Finalisasi scope IN/OUT, role, server |
| **1. Foundation** | 2 minggu | DB schema, auth, CRUD master, impor Data_LINE |
| **2. Core MI OUT** | 3 minggu | Form scan, stok view, simpan, void, riwayat |
| **3. Core AI + SMT IN** | 3 minggu | Halaman Transaksi AI & SMT setara Excel (No SLIP, To Loc, Catatan, PIC) |
| **4. Stocktaking + Dashboard** | 2 minggu | Impor stocktaking; Dashboard stok |
| **5. UAT & parallel run** | 2 minggu | Excel AI/SMT/MI vs Web side-by-side |
| **6. Go-live** | 1–2 minggu | Cutover AI → SMT → MI (atau paralel jika siap) |
| **7. Expand** | backlog | Create CS, Cossy, PWA offline, alert email stok negatif |

---

## 12. Struktur proyek saran

```
mi-proses-line/
├── application/              # Folder PHP CodeIgniter 3 (Modular/HMVC)
│   ├── core/
│   │   ├── MY_Controller.php # Base controller (XSS filter & session auth)
│   │   └── MY_Model.php      # Base model (audit log & standard CRUD)
│   ├── modules/              # Struktur Modular HMVC
│   │   ├── auth/             # Autentikasi NIK
│   │   ├── material_issue/   # Transaksi OUT (MI)
│   │   └── stock_control/    # Master stock & part
│   └── config/
├── python_service/           # Service Python (FastAPI)
│   ├── app/
│   │   ├── main.py           # API endpoints untuk stock calculation
│   │   └── services/         # Stocktaking file parser
│   └── requirements.txt
├── public/                   # Frontend assets
│   ├── css/
│   │   └── style.css         # Vanilla CSS (Custom styling, Dark Mode variables)
│   ├── js/
│   │   └── app.js            # Vanilla JS (ES6+) barcode scan handler
│   └── index.php
└── database/
    ├── mysql_schema.sql      # Schema transaksional MySQL
    └── postgres_schema.sql   # Schema analitik PostgreSQL
```

### 12.1 Tanggung jawab layer

| Layer | Script / folder | Tugas |
|---|---|---|
| **UI pages** | `apps/web/.../page.tsx` | Layout & interaksi; tidak hitung stok |
| **UI components** | `components/trx/*` | Form scan, grid; reusable AI/SMT |
| **Auth client** | `lib/auth.ts`, `guards.ts` | Sembunyikan menu; redirect |
| **API controllers** | `*.controller.ts` | HTTP, validasi DTO, auth |
| **API services** | `*.service.ts` | Aturan bisnis (duplikat slip, stok ≤ qty) |
| **DB** | `migrations/`, views | Schema + `vw_stock_mi` |
| **Jobs** | `jobs/` | Impor CSV/stocktaking terjadwal |

### 12.2 Guard contoh (pseudocode)

```ts
// apps/web/src/lib/guards.ts
function homeFor(user) {
  if (user.role === 'ADMIN') return '/admin';
  if (user.role === 'LEADER') return '/dashboard';
  if (user.can_mi) return '/trx/mi';
  if (user.can_ai) return '/trx/ai';
  if (user.can_smt) return '/trx/smt';
  return '/login';
}

function canOpen(path, user) {
  if (path.startsWith('/admin') && user.role !== 'ADMIN'
      && !(path.startsWith('/admin/export') && user.role === 'LEADER'))
    return false;
  if (path === '/trx/ai' && !user.can_ai) return false;
  if (path === '/trx/smt' && !user.can_smt) return false;
  if (path === '/trx/mi' && !user.can_mi) return false;
  return true;
}
```

### 12.3 Environment

```
# api/.env
DATABASE_URL=mysql://user:pass@localhost:3306/ep_stok_cs
JWT_SECRET=...
LOW_STOCK_THRESHOLD=10

# web/.env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

---

## 13. Keputusan desain penting

1. **Void > delete** — Undo Excel diganti void agar audit aman.
2. **Stok dihitung di server** — jangan percaya angka stok dari client.
3. **Lock saat issue** — wajib untuk ganti CSV.
4. **PIC = user master** — normalisasi string PIC CSV ke `mst_user`.
5. **Migrasi bertahap** — halaman AI/SMT/MI setara Excel; cutover per area.
6. **Cossy bukan blocker** — tidak ada di sistem sekarang; tambahkan hanya jika bisnis meminta CS Open.
7. **Dashboard ≠ layar operator** — operator di transaksi; dashboard untuk Leader/Admin.
8. **Menu by role** — operator tidak melihat Admin/Master; satu komponen form IN untuk AI & SMT.

---

## 14. Wire alur utama (target)

```mermaid
sequenceDiagram
  participant Op as Operator
  participant UI as Web UI
  participant API as Backend
  participant DB as MySQL

  Op->>UI: Scan Part No
  UI->>API: GET /parts/{partNo}/stock
  API->>DB: vw_stock_mi
  DB-->>API: name, line, total_stock
  API-->>UI: isi form

  Op->>UI: Qty + PIC + Simpan
  UI->>API: POST /mi-out
  API->>DB: BEGIN + lock + cek stok
  alt qty > stok
    API-->>UI: 409 Qty melebihi stok
  else ok
    API->>DB: INSERT trx_mi_out
    API->>DB: COMMIT
    API-->>UI: 201 + new_stock
    UI-->>Op: sukses, clear form (PIC tetap)
  end
```

---

*Dokumen B (TO-BE). Paket sinkron **1.0** · 2026-07-17 · pasangan: [`Spesifikasi_Desain_MI_Proses_Line_Rev05.md`](./Spesifikasi_Desain_MI_Proses_Line_Rev05.md) (Dokumen A · AS-IS). Perubahan aturan bisnis: update A dulu, lalu petakan di B, naikkan versi paket bersama.*
