import 'dotenv/config';
import * as argon2 from 'argon2';
import dataSource from '../data-source';
import { User } from '../../modules/users/entities/user.entity';
import { Role } from '../../common/enums/role.enum';

async function seed() {
  await dataSource.initialize();
  console.log('DB connected');

  const userRepo = dataSource.getRepository(User);

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@wpms.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin12345';

  const existing = await userRepo.findOne({ where: { email: adminEmail } });
  if (existing) {
    console.log(`Admin ${adminEmail} already exists — skipping`);
  } else {
    const admin = userRepo.create({
      fullName: 'Platform Admin',
      email: adminEmail,
      passwordHash: await argon2.hash(adminPassword),
      roles: [Role.ADMIN],
    });
    await userRepo.save(admin);
    console.log(`Admin created: ${adminEmail} / ${adminPassword}`);
  }

  await dataSource.destroy();
  console.log('Done');
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
