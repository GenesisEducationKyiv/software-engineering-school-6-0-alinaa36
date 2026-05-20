import { AppError } from '../../../lib/errors/app.error';

export class GithubApiError extends AppError {
  constructor(message: string, statusCode: number = 503) {
    super(message, statusCode);
  }
}
