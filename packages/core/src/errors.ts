export class CompanionError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CompanionError";
  }
}

export class NotFoundError extends CompanionError {
  public constructor(resource: string) {
    super(`${resource} was not found`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class NotImplementedError extends CompanionError {
  public constructor(capability: string) {
    super(`${capability} is not implemented in this release`, "NOT_IMPLEMENTED");
    this.name = "NotImplementedError";
  }
}
