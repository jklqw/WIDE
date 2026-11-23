// Idempotent seed: ensures the database schema is migrated and a
// demonstration user exists for local development.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@webide.local";
  const emailNorm = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { emailNorm } });
  if (!existing) {
    // Placeholder hash — real users register through the API which hashes
    // passwords with Argon2id. This demo account cannot log in until its
    // password is set via the register flow with the same email.
    await prisma.user.create({
      data: {
        email,
        emailNorm,
        passwordHash: "!locked",
        displayName: "Demo User",
      },
    });
    console.log("seeded demo user (login disabled — register via API)");
  } else {
    console.log("demo user already exists");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
