import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { safeEqual } from '../common/safe-equal.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  login(username: string, password: string): { accessToken: string } {
    const expectedUser = this.config.getOrThrow<string>('AUTH_USERNAME');
    const expectedPassword = this.config.getOrThrow<string>('AUTH_PASSWORD');

    const userOk = safeEqual(username, expectedUser);
    const passwordOk = safeEqual(password, expectedPassword);
    if (!userOk || !passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      accessToken: this.jwt.sign({ sub: username }),
    };
  }
}
