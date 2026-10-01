import { isServiceError, ServiceError, userMessage } from './errors';

describe('ServiceError', () => {
  it('carries a stable code and a user-facing message', () => {
    const error = new ServiceError('order.invalid_transition', 'This order was already cancelled.');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ServiceError');
    expect(error.code).toBe('order.invalid_transition');
    expect(isServiceError(error)).toBe(true);
  });

  it('does not treat other errors as service errors', () => {
    expect(isServiceError(new Error('boom'))).toBe(false);
    expect(isServiceError('boom')).toBe(false);
  });

  it('shows service messages and hides anything unexpected', () => {
    expect(userMessage(new ServiceError('not_found', 'This dish is no longer on the menu.'))).toBe(
      'This dish is no longer on the menu.',
    );
    expect(userMessage(new TypeError('x is undefined'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
