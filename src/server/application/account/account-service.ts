import type { AuditLog } from "../auth/ports";
import { type Clock, nowIso } from "../clock";

export interface DataLifecycle {
  exportUser(userId: string): Promise<Record<string, unknown>>;
  deleteImported(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}

export interface PasswordConfirmer {
  /** Throws when the password is not the user's current one. */
  confirmPassword(userId: string, password: string): Promise<void>;
}

/** The data lifecycle from docs/09: export, delete imported data, delete the account. */
export class AccountService {
  constructor(
    private readonly data: DataLifecycle,
    private readonly auth: PasswordConfirmer,
    private readonly audit: AuditLog,
    private readonly clock: Clock,
  ) {}

  async export(userId: string) {
    await this.audit.record(userId, "data.exported");
    return {
      exportedAt: nowIso(this.clock),
      format: "polaris-export/v1",
      ...(await this.data.exportUser(userId)),
    };
  }

  /** Destructive, so it needs the password again rather than just a live session. */
  async deleteImportedData(userId: string, password: string): Promise<void> {
    await this.auth.confirmPassword(userId, password);
    await this.data.deleteImported(userId);
    await this.audit.record(userId, "data.imported_deleted");
  }

  async deleteAccount(userId: string, password: string): Promise<void> {
    await this.auth.confirmPassword(userId, password);
    await this.data.deleteUser(userId);
    // Kept without the user id: proof that a deletion happened, with nothing to tie it back.
    await this.audit.record(null, "user.deleted");
  }
}
