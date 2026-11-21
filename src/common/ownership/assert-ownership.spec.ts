import { ForbiddenException } from '@nestjs/common';
import { assertOwnership } from './assert-ownership.js';

describe('assertOwnership', () => {
  it('no hace nada si el recurso es del usuario', () => {
    expect(() => assertOwnership('u1', 'u1')).not.toThrow();
  });

  it('responde 403 si el recurso es de otro usuario', () => {
    expect(() => assertOwnership('u2', 'u1')).toThrow(ForbiddenException);
  });
});