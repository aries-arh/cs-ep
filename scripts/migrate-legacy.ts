/**
 * Migrasi data lama (Excel/CSV) → database aplikasi web CS EP1.
 *
 * Urutan yang disarankan:
 *   1) npm run db:setup          (schema + user seed)
 *   2) npx tsx scripts/migrate-legacy.ts
 *
 * Default path mengarah ke folder sibling:
 *   ../00.Data_LINE.xlsx
 *   ../00.Data_Input R1/Data-AI *.csv
 *   ../00.Data_Input R1/Data-SMT *.csv
 *   ../00.Data_Input R1/Data-MI *.csv
 *
 * Opsi env:
 *   MIGRATE_LINE=path/ke/00.Data_LINE.xlsx
 *   MIGRATE_CSV_DIR=path/ke/00.Data_Input R1
 *   MIGRATE_STOCK_CSV=path/ke/stocktaking.csv   (opsional: Part No,QTY)
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ROOT = path.resolve(__dirname, "../..");
const LINE_XLSX =
  process.env.MIGRATE_LINE || path.join(ROOT, "00.Data_LINE.xlsx");
const CSV_DIR =
  process.env.MIGRATE_CSV_DIR || path.join(ROOT, "00.Data_Input R1");
const STOCK_CSV = process.env.MIGRATE_STOCK_CSV || "";

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function readCsv(filePath: string): string[][] {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseCsvLine);
}

function parseDate(v: string): Date | null {
  if (!v) return null;
  // 2026-07-01 10:13:34
  const iso = Date.parse(v.replace(" ", "T"));
  if (!Number.isNaN(iso)) return new Date(iso);
  // 7/3/2026 5:53
  const m = v.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (m) {
    const [, mo, d, y, hh = "0", mm = "0", ss = "0"] = m;
    return new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss)
    );
  }
  return null;
}

function extractNik(pic: string): string | null {
  if (!pic) return null;
  const m = pic.match(/^(\d{4,})/);
  if (m) return m[1];
  // nama saja → pakai nama sebagai nik-ish key
  const key = pic.trim().toUpperCase().replace(/\s+/g, "_").slice(0, 32);
  return key || null;
}

async function ensureUser(picRaw: string, passwordHash: string) {
  const nik = extractNik(picRaw);
  if (!nik) return null;
  const name =
    picRaw.includes(" - ")
      ? picRaw.split(" - ").slice(1).join(" - ").trim() || picRaw
      : picRaw;
  const existing = await prisma.mstUser.findUnique({ where: { nik } });
  if (existing) return existing;
  return prisma.mstUser.create({
    data: {
      nik,
      name: name.slice(0, 120),
      role: "OPERATOR",
      passwordHash,
      canAi: true,
      canSmt: true,
      canMi: true,
      isActive: true,
    },
  });
}

async function ensureLine(code: string | null | undefined) {
  if (!code || !String(code).trim()) return null;
  const c = String(code).trim();
  return prisma.mstLine.upsert({
    where: { code: c },
    update: {},
    create: { code: c, name: c },
  });
}

async function ensurePart(partNo: string, partName: string, lineCode?: string | null) {
  const line = await ensureLine(lineCode);
  return prisma.mstPart.upsert({
    where: { partNo },
    update: {
      partName: partName || partNo,
      ...(line ? { lineId: line.id } : {}),
      isActive: true,
    },
    create: {
      partNo,
      partName: partName || partNo,
      lineId: line?.id ?? null,
    },
  });
}

async function migrateDataLine() {
  console.log("\n=== 1) Master Part dari 00.Data_LINE.xlsx ===");
  if (!fs.existsSync(LINE_XLSX)) {
    console.warn("SKIP: file tidak ada:", LINE_XLSX);
    return { parts: 0 };
  }

  // dynamic import agar tidak wajib jika file hilang
  const openpyxlMissing = false;
  let rows: { partNo: string; partName: string; line: string | null }[] = [];

  try {
    // gunakan exceljs-free path via python fallback? Prefer xlsx package.
    // Install on the fly not ideal — parse with child process python openpyxl we know works.
    const { execFileSync } = await import("child_process");
    const py = `
import openpyxl, json
wb=openpyxl.load_workbook(r'''${LINE_XLSX.replace(/\\/g, "\\\\")}''', data_only=True)
ws=wb.active
out=[]
for i,row in enumerate(ws.iter_rows(values_only=True)):
    if i==0: continue
    if not row or not row[0]: continue
    out.append({"partNo": str(row[0]).strip(), "partName": str(row[1] or "").strip(), "line": (str(row[3]).strip() if row[3] else None)})
print(json.dumps(out))
`;
    const out = execFileSync("python", ["-c", py], { encoding: "utf8", maxBuffer: 50_000_000 });
    rows = JSON.parse(out);
  } catch (e) {
    console.error("Gagal baca Data_LINE.xlsx:", e);
    if (openpyxlMissing) return { parts: 0 };
    return { parts: 0 };
  }

  let n = 0;
  for (const r of rows) {
    if (!r.partNo) continue;
    await ensurePart(r.partNo, r.partName, r.line);
    n++;
  }
  console.log(`OK: ${n} part diimpor/diupdate`);
  return { parts: n };
}

async function migrateStockCsv() {
  console.log("\n=== 2) Stocktaking baseline (opsional) ===");
  if (!STOCK_CSV || !fs.existsSync(STOCK_CSV)) {
    console.warn(
      "SKIP: set MIGRATE_STOCK_CSV=file.csv (header: Part No,QTY) untuk baseline stok"
    );
    return { stock: 0 };
  }
  const rows = readCsv(STOCK_CSV);
  const header = rows[0].map((h) => h.toLowerCase());
  const iPart = header.findIndex((h) => h.includes("part"));
  const iQty = header.findIndex((h) => h.includes("qty") || h.includes("stock"));
  if (iPart < 0 || iQty < 0) {
    console.warn("SKIP: header harus mengandung Part No dan QTY");
    return { stock: 0 };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let n = 0;
  for (const r of rows.slice(1)) {
    const partNo = r[iPart]?.trim();
    const qty = Number(r[iQty]);
    if (!partNo || !Number.isFinite(qty)) continue;
    const part = await prisma.mstPart.findUnique({ where: { partNo } });
    if (!part) {
      await ensurePart(partNo, partNo, null);
    }
    const p = await prisma.mstPart.findUniqueOrThrow({ where: { partNo } });
    await prisma.trxStocktakingBal.upsert({
      where: { uk_part_date: { partId: p.id, stockDate: today } },
      update: { qty, sourceFile: path.basename(STOCK_CSV) },
      create: {
        partId: p.id,
        stockDate: today,
        qty,
        sourceFile: path.basename(STOCK_CSV),
      },
    });
    n++;
  }
  console.log(`OK: ${n} baris stocktaking`);
  return { stock: n };
}

async function migrateInFiles(passwordHash: string) {
  console.log("\n=== 3) Transaksi IN (Data-AI / Data-SMT) ===");
  if (!fs.existsSync(CSV_DIR)) {
    console.warn("SKIP: folder CSV tidak ada:", CSV_DIR);
    return { ai: 0, smt: 0 };
  }
  const files = fs.readdirSync(CSV_DIR).filter((f) => f.toLowerCase().endsWith(".csv"));
  let ai = 0;
  let smt = 0;

  for (const file of files) {
    const upper = file.toUpperCase();
    let source: "AI" | "SMT" | null = null;
    if (upper.includes("DATA-AI") || (upper.includes("AI") && !upper.includes("SMT") && !upper.includes("MI")))
      source = "AI";
    if (upper.includes("DATA-SMT") || (upper.includes("SMT") && !upper.includes("MI")))
      source = "SMT";
    // prefer explicit names
    if (file.startsWith("Data-AI")) source = "AI";
    if (file.startsWith("Data-SMT")) source = "SMT";
    if (!source) continue;

    const full = path.join(CSV_DIR, file);
    const rows = readCsv(full);
    if (rows.length < 2) continue;
    const header = rows[0].map((h) => h.toLowerCase());
    const col = (names: string[]) =>
      header.findIndex((h) => names.some((n) => h === n || h.includes(n)));

    const iSlip = col(["no slip", "slip"]);
    const iPart = col(["part no"]);
    const iName = col(["part name"]);
    const iQty = col(["slip qty", "qty"]);
    const iLoc = col(["to location", "to loc"]);
    const iPic = col(["pic"]);
    const iCat = col(["catatan"]);
    const iTs = col(["timestamp"]);

    console.log(`  → ${file} as ${source}`);
    for (const r of rows.slice(1)) {
      const noSlip = (r[iSlip] || "").trim();
      const partNo = (r[iPart] || "").trim();
      const partName = (r[iName] || "").trim();
      const qty = Number(r[iQty]);
      const toLocation = (r[iLoc] || "WC02").trim() || "WC02";
      const picRaw = (r[iPic] || "").trim();
      const catatan = iCat >= 0 ? r[iCat] || null : null;
      const trxAt = parseDate(r[iTs] || "") || new Date();
      if (!noSlip || !partNo || !Number.isFinite(qty)) continue;

      const part = await ensurePart(partNo, partName);
      const pic = await ensureUser(picRaw, passwordHash);

      const exists = await prisma.trxMiIn.findUnique({
        where: { uk_source_slip: { source, noSlip } },
      });
      if (exists) continue;

      await prisma.trxMiIn.create({
        data: {
          source,
          noSlip,
          partId: part.id,
          trxAt,
          qty,
          toLocation,
          catatan,
          picUserId: pic?.id ?? null,
          createdBy: pic?.id ?? null,
        },
      });
      if (source === "AI") ai++;
      else smt++;
    }
  }
  console.log(`OK: AI=${ai}, SMT=${smt}`);
  return { ai, smt };
}

async function migrateMiFiles(passwordHash: string) {
  console.log("\n=== 4) Transaksi OUT (Data-MI) ===");
  if (!fs.existsSync(CSV_DIR)) {
    console.warn("SKIP: folder CSV tidak ada:", CSV_DIR);
    return { mi: 0 };
  }
  const files = fs
    .readdirSync(CSV_DIR)
    .filter((f) => f.startsWith("Data-MI") && f.toLowerCase().endsWith(".csv"));

  let mi = 0;
  for (const file of files) {
    const full = path.join(CSV_DIR, file);
    const rows = readCsv(full);
    if (rows.length < 2) continue;
    const header = rows[0].map((h) => h.toLowerCase());
    const col = (names: string[]) =>
      header.findIndex((h) => names.some((n) => h === n || h.includes(n)));

    const iTs = col(["timestamp"]);
    const iPart = col(["part no"]);
    const iName = col(["part name"]);
    const iStok = col(["stok wip", "stok"]);
    const iQty = col(["qty out", "qty"]);
    const iLine = col(["line"]);
    const iPic = col(["pic"]);

    console.log(`  → ${file}`);
    for (const r of rows.slice(1)) {
      const partNo = (r[iPart] || "").trim();
      const partName = (r[iName] || "").trim();
      const qty = Number(r[iQty]);
      const lineCode = (r[iLine] || "").trim();
      const picRaw = (r[iPic] || "").trim();
      const trxAt = parseDate(r[iTs] || "") || new Date();
      const stockSnapshot =
        iStok >= 0 && r[iStok] !== "" ? Number(r[iStok]) : null;
      if (!partNo || !Number.isFinite(qty)) continue;

      const part = await ensurePart(partNo, partName, lineCode);
      const line = await ensureLine(lineCode);
      const pic = await ensureUser(picRaw, passwordHash);

      // hindari duplikat kasar: part+qty+timestamp sama
      const dup = await prisma.trxMiOut.findFirst({
        where: {
          partId: part.id,
          qty,
          trxAt,
          isVoid: false,
        },
      });
      if (dup) continue;

      await prisma.trxMiOut.create({
        data: {
          partId: part.id,
          trxAt,
          qty,
          stockSnapshot: Number.isFinite(stockSnapshot as number)
            ? (stockSnapshot as number)
            : null,
          lineId: line?.id ?? part.lineId,
          picUserId: pic?.id ?? null,
          createdBy: pic?.id ?? null,
        },
      });
      mi++;
    }
  }
  console.log(`OK: MI OUT=${mi}`);
  return { mi };
}

async function main() {
  console.log("Migrasi legacy → CS EP1 Web");
  console.log("LINE_XLSX =", LINE_XLSX);
  console.log("CSV_DIR    =", CSV_DIR);

  const passwordHash = await bcrypt.hash("operator123", 10);

  await migrateDataLine();
  await migrateStockCsv();
  await migrateInFiles(passwordHash);
  await migrateMiFiles(passwordHash);

  const counts = {
    parts: await prisma.mstPart.count(),
    users: await prisma.mstUser.count(),
    inRows: await prisma.trxMiIn.count(),
    outRows: await prisma.trxMiOut.count(),
    stock: await prisma.trxStocktakingBal.count(),
  };
  console.log("\n=== Selesai ===");
  console.log(counts);
  console.log(
    "Catatan: user yang dibuat dari PIC CSV password default = operator123 (ganti di Admin)."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
