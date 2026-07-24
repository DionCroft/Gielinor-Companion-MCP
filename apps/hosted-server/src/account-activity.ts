type AccountActivity = {
  activeRequests: number;
  deleting: boolean;
};

export class AccountActivityTracker {
  private readonly accounts = new Map<string, AccountActivity>();

  public beginRequest(accountId: string): boolean {
    const activity = this.accounts.get(accountId) ?? {
      activeRequests: 0,
      deleting: false,
    };
    if (activity.deleting) {
      return false;
    }
    activity.activeRequests += 1;
    this.accounts.set(accountId, activity);
    return true;
  }

  public finishRequest(accountId: string): void {
    const activity = this.accounts.get(accountId);
    if (activity === undefined) {
      return;
    }
    activity.activeRequests = Math.max(0, activity.activeRequests - 1);
    if (activity.activeRequests === 0 && !activity.deleting) {
      this.accounts.delete(accountId);
    }
  }

  public beginDeletion(accountId: string): boolean {
    const activity = this.accounts.get(accountId);
    if (activity !== undefined && (activity.activeRequests > 0 || activity.deleting)) {
      return false;
    }
    this.accounts.set(accountId, { activeRequests: 0, deleting: true });
    return true;
  }

  public finishDeletion(accountId: string): void {
    this.accounts.delete(accountId);
  }

  public cancelDeletion(accountId: string): void {
    this.accounts.delete(accountId);
  }
}
