import { findAuthSecretViolations } from "../domain/authentication";
import type { NotionHighWaterManifest } from "../domain/initialHostedStateImport";
import type { CastraState } from "../domain/types";

export interface PreparedHostedStateWrite {
  commandType: "write";
  expectedRevision: number;
  idempotencyKey: string;
  requestBindingDigest: string;
  stateDigest: string;
  stateSchemaVersion: 13;
  stateDocument: CastraState;
}

export interface PreparedHostedStateRestore {
  commandType: "restore";
  expectedRevision: number;
  targetRevision: number;
  idempotencyKey: string;
  requestBindingDigest: string;
}

export interface PreparedHostedStateInitialImport {
  commandType: "initial_import";
  expectedRevision: 0;
  idempotencyKey: string;
  requestBindingDigest: string;
  stateDigest: string;
  stateSchemaVersion: 13;
  stateDocument: CastraState;
  rawExportBase64: string;
  manifest: NotionHighWaterManifest;
  manifestDigest: string;
  commanderApprovalProof: {
    mechanism: "same_origin_http_only_step_up";
    sensitiveAction: "operational_state_initial_import";
    scopeBindingDigest: string;
    exactManifestOnly: true;
    privateIdentityIncluded: false;
    secretMaterialStored: false;
  };
}

export type PreparedHostedStateCommand = PreparedHostedStateWrite | PreparedHostedStateRestore | PreparedHostedStateInitialImport;

export interface PendingHostedStateCommandRecord {
  contractVersion: "castra-pending-hosted-command/1.0.0";
  retainedAt: string;
  command: PreparedHostedStateCommand;
  secretMaterialStored: false;
  automaticRetryScheduled: false;
}

export interface PendingHostedStateCommandStore {
  load(): Promise<PendingHostedStateCommandRecord | null>;
  retain(command: PreparedHostedStateCommand): Promise<PendingHostedStateCommandRecord>;
  clearExact(idempotencyKey: string, requestBindingDigest: string): Promise<void>;
}

const databaseName = "castra-release-1";
const databaseVersion = 2;
const stateStoreName = "authoritative-state";
const pendingStoreName = "pending-hosted-state-command";
const pendingKey = "commander";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the pending hosted-command store."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(stateStoreName)) database.createObjectStore(stateStoreName);
      if (!database.objectStoreNames.contains(pendingStoreName)) database.createObjectStore(pendingStoreName);
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Pending hosted-command storage failed."));
  });
}

function assertRecord(value: unknown): PendingHostedStateCommandRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<PendingHostedStateCommandRecord>;
  const command = record.command as Partial<PreparedHostedStateCommand> | undefined;
  if (
    record.contractVersion !== "castra-pending-hosted-command/1.0.0"
    || record.secretMaterialStored !== false
    || record.automaticRetryScheduled !== false
    || typeof record.retainedAt !== "string"
    || !command
    || !["write", "restore", "initial_import"].includes(String(command.commandType))
    || typeof command.idempotencyKey !== "string"
    || typeof command.requestBindingDigest !== "string"
  ) return null;
  if (findAuthSecretViolations(record).length) return null;
  return record as PendingHostedStateCommandRecord;
}

export class IndexedDbPendingHostedStateCommandStore implements PendingHostedStateCommandStore {
  async load(): Promise<PendingHostedStateCommandRecord | null> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(pendingStoreName, "readonly");
      const stored = await requestResult(
        transaction.objectStore(pendingStoreName).get(pendingKey) as IDBRequest<unknown>,
      );
      if (stored === undefined) return null;
      const record = assertRecord(stored);
      if (!record) throw new Error("The retained hosted-state command is malformed or contains prohibited secret material.");
      return record;
    } finally {
      database.close();
    }
  }

  async retain(command: PreparedHostedStateCommand): Promise<PendingHostedStateCommandRecord> {
    if (findAuthSecretViolations(command).length) {
      throw new Error("The unknown hosted-state command was not retained because prohibited secret material was detected.");
    }
    const database = await openDatabase();
    try {
      return await new Promise<PendingHostedStateCommandRecord>((resolve, reject) => {
        const transaction = database.transaction(pendingStoreName, "readwrite");
        const store = transaction.objectStore(pendingStoreName);
        const getRequest = store.get(pendingKey) as IDBRequest<unknown>;
        let retained: PendingHostedStateCommandRecord | null = null;
        getRequest.onerror = () => reject(getRequest.error ?? new Error("Unable to inspect the retained hosted-state command."));
        getRequest.onsuccess = () => {
          const existing = getRequest.result === undefined ? null : assertRecord(getRequest.result);
          if (getRequest.result !== undefined && !existing) {
            transaction.abort();
            reject(new Error("The retained hosted-state command is malformed or contains prohibited secret material."));
            return;
          }
          if (existing && (
            existing.command.idempotencyKey !== command.idempotencyKey
            || existing.command.requestBindingDigest !== command.requestBindingDigest
          )) {
            transaction.abort();
            reject(new Error("A different unknown hosted-state command is already retained. Reconcile it before issuing another command."));
            return;
          }
          retained = {
            contractVersion: "castra-pending-hosted-command/1.0.0",
            retainedAt: existing?.retainedAt ?? new Date().toISOString(),
            command,
            secretMaterialStored: false,
            automaticRetryScheduled: false,
          };
          store.put(retained, pendingKey);
        };
        transaction.oncomplete = () => retained ? resolve(retained) : reject(new Error("The unknown hosted-state command was not retained."));
        transaction.onerror = () => reject(transaction.error ?? new Error("Unable to retain the unknown hosted-state command."));
        transaction.onabort = () => reject(transaction.error ?? new Error("Retaining the unknown hosted-state command was aborted."));
      });
    } finally {
      database.close();
    }
  }

  async clearExact(idempotencyKey: string, requestBindingDigest: string): Promise<void> {
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(pendingStoreName, "readwrite");
        const store = transaction.objectStore(pendingStoreName);
        const getRequest = store.get(pendingKey) as IDBRequest<unknown>;
        getRequest.onerror = () => reject(getRequest.error ?? new Error("Unable to inspect the retained hosted-state command."));
        getRequest.onsuccess = () => {
          if (getRequest.result === undefined) return;
          const existing = assertRecord(getRequest.result);
          if (!existing
            || existing.command.idempotencyKey !== idempotencyKey
            || existing.command.requestBindingDigest !== requestBindingDigest
          ) {
            transaction.abort();
            reject(new Error("The retained hosted-state command changed; it was not cleared."));
            return;
          }
          store.delete(pendingKey);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("Unable to clear the reconciled hosted-state command."));
        transaction.onabort = () => reject(transaction.error ?? new Error("Clearing the reconciled hosted-state command was aborted."));
      });
    } finally {
      database.close();
    }
  }
}

export class InMemoryPendingHostedStateCommandStore implements PendingHostedStateCommandStore {
  private record: PendingHostedStateCommandRecord | null = null;

  load(): Promise<PendingHostedStateCommandRecord | null> {
    return Promise.resolve(this.record ? structuredClone(this.record) : null);
  }

  async retain(command: PreparedHostedStateCommand): Promise<PendingHostedStateCommandRecord> {
    if (this.record && (
      this.record.command.idempotencyKey !== command.idempotencyKey
      || this.record.command.requestBindingDigest !== command.requestBindingDigest
    )) throw new Error("A different unknown hosted-state command is already retained.");
    this.record = {
      contractVersion: "castra-pending-hosted-command/1.0.0",
      retainedAt: this.record?.retainedAt ?? new Date().toISOString(),
      command: structuredClone(command),
      secretMaterialStored: false,
      automaticRetryScheduled: false,
    };
    return structuredClone(this.record);
  }

  async clearExact(idempotencyKey: string, requestBindingDigest: string): Promise<void> {
    if (!this.record) return;
    if (this.record.command.idempotencyKey !== idempotencyKey || this.record.command.requestBindingDigest !== requestBindingDigest) {
      throw new Error("The retained hosted-state command changed; it was not cleared.");
    }
    this.record = null;
  }
}
