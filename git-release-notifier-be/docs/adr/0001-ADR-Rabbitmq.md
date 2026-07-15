# ADR-0001: Choosing a Message Broker for Asynchronous Communication

## Table of Contents

1. [Metadata](#metadata)
2. [Context](#context)
3. [Decision](#decision)
4. [Rejected Alternatives](#rejected-alternatives)
5. [Consequences](#consequences)
6. [References](#references)

---

## Metadata

|               |           |
| :-----------: | :-------: |
|  **Status**   | accepted  |
|   **Date**    | 12.04.26  |
| **Author(s)** | @alinaa36 |

---

## Context

A message broker is needed in order to:

- Decouple the scanner from the email worker — so that a failure in one does not affect the other
- Guarantee that a delivery job will not be lost if the worker is temporarily unavailable
- Be able to retry job processing if something goes wrong
- Not block the cron process while emails are being sent

Constraints taken into account:

- Small team
- Greenfield project — no existing infrastructure to adapt to
- Node.js + TypeScript stack

---

## Decision

**RabbitMQ** was chosen as the message broker for asynchronous job delivery between the scanner and the email worker.

### How it is used in the system

The scanner (producer) groups active subscriptions into batches and publishes them as messages to the queue.
The worker (consumer) reads jobs from the queue, makes a GraphQL request to the GitHub API for the entire batch
and sends emails to subscribers whose `last_seen_tag` differs from the new release.

### Pattern

The **competing consumers** pattern is used — one or more workers read from the same queue,
allowing horizontal scaling of processing without any changes to the scanner logic.

### Configuration

| Parameter    | Value                  | Reason                                    |
| ------------ | ---------------------- | ----------------------------------------- |
| Queue        | `github-scanner-queue` | Single queue for batches from the scanner |
| `durable`    | `true`                 | Queue survives a RabbitMQ restart         |
| `persistent` | `true`                 | Messages are persisted to disk            |

---

## Rejected Alternatives

### BullMQ

BullMQ is an npm library for job queue management built on top of Redis.
It could have solved the asynchronous batch processing task and since Redis is already used in the project,
no additional infrastructure would have been required.

Not chosen because:

- The queue is entirely dependent on Redis — if Redis goes down, both the cache and the queue are lost simultaneously
- Redis was not designed as a reliable message broker; RabbitMQ provides stronger delivery guarantees
- Mixing responsibilities — Redis is already used for caching GitHub API responses,
  using it as a queue as well complicates the understanding of the architecture

### Kafka

Kafka is a distributed event streaming platform designed for high throughput and message history retention.

Not chosen because:

- Overly complex for the current project size — requires ZooKeeper or KRaft and separate ops maintenance
- The project uses a task queue pattern, not event streaming —
  Kafka is optimised for a different scenario
- High operational complexity for a team of 1–3 people

---

## Consequences

### Positive

- The scanner and worker operate independently — a failure in the email service does not stop scanning
- Messages with `durable: true` and `persistent: true` will not be lost on a RabbitMQ restart
- Multiple workers can run in parallel without any changes to the scanner logic
- The cron job is not blocked while emails are being sent — it publishes a batch and moves on
- RabbitMQ has a mature ecosystem and good Node.js support via `amqplib`

### Negative / Risks

- If RabbitMQ goes down the queue becomes completely unavailable — health checks and alerts are required

### Trade-offs / Neutral Changes

- Three infrastructure dependencies instead of two
- Local development requires `docker-compose up rabbitmq`
- Switching to a different broker in the future only requires rewriting `rabbit.channel.ts`
  and `rabbit.connection.ts`; the worker logic remains unchanged
