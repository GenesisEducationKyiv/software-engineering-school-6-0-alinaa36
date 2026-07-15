import type { SagaState } from '../constants/saga.constants';

export interface SagaPayload {
  subscriptionId: string;
  email: string;
  repo: string;
}

export interface SagaRecord {
  id: string;
  type: string;
  state: SagaState;
  payload: SagaPayload;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISagaRepository {
  create(type: string, payload: SagaPayload): Promise<SagaRecord>;
  findById(id: string): Promise<SagaRecord | null>;
  findStuck(states: SagaState[], olderThan: Date): Promise<SagaRecord[]>;
  updateState(id: string, state: SagaState, lastError?: string): Promise<void>;
  transition(id: string, from: SagaState[], to: SagaState, lastError?: string): Promise<boolean>;
}
