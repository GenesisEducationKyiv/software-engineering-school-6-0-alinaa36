# Testing Guide

## Вимоги

На машині має бути встановлено:
- Git
- Docker
- Node.js (LTS)

---

## Встановлення залежностей

```bash
cd git-release-notifier-be
npm ci
```

---

## Змінні середовища

Встанови секретні змінні:

```env
GITHUB_TOKEN=your_github_personal_access_token
```

`GITHUB_TOKEN` має мати права `public_repo`.

---

## Запуск всіх тестів однією командою

```bash
npm run test:unit && npm run test:integration && npm run test:e2e
```

---

## Unit тести

Не потребують Docker або зовнішніх сервісів. Запускаються миттєво.

```bash
npm run test:unit
```

---

## Інтеграційні тести

Потребують PostgreSQL, Redis та RabbitMQ. Все піднімається і зупиняється автоматично через Docker.

```bash
npm run test:integration
```

Що відбувається під капотом:
1. Піднімається контейнер `db-test` з PostgreSQL
2. Застосовується схема БД через `prisma db push`
3. Запускаються тести з `.env.test`
4. Контейнер зупиняється

Якщо потрібно зупинити контейнер вручну:

```bash
npm run docker:test:down
```

---

## E2E тести

Потребують PostgreSQL, Redis, RabbitMQ та зібраного застосунку. Playwright автоматично запускає сервер на порту `3001`.

```bash
npm run test:e2e
```

Що відбувається під капотом:
1. Збирається застосунок через `npm run build`
2. Playwright піднімає сервер на порту `3001`
3. Запускаються тести в браузері Chromium
4. Сервер зупиняється

---

## Структура тестів
```
src/
modules/
*/tests/              # Unit тести модулів
workers/
tests/                # Unit тести воркерів
tests/
integration/          # Інтеграційні тести
e2e/
fixtures/           # Playwright fixtures та helpers
tests/              # E2E специфікації
```
---

## Troubleshooting

**Інтеграційні тести падають з помилкою підключення до БД**

Перевір що Docker запущений і підніми контейнер вручну:

```bash
docker ps
npm run docker:test:up
```

**E2E тести падають з помилкою `API_KEY not set`**

Переконайся що `API_KEY` заповнений в `.env.test`.

**E2E тести падають з помилкою GitHub API**

Переконайся що `GITHUB_TOKEN` заповнений в `.env.test` і має права `public_repo`.
