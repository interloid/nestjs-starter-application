import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../config/env.validation';

@Injectable()
export class VersionService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get info() {
    return {
      commit: this.config.get('GIT_COMMIT', { infer: true }),
      buildTime: this.config.get('BUILD_TIME', { infer: true }),
    };
  }
}
