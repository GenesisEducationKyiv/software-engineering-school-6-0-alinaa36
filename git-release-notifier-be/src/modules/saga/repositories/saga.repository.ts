import type { Prisma, PrismaClient, SagaInstance } from '@prisma/client';
import type {
  ISagaRepository,
  SagaPayload,
  SagaRecord,
} from '../interfaces/saga-repository.interface';
import type { SagaState } from '../constants/saga.constants';

export class SagaRepository implements ISagaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(type: string, payload: SagaPayload): Promise<SagaRecord> {
    const raw = await this.prisma.sagaInstance.create({
      data: { type, payload: payload as unknown as Prisma.InputJsonValue },
    });

    return this.toRecord(raw);
  }

  async findById(id: string): Promise<SagaRecord | null> {
    const raw = await this.prisma.sagaInstance.findUnique({ where: { id } });

    return raw ? this.toRecord(raw) : null;
  }

  async findStuck(state: SagaState, olderThan: Date): Promise<SagaRecord[]> {
    const rows = await this.prisma.sagaInstance.findMany({
      where: { state, createdAt: { lt: olderThan } },
    });

    return rows.map((row) => this.toRecord(row));
  }

  async updateState(id: string, state: SagaState, lastError?: string): Promise<void> {
    await this.prisma.sagaInstance.update({
      where: { id },
      data: lastError === undefined ? { state } : { state, lastError },
    });
  }

  private toRecord(raw: SagaInstance): SagaRecord {
    return {
      id: raw.id,
      type: raw.type,
      state: raw.state as SagaState,
      payload: raw.payload as unknown as SagaPayload,
      lastError: raw.lastError,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}
