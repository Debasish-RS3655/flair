// prisma client
// Debashish Buragohain


// MIGRATION: prisma v7 migration syntax
// till late, v7 does not support MongoDB
// import { PrismaClient } from '../../generated/prisma/client.js';
// import { PrismaPg } from '@prisma/adapter-pg';
// const adapter = new PrismaPg({ 
//   connectionString: process.env.DATABASE_URL 
// });
// export const prisma = new PrismaClient({ adapter });

// v6 migration syntax
import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient();