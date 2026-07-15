# Git Release Notifier

Сервіс для відстеження нових релізів GitHub репозиторіїв. Користувач підписується на репозиторій і отримує email-сповіщення щоразу, коли з'являється новий реліз.

## Що реалізовано

### Core функціональність
- Підписка на репозиторій з підтвердженням через email
- Валідація репозиторію через GitHub API при підписці
- Сканер який регулярно перевіряє нові релізи для всіх активних підписок
- Відправка email-сповіщень при виявленні нового релізу
- Зберігання `last_seen_tag` — нотифікація тільки при справді новому релізі

### Extras
- **Redis кешування** відповідей GitHub API з TTL 10 хвилин
- **API key автентифікація** — захищені ендпоінти потребують заголовку `x-api-key`
- **gRPC інтерфейс** як альтернатива REST API
- **Prometheus метрики** — ендпоінт `/metrics` з gauge активних підписок
- **GitHub Actions CI** — запуск лінтера та тестів при кожному push
- **Swagger UI** — документація API доступна на `/docs`

### Технічний стек
- **Runtime:** Node.js + TypeScript
- **Framework:** Fastify
- **Database:** PostgreSQL + Prisma ORM
- **Queue:** RabbitMQ
- **Cache:** Redis
- **Email:** Nodemailer (SMTP)
- **Tests:** Vitest

---

## REST API

Базовий URL: `http://localhost:3000/api`

| Метод | Ендпоінт | Авторизація | Опис |
|-------|----------|-------------|------|
| `POST` | `/subscribe` | - | Підписатись на репозиторій |
| `GET` | `/confirm/:token` | - | Підтвердити підписку |
| `GET` | `/unsubscribe/:token` | - | Відписатись |
| `GET` | `/subscriptions?email=` | API key | Отримати всі підписки |

Захищені ендпоінти потребують заголовку:
```
x-api-key: your-api-key
```

Інтерактивна документація: **http://localhost:3000/docs**

---

## Запуск локально

### Передумови
- Node.js 20+
- Docker + Docker Compose

### 1. Клонувати репозиторій
```bash
git clone https://github.com/alinaa36/git-release-notifier.git
cd git-release-notifier/git-release-notifier-be
```

### 2. Встановити залежності
```bash
npm install
```

### 3. Налаштувати змінні середовища
```bash
cp .env.example .env
```
Відкрий `.env` `.env.test` і заповни необхідні значення (дивись коментарі в `.env.example`).

### 4. Підняти інфраструктуру
```bash
docker-compose up -d db redis rabbitmq
```

### 5. Накатити схему БД
```bash
npx prisma db push
```

### 6. Запустити сервер
```bash
npm run start:dev
```

Сервер доступний на **http://localhost:3000**
Swagger UI: **http://localhost:3000/docs**
Метрики: **http://localhost:3000/metrics**

---

## Запуск у Docker

```bash
docker-compose up --build
```

---

## Тести

### Unit тести
```bash
npm run test
```


### Інтеграційні тести
Потребують запущеної тестової бази і Redis. Скрипт піднімає їх автоматично:
```bash
npm run test:integration
```

---

## gRPC

Сервер запускається автоматично разом з REST API на порту `50051`.

Доступні методи: `Subscribe`, `Confirm`, `Unsubscribe`, `GetSubscriptions`.

Proto файл: `src/grpс/proto/subscription.proto`

---

## Архітектура

```
HTTP Request
    ↓
Fastify Router
    ↓
API Key Middleware
    ↓
Controller → Service → Repository (Prisma → PostgreSQL)
                ↓
            RabbitMQ Queue
                ↓
            Scanner Worker
                ↓
        GitHub API (з Redis кешем)
                ↓
        Email Notifier (SMTP)
```

Сканер запускається за розкладом через cron, групує репозиторії в батчі, відправляє задачі в RabbitMQ. Worker читає задачі з черги, робить один GraphQL запит до GitHub на весь батч, і відправляє email тим підписникам у яких `last_seen_tag` відрізняється від нового релізу.