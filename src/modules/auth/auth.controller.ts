import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ZodBody } from '../../common/decorators/zod-schema.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RegisterSchema, type RegisterDto } from './dto/register.dto';
import { LoginSchema, type LoginDto } from './dto/login.dto';
import { RefreshSchema, type RefreshDto } from './dto/refresh.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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

  @Get('me') // protected — proves the guard works
  me(@CurrentUser() user: unknown) {
    return user;
  }
}
