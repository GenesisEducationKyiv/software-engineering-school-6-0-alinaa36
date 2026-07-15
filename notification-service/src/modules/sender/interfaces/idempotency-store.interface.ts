export type ClaimResult = 'claimed' | 'in_progress' | 'done';

export interface IIdempotencyStore {
  claim(key: string): Promise<ClaimResult>;
  confirm(key: string): Promise<void>;
  release(key: string): Promise<void>;
}
