import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  await prisma.appSetting.upsert({
    where: { key: "LOW_STOCK_THRESHOLD" },
    update: { value: "10" },
    create: { key: "LOW_STOCK_THRESHOLD", value: "10" },
  });

  const lines = ["LINE 1", "LINE 2", "LINE 3", "LINE 4", "LINE 5", "LINE 7", "LINE MIC"];
  for (const code of lines) {
    await prisma.mstLine.upsert({
      where: { code },
      update: {},
      create: { code, name: code },
    });
  }

  await prisma.mstLocation.upsert({
    where: { code: "WC02" },
    update: {},
    create: { code: "WC02", name: "Work Center 02" },
  });

  const line3 = await prisma.mstLine.findUniqueOrThrow({ where: { code: "LINE 3" } });
  const line1 = await prisma.mstLine.findUniqueOrThrow({ where: { code: "LINE 1" } });
  const line7 = await prisma.mstLine.findUniqueOrThrow({ where: { code: "LINE 7" } });

  const sampleParts = [
    { partNo: "VEP895C", partName: "PCB ASSY DM SMT-A 000963", lineId: line3.id, stok: 200 },
    { partNo: "VJG023B", partName: "PCB ASSY HACOM SMT-B TF5,TF3,TF1,TF-RAC", lineId: line7.id, stok: 187 },
    { partNo: "WF4623E", partName: "PCB ASSY 88L YMMA 88L AVK", lineId: line1.id, stok: 250 },
    { partNo: "WF4624E", partName: "PCB ASSY 88M YMMA 88M AVK", lineId: line1.id, stok: 1800 },
    { partNo: "VAZ851C", partName: "PCB DML SMT-A 000513 : KYOUTUU", lineId: line3.id, stok: 300 },
    { partNo: "VCQ283D", partName: "PCB ASSY JK RADIAL 000139", lineId: line3.id, stok: 1030 },
  ];

  for (const p of sampleParts) {
    const part = await prisma.mstPart.upsert({
      where: { partNo: p.partNo },
      update: { partName: p.partName, lineId: p.lineId },
      create: { partNo: p.partNo, partName: p.partName, lineId: p.lineId },
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.trxStocktakingBal.upsert({
      where: { uk_part_date: { partId: part.id, stockDate: today } },
      update: { qty: p.stok },
      create: { partId: part.id, stockDate: today, qty: p.stok, sourceFile: "seed" },
    });
  }

  await prisma.mstUser.upsert({
    where: { nik: "admin" },
    update: { passwordHash, role: "ADMIN", canAi: true, canSmt: true, canMi: true },
    create: {
      nik: "admin",
      name: "Administrator",
      role: "ADMIN",
      passwordHash,
      canAi: true,
      canSmt: true,
      canMi: true,
    },
  });

  const opHash = await bcrypt.hash("operator123", 10);
  await prisma.mstUser.upsert({
    where: { nik: "3009999" },
    update: {},
    create: {
      nik: "3009999",
      name: "DIAN WAHYUNI",
      role: "OPERATOR",
      passwordHash: opHash,
      canMi: true,
    },
  });
  await prisma.mstUser.upsert({
    where: { nik: "ai01" },
    update: {},
    create: {
      nik: "ai01",
      name: "NUNUNG",
      role: "OPERATOR",
      passwordHash: opHash,
      canAi: true,
    },
  });
  await prisma.mstUser.upsert({
    where: { nik: "smt01" },
    update: {},
    create: {
      nik: "smt01",
      name: "MARZA",
      role: "OPERATOR",
      passwordHash: opHash,
      canSmt: true,
    },
  });
  await prisma.mstUser.upsert({
    where: { nik: "leader" },
    update: {},
    create: {
      nik: "leader",
      name: "Leader CS",
      role: "LEADER",
      passwordHash: opHash,
      canAi: true,
      canSmt: true,
      canMi: true,
    },
  });

  console.log("Seed OK");
  console.log("Login admin / admin123");
  console.log("Login 3009999 / operator123 (MI)");
  console.log("Login ai01 / operator123 (AI)");
  console.log("Login smt01 / operator123 (SMT)");
  console.log("Login leader / operator123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
