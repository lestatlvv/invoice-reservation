import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const config = {
    getOrThrow: (key: string) => {
      if (key === 'AUTH_USERNAME') return 'operator';
      if (key === 'AUTH_PASSWORD') return 'changeme';
      throw new Error(key);
    },
  } as unknown as ConfigService;

  const jwt = {
    sign: (payload: unknown) => JSON.stringify(payload),
  } as unknown as JwtService;

  const auth = new AuthService(jwt, config);

  it('issues a token for valid credentials', () => {
    expect(auth.login('operator', 'changeme')).toEqual({
      accessToken: JSON.stringify({ sub: 'operator' }),
    });
  });

  it('rejects invalid credentials', () => {
    expect(() => auth.login('operator', 'nope')).toThrow(UnauthorizedException);
  });
});
