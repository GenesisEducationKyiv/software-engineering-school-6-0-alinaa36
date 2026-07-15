import {
  workerJobDurationSeconds,
  workerJobsProcessedTotal,
} from '../../../../lib/metrics/metrics';
import { withTimer } from '../../../../lib/metrics/metrics.helpers';
import type { IBatchProcessor } from '../../interfaces/scanner.interfaces';

export class MeteredScanBatchProcessor implements IBatchProcessor {
  constructor(private readonly processor: IBatchProcessor) {}

  async process(repos: string[]): Promise<void> {
    try {
      await withTimer(workerJobDurationSeconds, () => this.processor.process(repos));
      workerJobsProcessedTotal.inc({ status: 'success' });
    } catch (error) {
      workerJobsProcessedTotal.inc({ status: 'failure' });
      throw error;
    }
  }
}
