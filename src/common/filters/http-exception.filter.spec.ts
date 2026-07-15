import { ArgumentsHost } from '@nestjs/common';
import { BusinessException } from '../errors/business-error';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  it('preserves structured AI error code, message and retryability', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/v1/ai/generate-email-v2' }),
      }),
    } as unknown as ArgumentsHost;

    new HttpExceptionFilter().catch(
      new BusinessException(
        'AI_PROVIDER_RATE_LIMIT',
        'Le service de rédaction est temporairement saturé.',
        true,
        429,
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Le service de rédaction est temporairement saturé.',
        error: {
          code: 'AI_PROVIDER_RATE_LIMIT',
          message: 'Le service de rédaction est temporairement saturé.',
          retryable: true,
        },
      }),
    );
  });
});
