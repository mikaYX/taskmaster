import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
Promise.all([
  p.config.deleteMany({ where: { key: { startsWith: "auth.azureAd" } } }),
  p.config.deleteMany({ where: { key: { startsWith: "auth.google" } } })
]).then(console.log).finally(() => p.$disconnect());
