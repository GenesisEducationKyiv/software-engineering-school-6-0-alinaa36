import type client from 'prom-client';

export async function withTimer<T>(histogram: client.Histogram, fn: () => Promise<T>): Promise<T> {
  const end = histogram.startTimer();
  try {
    return await fn();
  } finally {
    end();
  }
}
