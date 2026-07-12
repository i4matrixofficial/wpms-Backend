import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ZodBody } from '../../common/decorators/zod-schema.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RegisterSchema, type RegisterDto } from './dto/register.dto';
import { LoginSchema, type LoginDto } from './dto/login.dto';
import { RefreshSchema, type RefreshDto } from './dto/refresh.dto';
import { StorageService } from '../storage/storage.service';
import {
  ForgotPasswordSchema,
  VerifyOtpSchema,
  ResetPasswordSchema,
} from './dto/password-reset.dto';
import type {
  ForgotPasswordDto,
  VerifyOtpDto,
  ResetPasswordDto,
} from './dto/password-reset.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Post('register')
  @ZodBody(RegisterSchema)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @ZodBody(LoginSchema)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @ZodBody(RefreshSchema)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout') // protected — needs a valid access token
  logout(@CurrentUser() user: { userId: string }) {
    return this.auth.logout(user.userId);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordSchema)) dto: ForgotPasswordDto,
  ) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Post('verify-otp')
  verifyOtp(@Body(new ZodValidationPipe(VerifyOtpSchema)) dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.email, dto.code);
  }

  @Public()
  @Post('reset-password')
  resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordSchema)) dto: ResetPasswordDto,
  ) {
    return this.auth.resetPassword(dto.resetToken, dto.newPassword);
  }

  @Public()
  @Get('storage-check')
  async storageCheck() {
    const key = 'healthcheck/test.txt';
    await this.storage.upload(key, Buffer.from('hello minio'), 'text/plain');
    const url = await this.storage.getPresignedUrl(key, 120);
    return { uploaded: key, viewUrl: url };
  }

  @Get('me')
  me(@CurrentUser() user: { userId: string }) {
    return this.auth.getProfile(user.userId); // live DB lookup, includes workerStatus
  }
}
