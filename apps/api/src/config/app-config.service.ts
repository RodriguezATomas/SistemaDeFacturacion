import { Injectable } from '@nestjs/common';
import { Env, validateEnv } from './env.schema';

@Injectable()
export class AppConfigService {
  readonly env: Env;

  constructor() {
    this.env = validateEnv(process.env);
  }

  get isSaas(): boolean {
    return this.env.DEPLOYMENT_MODE === 'saas';
  }

  get isPrivate(): boolean {
    return this.env.DEPLOYMENT_MODE === 'private';
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }
}
