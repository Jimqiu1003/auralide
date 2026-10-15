import type { Presentation, Result } from '@auralide/core';

export type FileErrorCode =
  | 'cancelled'
  | 'invalid-input'
  | 'invalid-json'
  | 'invalid-document'
  | 'access-denied'
  | 'not-found'
  | 'io-error'
  | 'file-changed'
  | 'too-large'
  | 'busy'
  | 'stale-revision'
  | 'revision-limit';
export interface FileError {
  readonly code: FileErrorCode;
  readonly message: string;
}
export interface FileOutcome {
  readonly document: Presentation;
  readonly fileName: string;
  readonly backupCreated: boolean;
  readonly historyReset: boolean;
}
export type FileResult = Result<FileOutcome, FileError>;
