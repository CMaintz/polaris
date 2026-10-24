import type { Platform } from "../../domain/accounts";
import type { ImportBundle } from "../../domain/content";

export interface SourceFile {
  name: string;
  bytes: Uint8Array;
}

export interface ReadContext {
  /** Day the user ran the import; used as the observation date for snapshot data. */
  importedOn: string;
}

/**
 * A source of social data. Adapters translate provider formats into an ImportBundle at
 * this boundary, so nothing past it knows about CSV columns, sheets or URNs.
 */
export interface SocialDataProvider {
  readonly id: string;
  readonly label: string;
  /** The only platform whose accounts may receive this provider's data. */
  readonly platform: Platform;
  /** The files it reads, in words a user recognises. */
  readonly files: string;
  canRead(file: SourceFile): boolean;
  read(file: SourceFile, context: ReadContext): Promise<ImportBundle[]>;
}

export interface StoredFile extends SourceFile {
  id: string;
  sha256: string;
}

export interface ImportFileStore {
  save(userId: string, file: SourceFile, now: string): Promise<StoredFile>;
  load(userId: string, ids: string[]): Promise<StoredFile[]>;
}
