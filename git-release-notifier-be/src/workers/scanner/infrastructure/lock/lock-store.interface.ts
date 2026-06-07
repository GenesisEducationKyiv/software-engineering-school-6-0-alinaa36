export interface ILockStore {
  acquireForBatch(batch: string[]): Promise<{ acquired: boolean; lockKey: string }>;
  unlock(key: string): Promise<void>;
}
