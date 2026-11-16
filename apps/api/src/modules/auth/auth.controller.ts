import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import {
  AllowInactiveSubscription,
  CurrentAuth,
  NoCompanyRequired,
  Public,
  ReqMeta,
} from '../../common/decorators/auth.decorators';
import { AppConfigService } from '../../config/app-config.service';
import { AuthService, SessionResult } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  SwitchCompanyDto,
  UpdateProfileDto,
} from './dto/auth.dto';

export const REFRESH_COOKIE = 'fx_rt';
const COOKIE_PATH = '/api/auth';

@ApiTags('Autenticación')
@Controller('auth')
@AllowInactiveSubscription()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Registro de usuario y empresa (solo SaaS)' })
  async register(
    @Body() dto: RegisterDto,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.register(dto, meta));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.login(dto, meta));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renueva el access token usando la cookie httpOnly de refresh' })
  async refresh(
    @Req() req: Request,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      return this.respond(res, await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], meta));
    } catch (err) {
      this.clearCookie(res);
      throw err;
    }
  }

  @ApiBearerAuth()
  @NoCompanyRequired()
  @Post('switch-company')
  @HttpCode(200)
  async switchCompany(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: SwitchCompanyDto,
    @Req() req: Request,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.switchCompany(
      auth,
      dto.companyId,
      req.cookies?.[REFRESH_COOKIE],
      meta,
    );
    return this.respond(res, result);
  }

  @ApiBearerAuth()
  @NoCompanyRequired()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(auth, meta);
    this.clearCookie(res);
  }

  @ApiBearerAuth()
  @NoCompanyRequired()
  @Get('me')
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.me(auth);
  }

  @ApiBearerAuth()
  @NoCompanyRequired()
  @Patch('me')
  updateProfile(@CurrentAuth() auth: AuthContext, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(auth, dto);
  }

  @ApiBearerAuth()
  @NoCompanyRequired()
  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ChangePasswordDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.auth.changePassword(auth, dto, meta);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @ReqMeta() meta: RequestMeta) {
    await this.auth.forgotPassword(dto.email, meta);
    return { message: 'Si el email está registrado, recibirá instrucciones para restablecer la contraseña.' };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body() dto: ResetPasswordDto, @ReqMeta() meta: RequestMeta) {
    await this.auth.resetPassword(dto, meta);
  }

  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Configuración pública (modalidad de despliegue)' })
  publicConfig() {
    return {
      deploymentMode: this.config.env.DEPLOYMENT_MODE,
      registrationEnabled: this.config.isSaas,
    };
  }

  private respond(res: Response, session: SessionResult) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires: session.refreshExpiresAt,
    });
    return { accessToken: session.accessToken, activeCompanyId: session.activeCompanyId };
  }

  private clearCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }
}
