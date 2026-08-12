export class ProbeTimeoutError extends Error {
  constructor(ms: number) {
    super(`Probe timed out after ${ms}ms`);
    this.name = 'ProbeTimeoutError';
  }
}

/** Races a probe call against a timeout so one hung adapter can't stall the others. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProbeTimeoutError(ms)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
