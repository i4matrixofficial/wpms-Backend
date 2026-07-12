import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ZodApiBody } from '../../common/swagger/zod-api-body';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RegisterSchema } from './dto/register.dto';
import type { RegisterDto } from './dto/register.dto';
import { LoginSchema } from './dto/login.dto';
import type { LoginDto } from './dto/login.dto';
import { RefreshSchema } from './dto/refresh.dto';
import type { RefreshDto } from './dto/refresh.dto';
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

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Public()
  @ApiOperation({
    summary: 'Register a new account',
    description:
      'Creates a customer or worker account and returns the user profile plus access & refresh tokens. Admin accounts cannot be self-registered.',
  })
  @ZodApiBody(RegisterSchema)
  @ApiResponse({ status: 201, description: 'Account created, tokens returned' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  register(@Body(new ZodValidationPipe(RegisterSchema)) dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @Public()
  @ApiOperation({
    summary: 'Log in',
    description:
      'Authenticates with email and password. Returns the user (including worker verification status) and a new access/refresh token pair.',
  })
  @ZodApiBody(LoginSchema)
  @ApiResponse({ status: 201, description: 'Logged in, tokens returned' })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or account deactivated',
  })
  login(@Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @Public()
  @ApiOperation({
    summary: 'Refresh tokens',
    description:
      'Exchanges a valid refresh token for a new access & refresh pair (rotation). The old refresh token is invalidated.',
  })
  @ZodApiBody(RefreshSchema)
  @ApiResponse({ status: 201, description: 'New token pair issued' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  refresh(@Body(new ZodValidationPipe(RefreshSchema)) dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Log out',
    description:
      "Revokes the current user's refresh session. The access token remains valid until it expires (~15 min).",
  })
  @ApiResponse({ status: 201, description: 'Logged out' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  logout(@CurrentUser() user: { userId: string }) {
    return this.auth.logout(user.userId);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user',
    description:
      'Returns the live profile of the authenticated user, including worker verification status (null for customers/admins). Reads fresh from the database.',
  })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or account inactive',
  })
  me(@CurrentUser() user: { userId: string }) {
    return this.auth.getProfile(user.userId);
  }

  @Post('forgot-password')
  @Public()
  @ApiOperation({
    summary: 'Request a password reset code',
    description:
      'Sends a 6-digit OTP to the email if an account exists. Always returns success (never reveals whether the email is registered).',
  })
  @ZodApiBody(ForgotPasswordSchema)
  @ApiResponse({
    status: 201,
    description: 'Reset code sent if the email exists',
  })
  forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordSchema)) dto: ForgotPasswordDto,
  ) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('verify-otp')
  @Public()
  @ApiOperation({
    summary: 'Verify the reset code',
    description:
      'Verifies the 6-digit OTP. On success returns a short-lived reset token used to set a new password. Codes expire in 10 minutes and lock after 5 wrong attempts.',
  })
  @ZodApiBody(VerifyOtpSchema)
  @ApiResponse({ status: 201, description: 'Code valid, reset token returned' })
  @ApiResponse({
    status: 401,
    description: 'Invalid, expired, or too many attempts',
  })
  verifyOtp(@Body(new ZodValidationPipe(VerifyOtpSchema)) dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.email, dto.code);
  }

  @Post('reset-password')
  @Public()
  @ApiOperation({
    summary: 'Set a new password',
    description:
      'Sets a new password using the reset token from verify-otp. Invalidates the OTP and logs the user out of all sessions.',
  })
  @ZodApiBody(ResetPasswordSchema)
  @ApiResponse({ status: 201, description: 'Password reset successful' })
  @ApiResponse({
    status: 401,
    description: 'Invalid reset token or OTP not verified',
  })
  resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordSchema)) dto: ResetPasswordDto,
  ) {
    return this.auth.resetPassword(dto.resetToken, dto.newPassword);
  }
}
