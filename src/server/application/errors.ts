/** Base for errors whose message is safe to show to the user. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "validation");
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super(`${what} not found`, "not_found");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Not signed in") {
    super(message, "unauthorized");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, "forbidden");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "conflict");
  }
}

/** Thrown inside a job when retrying cannot help, such as an unreadable upload. */
export class PermanentJobError extends AppError {
  constructor(message: string) {
    super(message, "permanent");
  }
}
