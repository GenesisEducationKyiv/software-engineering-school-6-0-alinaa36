import { InvalidRepositoryFormatError } from '../errors';

export class RepositoryFullName {
  constructor(
    public readonly owner: string,
    public readonly name: string,
  ) {}

  static parse(raw: string): RepositoryFullName {
    const [owner, name, ...rest] = raw.split('/');
    if (!owner || !name || rest.length > 0) {
      throw new InvalidRepositoryFormatError(raw);
    }
    return new RepositoryFullName(owner, name);
  }

  toString(): string {
    return `${this.owner}/${this.name}`;
  }
}
