export const HTTP_MESSAGES = {
  SUBSCRIBE_PENDING: (repo: string) =>
    `Будь ласка, перевірте вашу пошту для підтвердження підписки на ${repo}`,
  CONFIRM_SUCCESS: (repo: string) => `Успіх! Ви підписалися на оновлення ${repo}`,
  UNSUBSCRIBE_SUCCESS: (repo: string) => `Ви успішно відписалися від ${repo}`,
} as const;

export const HTML_ERROR_MESSAGES = {
  CONFIRM_INVALID: 'Invalid or expired confirmation link',
  UNSUBSCRIBE_INVALID: 'Invalid or expired unsubscribe link',
} as const;
