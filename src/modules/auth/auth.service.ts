import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { Role } from '../../common/enums/role.enum';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';
import { WorkersService } from '../workers/workers.service';
import { WorkerStatus } from '../workers/entities/worker.entity';
import { randomInt } from 'crypto';
import { PasswordReset } from './entities/password-reset.entity';
import { MailService } from '../mail/mail.service';
@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private workers: WorkersService,
    private jwt: JwtService,
    private config: ConfigService,
    @InjectRepository(RefreshToken)
    private refreshRepo: Repository<RefreshToken>,
    @InjectRepository(PasswordReset)
    private resetRepo: Repository<PasswordReset>,
    private mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.users.create({
      fullName: dto.fullName,
      email: dto.email,
      passwordHash,
      role: dto.role as Role,
    });
    return this.issueTokens(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive)
      throw new UnauthorizedException('Account is deactivated');
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const row = await this.refreshRepo.findOne({
      where: { userId: payload.sub },
    });

    if (!row || !(await argon2.verify(row.tokenHash, refreshToken))) {
      throw new UnauthorizedException('Session expired');
    }
    const user = await this.users.findById(payload.sub);
    if (!user || !user.isActive)
      throw new UnauthorizedException('Session expired');
    return this.issueTokens(user); // rotates: issues a new pair, replaces stored hash
  }

  async logout(userId: string) {
    await this.refreshRepo.delete({ userId });
    return { loggedOut: true };
  }

  private async issueTokens(user: User) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN'),
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id },
      {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN'),
      },
    );
    const tokenHash = await argon2.hash(refreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.refreshRepo.upsert({ userId: user.id, tokenHash, expiresAt }, [
      'userId',
    ]);

    const workerStatus =
      user.role === Role.WORKER ? await this.workers.getStatus(user.id) : null;

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
        workerStatus, // ← null for customer/admin, status for worker
      },
      accessToken,
      refreshToken,
    };
  }

  async getProfile(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');

    const workerStatus =
      user.role === Role.WORKER ? await this.workers.getStatus(userId) : null;

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      workerStatus,
    };
  }

  // --- 1. request a code ---
  async forgotPassword(email: string) {
    const user = await this.users.findByEmail(email);
    // ALWAYS return success — never reveal if the email exists
    if (user) {
      const code = randomInt(100000, 1000000).toString(); // 6 digits
      const codeHash = await argon2.hash(code);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      await this.resetRepo.upsert(
        { userId: user.id, codeHash, expiresAt, attempts: 0, verified: false },
        ['userId'],
      );
      await this.mail.sendOtp(email, code);
    }
    return { message: 'If that email exists, a reset code has been sent.' };
  }

  // --- 2. verify the code, issue a reset token ---
  async verifyOtp(email: string, code: string) {
    const user = await this.users.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid code');

    const reset = await this.resetRepo.findOne({ where: { userId: user.id } });
    if (!reset) throw new UnauthorizedException('Invalid code');
    if (reset.expiresAt < new Date())
      throw new UnauthorizedException('Code expired');
    if (reset.attempts >= 5)
      throw new UnauthorizedException('Too many attempts, request a new code');

    const ok = await argon2.verify(reset.codeHash, code);
    if (!ok) {
      reset.attempts += 1;
      await this.resetRepo.save(reset);
      throw new UnauthorizedException('Invalid code');
    }

    reset.verified = true;
    await this.resetRepo.save(reset);

    // short-lived token proving OTP passed — used in step 3
    const resetToken = await this.jwt.signAsync(
      { sub: user.id, purpose: 'password_reset' },
      { secret: this.config.get('JWT_SECRET'), expiresIn: '10m' },
    );
    return { resetToken };
  }

  // --- 3. set the new password ---
  async resetPassword(resetToken: string, newPassword: string) {
    let payload: { sub: string; purpose: string };
    try {
      payload = await this.jwt.verifyAsync(resetToken, {
        secret: this.config.get('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    if (payload.purpose !== 'password_reset')
      throw new UnauthorizedException('Invalid reset token');

    const reset = await this.resetRepo.findOne({
      where: { userId: payload.sub },
    });
    if (!reset || !reset.verified)
      throw new UnauthorizedException('OTP not verified');

    const passwordHash = await argon2.hash(newPassword);
    await this.users.updatePassword(payload.sub, passwordHash); // see note below

    // clean up: delete the OTP + kill all refresh sessions (force re-login everywhere)
    await this.resetRepo.delete({ userId: payload.sub });
    await this.refreshRepo.delete({ userId: payload.sub });

    return { message: 'Password reset successful' };
  }
}
