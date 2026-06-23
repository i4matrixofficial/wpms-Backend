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

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,
    private config: ConfigService,
    @InjectRepository(RefreshToken)
    private refreshRepo: Repository<RefreshToken>,
  ) {}

  async register(dto: RegisterDto) {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.users.create({
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
    if (!user) throw new UnauthorizedException('Session expired');
    return this.issueTokens(user); // rotates: issues a new pair, replaces stored hash
  }

  async logout(userId: string) {
    await this.refreshRepo.delete({ userId });
    return { loggedOut: true };
  }

  private async issueTokens(user: { id: string; email: string; role: Role }) {
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

    return {
      user: { id: user.id, email: user.email, role: user.role },
      accessToken,
      refreshToken,
    };
  }
}
