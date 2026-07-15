export interface ILockStore {
  acquireForBatch(
    batch: string[],
  ): Promise<{ acquired: boolean; lockKey: string; token: string }>;
  unlock(key: string, token: string): Promise<void>;
}
