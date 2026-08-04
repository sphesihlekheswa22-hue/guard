const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const userCount = await prisma.user.count();
  const reportCount = await prisma.report.count();
  console.log("user count:", userCount);
  console.log("report count:", reportCount);

  const tables = await prisma.$queryRawUnsafe(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  console.log("tables:", tables.map((t) => t.tablename).join(", "));
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
