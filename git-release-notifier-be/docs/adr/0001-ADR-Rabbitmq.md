# ADR-0001: Choosing a Message Broker for Asynchronous Communication

## Table of Contents

1. [Metadata](#metadata)
2. [Context](#context)
3. [Constraints](#constraints)
4. [Considered Options](#considered-options)
5. [Decision](#decision)
6. [Consequences](#consequences)

---

## Metadata

|               |           |
| :-----------: | :-------: |
|  **Status**   | accepted  |
|   **Date**    | 12.04.26  |
| **Author(s)** | @alinaa36 |

---

## Context

The system requires asynchronous communication between its components in order to:

- Decouple producers from consumers — so that a failure in one does not affect the other
- Guarantee that a job will not be lost if the consumer is temporarily unavailable
- Be able to retry job processing if something goes wrong
- Not block the producer while jobs are being processed

At the current stage, the primary use case is job delivery between the scanner and the email worker, but the choice is made at the system level to avoid revisiting this decision as the project grows.

---

## Constraints

- Small team
- Greenfield project — no existing infrastructure to adapt to
- Node.js + TypeScript stack

---

## Considered Options

### RabbitMQ

Dedicated message broker designed for reliable asynchronous communication.

Pros:

- Strong delivery guarantees (ack/nack, durable queues, persistent messages)
- Designed specifically for task queues
- Mature ecosystem with good Node.js support via `amqplib`
- Supports competing consumers pattern for horizontal scaling

Cons:

- Additional infrastructure dependency
- No built-in deduplication

### BullMQ

BullMQ is an npm library for job queue management built on top of Redis.

Pros:

- No additional infrastructure required if Redis is already used in the project
- Simple API, good Node.js integration
- Built-in support for retries, delays and job prioritization

Cons:

- Redis was not designed as a reliable message broker — no support for ack/nack, durable queues or persistent messages at the level of a dedicated broker
- Mixing cache and queue responsibilities on the same instance complicates the architecture and creates a single point of failure for two different concerns

### Kafka

Kafka is a distributed event streaming platform designed for high throughput and message history retention.

Pros:

- Extremely high throughput
- Message history retention — consumers can replay events
- Strong delivery guarantees at scale

Cons:

- Overly complex for small teams — requires ZooKeeper or KRaft and separate ops maintenance
- Optimised for event streaming, not task queues
- High operational complexity

---

## Decision

**RabbitMQ** was chosen as the message broker for asynchronous communication between system components.

### How it is used in the system

RabbitMQ serves as the message broker for asynchronous communication between producers and consumers. Producers publish jobs to a queue without waiting for processing to complete.
Consumers read and process messages independently, allowing each component to operate at its own pace.

### Pattern

The **competing consumers** pattern is used — one or more workers read from the same queue,
allowing horizontal scaling of processing without any changes to the producer logic.

### Configuration

| Parameter    | Value  | Reason                                                                                                                 |
| ------------ | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| `durable`    | `true` | Queue survives a broker restart — no jobs are lost on failure                                                          |
| `persistent` | `true` | Messages are persisted to disk — survive even if the broker crashes before processing                                  |
| `prefetch`   | `1`    | Consumer processes one message at a time before acknowledging — ensures fair distribution and prevents memory overload |

---

## Consequences

### Positive

- Producers and consumers operate independently — a failure in one component does not affect the other
- Messages will not be lost on a broker restart
- Multiple workers can run in parallel without any changes to the producer logic
- RabbitMQ has a mature ecosystem and good Node.js support via `amqplib`

### Negative / Risks

- If RabbitMQ goes down the queue becomes completely unavailable — health checks and alerts are required
- Message ordering is not guaranteed with multiple workers (competing consumers)
- No built-in deduplication — if a message is requeued and processed twice, duplicate notifications can be sent
- Debugging failed messages requires access to the RabbitMQ management UI or DLQ inspection

### Trade-offs / Neutral Changes

- Three infrastructure dependencies instead of two
- Local development requires running an additional service
- Switching to a different broker requires rewriting the transport layer as well as adapting producer and consumer behavior
