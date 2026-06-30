export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`Không tìm thấy ${resource.toLowerCase()}`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class SoldOutError extends AppError {
  constructor() {
    super('Vé đã hết. Xin lỗi vì sự bất tiện này!', 409, 'SOLD_OUT');
  }
}

export class HoldExpiredError extends AppError {
  constructor() {
    super('Thời gian giữ vé đã hết. Vui lòng chọn vé lại.', 410, 'HOLD_EXPIRED');
  }
}

export class HoldNotFoundError extends AppError {
  constructor() {
    super('Không tìm thấy vé đang giữ. Vui lòng thử lại.', 404, 'HOLD_NOT_FOUND');
  }
}
