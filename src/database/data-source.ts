import 'dotenv/config';
import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/**/*.entity.ts'], // finds every *.entity.ts across modules
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
