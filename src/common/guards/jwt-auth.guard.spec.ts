import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as passport from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

function mockContext(): ExecutionContext {
  return {
    getHandler: jest.fn(() => 'handlerRef'),
    getClass: jest.fn(() => 'classRef'),
    switchToHttp: jest.fn(),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new JwtAuthGuard(reflector as unknown as Reflector);
  });

  afterEach(() => jest.restoreAllMocks());

  it('allows the request without auth when the route is @Public()', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true); // @Public present
    const ctx = mockContext();

    const superSpy = jest
      .spyOn(passport.AuthGuard('jwt').prototype as { canActivate: jest.Mock }, 'canActivate')
      .mockReturnValue(false);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(superSpy).not.toHaveBeenCalled();
  });

  it('queries the reflector on both handler and class', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true);
    const ctx = mockContext();

    guard.canActivate(ctx);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      'handlerRef',
      'classRef',
    ]);
  });

  it('delegates to super.canActivate when the route is not public', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false); // not public
    const ctx = mockContext();

    const superSpy = jest
      .spyOn(passport.AuthGuard('jwt').prototype as { canActivate: jest.Mock }, 'canActivate')
      .mockReturnValue(true);

    const result = guard.canActivate(ctx);

    expect(superSpy).toHaveBeenCalledWith(ctx);
    expect(result).toBe(true);
  });

  it('delegates and returns false when super rejects', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(undefined); // no @Public metadata
    const ctx = mockContext();

    jest
      .spyOn(passport.AuthGuard('jwt').prototype as { canActivate: jest.Mock }, 'canActivate')
      .mockReturnValue(false);

    expect(guard.canActivate(ctx)).toBe(false);
  });
});
