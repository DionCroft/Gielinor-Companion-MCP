export class InFlightRequestDeduplicator<T> {
  private readonly requests = new Map<string, Promise<T>>();

  public get size(): number {
    return this.requests.size;
  }

  public async run(key: string, loader: () => Promise<T>): Promise<T> {
    const existing = this.requests.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const request = loader();
    this.requests.set(key, request);
    try {
      return await request;
    } finally {
      if (this.requests.get(key) === request) {
        this.requests.delete(key);
      }
    }
  }
}
