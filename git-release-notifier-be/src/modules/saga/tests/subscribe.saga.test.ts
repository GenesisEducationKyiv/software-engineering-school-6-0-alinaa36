import type { Mocked } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/logger/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { confirmationIdempotencyKey } from '@grn/contracts';
import { SubscribeSaga } from '../orchestrator/subscribe.saga';
import { SUBSCRIBE_SAGA_TYPE, SagaState } from '../constants/saga.constants';
import type { ISagaRepository, SagaRecord } from '../interfaces/saga-repository.interface';
import type {
  ISubscriptionRepository,
  SubscriptionEntity,
} from '../../subscriptions/interfaces/subscription-repository.interface';
import type { IEmailQueue } from '../../sender/interfaces/email-queue.interface';

// ---- helpers ----

function makeSagaRepository(): Mocked<ISagaRepository> {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findStuck: vi.fn(),
    updateState: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSubscriptionRepository(): Mocked<ISubscriptionRepository> {
  return {
    checkIfActiveExists: vi.fn(),
    upsertPending: vi.fn(),
    findByConfirmToken: vi.fn(),
    activate: vi.fn(),
    findByUnsubscribeToken: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    findByEmail: vi.fn(),
    countActive: vi.fn(),
    groupByRepository: vi.fn(),
  };
}

function makeEmailQueue(): Mocked<IEmailQueue> {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSubscription(overrides: Partial<SubscriptionEntity> = {}): SubscriptionEntity {
  return {
    id: 'sub-1',
    email: 'user@example.com',
    repository: 'user/repo',
    lastSeenTag: null,
    status: 'PENDING',
    confirmToken: 'confirm-tok',
    unsubscribeToken: 'unsub-tok',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeSagaRecord(overrides: Partial<SagaRecord> = {}): SagaRecord {
  return {
    id: 'saga-1',
    type: SUBSCRIBE_SAGA_TYPE,
    state: SagaState.AWAITING_EMAIL,
    payload: { subscriptionId: 'sub-1', email: 'user@example.com', repo: 'user/repo' },
    lastError: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeSaga() {
  const sagaRepo = makeSagaRepository();
  const subscriptionRepo = makeSubscriptionRepository();
  const emailQueue = makeEmailQueue();
  const saga = new SubscribeSaga(sagaRepo, subscriptionRepo, emailQueue);

  return { saga, sagaRepo, subscriptionRepo, emailQueue };
}

// ---- тести ----

describe('SubscribeSaga', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('start', () => {
    it('створює PENDING-підписку', async () => {
      const { saga, sagaRepo, subscriptionRepo } = makeSaga();
      subscriptionRepo.upsertPending.mockResolvedValue(makeSubscription());
      sagaRepo.create.mockResolvedValue(makeSagaRecord());

      await saga.start('user@example.com', 'user/repo');

      expect(subscriptionRepo.upsertPending).toHaveBeenCalledWith('user@example.com', 'user/repo');
    });

    it('створює запис саги з даними підписки', async () => {
      const { saga, sagaRepo, subscriptionRepo } = makeSaga();
      subscriptionRepo.upsertPending.mockResolvedValue(makeSubscription({ id: 'sub-42' }));
      sagaRepo.create.mockResolvedValue(makeSagaRecord());

      await saga.start('user@example.com', 'user/repo');

      expect(sagaRepo.create).toHaveBeenCalledWith(SUBSCRIBE_SAGA_TYPE, {
        subscriptionId: 'sub-42',
        email: 'user@example.com',
        repo: 'user/repo',
      });
    });

    it('публікує confirmation-лист із sagaId та токеном', async () => {
      const { saga, sagaRepo, subscriptionRepo, emailQueue } = makeSaga();
      subscriptionRepo.upsertPending.mockResolvedValue(makeSubscription({ confirmToken: 'tok-1' }));
      sagaRepo.create.mockResolvedValue(makeSagaRecord({ id: 'saga-99' }));

      await saga.start('user@example.com', 'user/repo');

      expect(emailQueue.publish).toHaveBeenCalledWith({
        type: 'confirmation',
        idempotencyKey: confirmationIdempotencyKey('user@example.com', 'user/repo', 'tok-1'),
        email: 'user@example.com',
        repo: 'user/repo',
        confirmToken: 'tok-1',
        sagaId: 'saga-99',
      });
    });

    it('переводить сагу в стан AWAITING_EMAIL', async () => {
      const { saga, sagaRepo, subscriptionRepo } = makeSaga();
      subscriptionRepo.upsertPending.mockResolvedValue(makeSubscription());
      sagaRepo.create.mockResolvedValue(makeSagaRecord({ id: 'saga-7' }));

      await saga.start('user@example.com', 'user/repo');

      expect(sagaRepo.updateState).toHaveBeenCalledWith('saga-7', SagaState.AWAITING_EMAIL);
    });

    it('повертає створену підписку', async () => {
      const { saga, sagaRepo, subscriptionRepo } = makeSaga();
      const subscription = makeSubscription();
      subscriptionRepo.upsertPending.mockResolvedValue(subscription);
      sagaRepo.create.mockResolvedValue(makeSagaRecord());

      const result = await saga.start('user@example.com', 'user/repo');

      expect(result).toEqual(subscription);
    });
  });

  describe('onReply', () => {
    it('завершує сагу при статусі SENT', async () => {
      const { saga, sagaRepo, subscriptionRepo } = makeSaga();
      sagaRepo.findById.mockResolvedValue(makeSagaRecord({ id: 'saga-1' }));

      await saga.onReply({ sagaId: 'saga-1', status: 'SENT' });

      expect(sagaRepo.updateState).toHaveBeenCalledWith('saga-1', SagaState.COMPLETED);
      expect(subscriptionRepo.delete).not.toHaveBeenCalled();
    });

    it('компенсує сагу при статусі FAILED', async () => {
      const { saga, sagaRepo, subscriptionRepo } = makeSaga();
      sagaRepo.findById.mockResolvedValue(
        makeSagaRecord({ id: 'saga-1', payload: { subscriptionId: 'sub-5', email: 'a@b.c', repo: 'a/b' } }),
      );

      await saga.onReply({ sagaId: 'saga-1', status: 'FAILED', reason: 'smtp down' });

      expect(subscriptionRepo.delete).toHaveBeenCalledWith('sub-5');
      expect(sagaRepo.updateState).toHaveBeenCalledWith('saga-1', SagaState.COMPENSATED, 'smtp down');
    });

    it('ігнорує відповідь якщо сага не існує', async () => {
      const { saga, sagaRepo, subscriptionRepo } = makeSaga();
      sagaRepo.findById.mockResolvedValue(null);

      await saga.onReply({ sagaId: 'missing', status: 'SENT' });

      expect(sagaRepo.updateState).not.toHaveBeenCalled();
      expect(subscriptionRepo.delete).not.toHaveBeenCalled();
    });

    it('ігнорує відповідь якщо сага вже не в стані AWAITING_EMAIL', async () => {
      const { saga, sagaRepo, subscriptionRepo } = makeSaga();
      sagaRepo.findById.mockResolvedValue(makeSagaRecord({ state: SagaState.COMPLETED }));

      await saga.onReply({ sagaId: 'saga-1', status: 'SENT' });

      expect(sagaRepo.updateState).not.toHaveBeenCalled();
      expect(subscriptionRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('compensateStuck', () => {
    it('компенсує застряглі саги', async () => {
      const { saga, sagaRepo, subscriptionRepo } = makeSaga();
      sagaRepo.findStuck.mockResolvedValue([
        makeSagaRecord({ id: 'saga-1', payload: { subscriptionId: 'sub-9', email: 'a@b.c', repo: 'a/b' } }),
      ]);

      await saga.compensateStuck(120_000);

      expect(subscriptionRepo.delete).toHaveBeenCalledWith('sub-9');
      expect(sagaRepo.updateState).toHaveBeenCalledWith(
        'saga-1',
        SagaState.COMPENSATED,
        'confirmation reply timed out',
      );
    });

    it('нічого не компенсує якщо застряглих саг немає', async () => {
      const { saga, sagaRepo, subscriptionRepo } = makeSaga();
      sagaRepo.findStuck.mockResolvedValue([]);

      await saga.compensateStuck(120_000);

      expect(subscriptionRepo.delete).not.toHaveBeenCalled();
      expect(sagaRepo.updateState).not.toHaveBeenCalled();
    });
  });
});
