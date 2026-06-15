export interface IIdempotencyStore {
  markIfFirst(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
}
