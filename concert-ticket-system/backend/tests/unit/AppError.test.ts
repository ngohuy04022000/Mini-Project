import {
  AppError,
  NotFoundError,
  ConflictError,
  ValidationError,
  SoldOutError,
  HoldExpiredError,
  HoldNotFoundError,
} from '../../src/utils/AppError';

describe('AppError classes', () => {
  it('AppError should have correct properties', () => {
    const err = new AppError('Test error', 500, 'TEST_CODE');
    expect(err.message).toBe('Test error');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('TEST_CODE');
    expect(err.isOperational).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('NotFoundError should return 404', () => {
    const err = new NotFoundError('Vé');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toContain('Không tìm thấy');
    expect(err.message).toContain('vé');
  });

  it('ConflictError should return 409', () => {
    const err = new ConflictError('Already exists');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });

  it('ValidationError should return 400', () => {
    const err = new ValidationError('Invalid input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('SoldOutError should return 409 with correct Vietnamese message', () => {
    const err = new SoldOutError();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('SOLD_OUT');
    expect(err.message).toContain('hết');
  });

  it('HoldExpiredError should return 410', () => {
    const err = new HoldExpiredError();
    expect(err.statusCode).toBe(410);
    expect(err.code).toBe('HOLD_EXPIRED');
  });

  it('HoldNotFoundError should return 404', () => {
    const err = new HoldNotFoundError();
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('HOLD_NOT_FOUND');
  });
});
