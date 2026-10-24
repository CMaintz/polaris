import { MAX_LABEL } from "../../domain/accounts";
import type { PasswordConfirmer } from "../account/account-service";
import type { AuditLog } from "../auth/ports";
import { type Clock, nowIso } from "../clock";
import type { Account } from "../content/ports";
import { NotFoundError, ValidationError } from "../errors";
import type { AccountDirectory, NewAccount } from "./ports";
import { accountsWithActive } from "./summary";

export interface AccountsDeps {
  accounts: AccountDirectory;
  passwords: PasswordConfirmer;
  audit: AuditLog;
  clock: Clock;
}

function cleanLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed || trimmed.length > MAX_LABEL) {
    throw new ValidationError(`Give the account a name of 1 to ${MAX_LABEL} characters`);
  }
  return trimmed;
}

/** The accounts a user analyses, one per profile on a platform, and which one is active. */
export class AccountsService {
  constructor(private readonly deps: AccountsDeps) {}

  async list(userId: string): Promise<{ accounts: Account[]; activeId: string | null }> {
    return accountsWithActive(this.deps.accounts, userId);
  }

  /** A new account becomes the active one: the next step is nearly always importing into it. */
  async create(userId: string, values: NewAccount): Promise<Account> {
    const label = cleanLabel(values.label);
    const account = await this.deps.accounts.create(
      userId,
      { ...values, label },
      nowIso(this.deps.clock),
    );
    await this.deps.accounts.activate(userId, account.id);
    await this.deps.audit.record(userId, "account.created", { platform: account.platform });
    return account;
  }

  async rename(userId: string, accountId: string, label: string): Promise<void> {
    const now = nowIso(this.deps.clock);
    const renamed = await this.deps.accounts.rename(userId, accountId, cleanLabel(label), now);
    if (!renamed) throw new NotFoundError("Account");
  }

  async activate(userId: string, accountId: string): Promise<void> {
    if (!(await this.deps.accounts.activate(userId, accountId))) {
      throw new NotFoundError("Account");
    }
  }

  /** Destructive (the account's data cascades with it), so it needs the password again. */
  async remove(userId: string, accountId: string, password: string): Promise<void> {
    if (!(await this.deps.accounts.get(userId, accountId))) throw new NotFoundError("Account");
    await this.deps.passwords.confirmPassword(userId, password);
    await this.deps.accounts.remove(userId, accountId);
    await this.deps.audit.record(userId, "account.deleted");
  }
}
