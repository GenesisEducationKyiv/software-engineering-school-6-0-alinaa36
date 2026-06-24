# План реалізації оркестрованої Saga

Розподілена транзакція між двома мікросервісами через **оркестровану Saga**.

## Зафіксовані рішення

- **Бізнес-операція:** підписка (`subscribe`) — має бути атомарною: або (PENDING-підписку створено в сервісі A **І** лист підтвердження прийнято до відправки сервісом B), або **нічого** (PENDING відкочується).
- **Тип:** оркестрована сага. Оркестратор живе в `git-release-notifier-be` (сервіс A), бо він приймає HTTP-запит і володіє БД.
- **Командний напрямок (A → B, «відправ лист»):** перевикористовуємо наявну чергу `email-send-queue`. Нової командної черги **не створюємо**.
- **Нова черга — одна:** `saga.confirmation.reply` (B → A) для відповіді про результат відправки.
- **Стан саги:** нова таблиця `SagaInstance` у Postgres сервісу A (одне підключення до БД, без нової бази).
- **Релізний потік (`email-send-queue` для релізів, `release-delivered-queue`) НЕ чіпаємо** — у нього нема чого компенсувати (самозцілюється через re-scan).

## Потік

```
A: subscribe → створити PENDING + рядок саги (STARTED)
A: ── confirmation-повідомлення з sagaId ──►  email-send-queue
                                                      │
                                                 B: шле лист (ідемпотентно)
                                                      │ успіх / помилка
A: ◄── { sagaId, SENT | FAILED } ──────────────  saga.confirmation.reply
A: reply-consumer знаходить сагу по sagaId:
     SENT   → COMPLETED   (PENDING лишається, чекає на /confirm)
     FAILED → COMPENSATING → видалити PENDING → COMPENSATED
   timeout (scheduler) → те саме, що FAILED
```

## Кроки

### Крок 1. Контракти (`packages/contracts`) — ревізія
- Лишити чергу `SAGA_CONFIRMATION_REPLY_QUEUE` + схему `confirmationReplySchema` (`sagaId`, `status: SENT|FAILED`, `reason?`).
- **Прибрати** `SAGA_CONFIRMATION_COMMAND_QUEUE` і `confirmationCommandSchema` — команда йде через `email-send-queue`.
- У `emailMessageSchema` (варіант `confirmation`) додати **опційне** поле `sagaId`.
- Перебілдити пакет (`npm run build` → оновити `dist/`).

### Крок 2. Стан саги (Prisma, сервіс A)
- Додати модель `SagaInstance`: `id` (sagaId), `type`, `state`, `payload` (JSON: `subscriptionId`, `email`, `repo`), `lastError?`, `createdAt`, `updatedAt`.
- Згенерувати міграцію + перегенерувати Prisma-клієнт.

### Крок 3. Учасник саги (`notification-service`, сервіс B)
- У наявному email-консюмері: після відправки `confirmation`-листа, **якщо в повідомленні є `sagaId`** — опублікувати reply (`SENT`) у `saga.confirmation.reply`.
- При невдачі відправки (вичерпані ретраї / помилка) — опублікувати reply (`FAILED`) з причиною.
- Для звичайних листів без `sagaId` поведінка не змінюється.

### Крок 4. Оркестратор (`git-release-notifier-be`, новий модуль `modules/saga/`)
- `saga.repository` — CRUD по `SagaInstance` (Prisma).
- `reply-consumer` — слухає `saga.confirmation.reply`.
- Машина станів `SubscribeSaga`:
  - `start()`: створити PENDING → створити рядок саги (`STARTED`) → опублікувати confirmation з `sagaId` у `email-send-queue` → `AWAITING_EMAIL`.
  - `onReply()`: знайти сагу по `sagaId`; ігнорувати, якщо не в `AWAITING_EMAIL` (ідемпотентність); `SENT` → `COMPLETED`; `FAILED` → компенсація.
  - `compensate()`: `COMPENSATING` → видалити PENDING-підписку → `COMPENSATED`.

### Крок 5. Інтеграція в наявний потік
- `SubscriptionService.subscribeToRepo`: guard-перевірки (`checkIfActiveExists`, `repoProvider.exists`) лишаються; замість прямого `notifier.sendConfirmationEmail` — делегувати запуск на `SubscribeSaga.start()`.

### Крок 6. Таймаут-компенсація (scheduler сервісу A)
- Періодичне завдання: знайти саги в `AWAITING_EMAIL`, старші за N секунд → запустити `compensate()`.
- Закриває випадок, коли reply не прийшов узагалі (B упав / повідомлення загубилось).

### Крок 7. DI + запуск
- Прокинути нові компоненти через `composition/containers/*` і `factories.ts`.
- Зареєструвати reply-consumer на старті сервісу A.
- Жодних змін у docker-compose (RabbitMQ і Postgres уже є).

### Крок 8. Тести + демо
- Happy path → `COMPLETED`, PENDING лишається.
- Лист провалився → `FAILED` → компенсація → `COMPENSATED`, PENDING видалено.
- Timeout (B зупинено) → scheduler компенсує.

## Порядок виконання

```
1 → 2 → (3 і 4 паралельно) → 5 → 6 → 7 → 8
```

## Що НЕ робимо

- Не створюємо командну чергу (реюз `email-send-queue`).
- Не створюємо БД для сервісу B (він лише учасник).
- Не чіпаємо релізний потік.
