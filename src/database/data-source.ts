import 'reflect-metadata';
import { DataSource } from 'typeorm';

/**
 * CLI data source for migrations.
 * Ensure DATABASE_URL is set in the environment.
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
