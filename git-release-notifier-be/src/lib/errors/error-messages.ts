import { ErrorCode } from './app.error';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.ALREADY_SUBSCRIBED]: 'Ви вже підписані на цей репозиторій',
  [ErrorCode.REPOSITORY_NOT_FOUND]: 'Репозиторій не знайдено',
  [ErrorCode.INVALID_CONFIRM_TOKEN]: 'Недійсний токен підтвердження',
  [ErrorCode.INVALID_UNSUBSCRIBE_TOKEN]: 'Недійсний токен відписки',
  [ErrorCode.EMAIL_REQUIRED]: "Параметр email є обов'язковим",
  [ErrorCode.UNAUTHORIZED]: 'Невірний або відсутній x-api-key',
  [ErrorCode.GITHUB_UNAVAILABLE]: 'Сервіс GitHub тимчасово недоступний. Спробуйте пізніше.',
  [ErrorCode.GITHUB_RATE_LIMITED]: 'Перевищено ліміт запитів до GitHub. Спробуйте пізніше.',
  [ErrorCode.INTERNAL]: 'Внутрішня помилка сервера',
};
