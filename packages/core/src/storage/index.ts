export {
  JsonStorageError,
  recoverAtomicJsonWrite,
  writeTextFileAtomic,
  writeJsonFileAtomic,
  readJsonFile,
  createJsonFileIfAbsent,
  listJsonFileNames,
} from './atomicJson';

export {
  AggregateConflictError,
  StorageRecoveryRequiredError,
  mutateAggregateFile,
} from './WorkspaceTransaction';
export type { VersionGuard, AggregateAccessor, MutateAggregateFileOptions } from './WorkspaceTransaction';
