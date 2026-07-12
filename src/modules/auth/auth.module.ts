import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshToken } from './entities/refresh-token.entity';
import { UsersModule } from '../users/users.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkersModule } from '../workers/workers.module';
import { PasswordReset } from './entities/password-reset.entity';

@Module({
  imports: [
    UsersModule,
    WorkersModule,
    TypeOrmModule.forFeature([RefreshToken, PasswordReset]),
    PassportModule,
    JwtModule.register({}), // secrets passed per-sign, so empty here
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard }, // 1st: authenticate
    { provide: APP_GUARD, useClass: RolesGuard }, // 2nd: check role
  ],
  exports: [AuthService],
})
export class AuthModule {}
