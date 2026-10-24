import type { VersionOrigin } from "../../domain/drafts";

export interface Draft {
  id: string;
  planItemId: string | null;
  title: string;
  version: number;
  text: string;
  approvedVersion: number | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DraftVersion {
  version: number;
  text: string;
  origin: VersionOrigin;
  notes: string;
  interactionId: string | null;
  basedOnDemo: boolean;
  createdAt: string;
}

export interface NewVersion {
  text: string;
  origin: VersionOrigin;
  notes?: string;
  interactionId?: string | null;
  basedOnDemo?: boolean;
  jobId?: string | null;
}

export interface DraftStore {
  list(accountId: string): Promise<Draft[]>;
  get(accountId: string, id: string): Promise<Draft | null>;
  versions(accountId: string, id: string): Promise<DraftVersion[]>;
  findByJob(accountId: string, jobId: string): Promise<Draft | null>;
  create(
    accountId: string,
    values: { title: string; planItemId: string | null },
    first: NewVersion,
    now: string,
  ): Promise<Draft>;
  update(
    accountId: string,
    id: string,
    patch: { title?: string; planItemId?: string | null },
    now: string,
  ): Promise<Draft | null>;
  /** Appends a version and clears any approval, since approval covers one version only. */
  addVersion(
    accountId: string,
    id: string,
    version: NewVersion,
    now: string,
  ): Promise<Draft | null>;
  /** Approves `version` only if it is still the current one; false otherwise. */
  approve(accountId: string, id: string, version: number, now: string): Promise<boolean>;
  delete(accountId: string, id: string): Promise<boolean>;
}
