const bcrypt = require('bcryptjs');
const { env } = require('../src/core/config/env');
const { closePool } = require('../src/database/connection');
const { UserRepository } = require('../src/repositories/user.repository');
const { RoleRepository } = require('../src/repositories/role.repository');

const seed = async () => {
  const fullName = process.env.ADMIN_FULL_NAME;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const roleUid = process.env.ADMIN_ROLE_UID || '00000000-0000-4000-8000-000000000001';
  if (!fullName || !email || !password || password.length < 8) {
    throw new Error('ADMIN_FULL_NAME, ADMIN_EMAIL, and a strong ADMIN_PASSWORD are required.');
  }
  const users = new UserRepository();
  const roles = new RoleRepository();
  if (await users.findByEmail(email)) throw new Error('The administrator email already exists.');
  const role = await roles.findByUid(roleUid);
  if (!role) throw new Error('ADMIN_ROLE_UID does not exist. Run the database schema first.');
  const passwordHash = await bcrypt.hash(password, env.auth.bcryptRounds);
  const user = await users.create({
    roleUid, fullName: fullName.trim(), email, passwordHash,
    emailVerified: true, emailVerifiedAt: new Date(), isActive: true, isDeleted: false,
  });
  console.log(`Administrator created: ${user.email} (${user.userUid})`);
};

seed()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(closePool);
