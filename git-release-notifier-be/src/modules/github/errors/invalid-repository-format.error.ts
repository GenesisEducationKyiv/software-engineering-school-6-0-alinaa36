import { AppError } from '../../../lib/errors/app.error';

export class InvalidRepositoryFormatError extends AppError {
  constructor(raw: string) {
    super(`Invalid GitHub repository: ${raw}`, 400);
  }
}
