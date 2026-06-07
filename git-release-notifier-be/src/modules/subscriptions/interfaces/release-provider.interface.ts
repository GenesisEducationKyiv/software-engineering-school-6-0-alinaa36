export interface IRepositoryProvider {
  exists(repoFullName: string): Promise<boolean>;
}
