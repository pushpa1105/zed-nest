import { Logger, NotFoundException, type ArgumentsHost } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../shared/errors/index.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function mockHost() {
  const res = {
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const req = { id: 'req-1', method: 'GET', url: '/api/v1/x', originalUrl: '/api/v1/x' };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  beforeAll(() => Logger.overrideLogger(false)); // expected 500s would otherwise spam the output
  afterAll(() => Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose']));

  it('maps AppError kinds to status codes with a problem+json body', () => {
    const { host, res } = mockHost();
    filter.catch(new NotFoundError('Thing 1 not found', 'THING_NOT_FOUND'), host);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.type).toHaveBeenCalledWith('application/problem+json');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 404,
        code: 'THING_NOT_FOUND',
        detail: 'Thing 1 not found',
        requestId: 'req-1',
        instance: '/api/v1/x',
      }),
    );
  });

  it('includes field errors for validation failures', () => {
    const { host, res } = mockHost();
    filter.catch(new ValidationError([{ path: 'email', message: 'Invalid email' }]), host);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'email', message: 'Invalid email' }],
      }),
    );
  });

  it('translates database unique violations to 409', () => {
    const { host, res } = mockHost();
    filter.catch(Object.assign(new Error('dup'), { code: '23505', constraint: 'x_key' }), host);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('keeps Nest HttpExceptions', () => {
    const { host, res } = mockHost();
    filter.catch(new NotFoundException('Cannot GET /nope'), host);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('hides internal details of unknown errors', () => {
    const { host, res } = mockHost();
    filter.catch(new Error('secret connection string leaked'), host);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INTERNAL_ERROR', detail: 'An unexpected error occurred' }),
    );
  });
});
