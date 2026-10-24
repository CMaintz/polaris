import { PLATFORM_NAMES, type Platform } from "../../domain/accounts";
import type { Account } from "../content/ports";
import { PermanentJobError, ValidationError } from "../errors";
import type { SocialDataProvider, SourceFile } from "./ports";

/** First match wins, so a platform's own adapter claims its files before a generic one. */
export function providerFor(providers: readonly SocialDataProvider[], file: SourceFile) {
  const provider = providers.find((p) => p.canRead(file));
  if (!provider) throw new PermanentJobError(`No importer understands ${file.name}`);
  return provider;
}

export function acceptedFiles(providers: readonly SocialDataProvider[], platform: Platform) {
  return providers
    .filter((p) => p.platform === platform)
    .map(({ id, label, files }) => ({ provider: id, label, files }));
}

/** A file must suit the target account's platform, or its data would be mislabelled. */
export function assertFits(
  providers: readonly SocialDataProvider[],
  file: SourceFile,
  account: Account,
): void {
  const provider = providers.find((p) => p.canRead(file));
  if (!provider) {
    const kinds = acceptedFiles(providers, account.platform).map((a) => `${a.label} (${a.files})`);
    throw new ValidationError(
      `${file.name} is not a supported file. Upload ${kinds.join(" or ")}.`,
    );
  }
  if (provider.platform !== account.platform) {
    throw new ValidationError(
      `${file.name} is a ${provider.label} file, which fits only ${PLATFORM_NAMES[provider.platform]} accounts, and "${account.label}" is a ${PLATFORM_NAMES[account.platform]} account. Switch accounts or choose another file.`,
    );
  }
}
