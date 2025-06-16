// const { PrismaClient } = require('@prisma/client');
// const prisma = new PrismaClient();
const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();
module.exports = prisma;