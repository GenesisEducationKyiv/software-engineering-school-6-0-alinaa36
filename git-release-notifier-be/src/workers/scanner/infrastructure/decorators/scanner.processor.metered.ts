import {
  workerJobDurationSeconds,
  workerJobsProcessedTotal,
} from '../../../../lib/metrics/metrics';
import { withTimer } from '../../../../lib/metrics/metrics.helpers';
import type { ScanBatchProcessor } from '../../scanner.processor';

export class MeteredScanBatchProcessor {
  constructor(private readonly processor: ScanBatchProcessor) {}

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
