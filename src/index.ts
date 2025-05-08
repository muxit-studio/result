export type Result<T, E> =
  | { ok: true; value: T; error: null }
  | { ok: false; value: null; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value, error: null };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, value: null, error };
}

export function wrap<T, E>(
  fn: () => T,
  mapError: (error: any) => E = (e) => e as E
): Result<T, E> {
  try {
    const value = fn();
    return ok(value);
  } catch (error) {
    return err(mapError(error));
  }
}

export async function wrapAsync<T, E>(
  fn: () => Promise<T>,
  mapError: (error: unknown) => E = (e) => e as E
): Promise<Result<T, E>> {
  try {
    const value = await fn();
    return ok(value);
  } catch (error) {
    return err(mapError(error));
  }
}

export function unwrap<T, E>(result: Result<T, E>, defaultValue?: T): T {
  if (result.ok) return result.value;
  if (defaultValue !== undefined) return defaultValue;
  throw result.error;
}

export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

export function match<T, E, U>(
  result: Result<T, E>,
  patterns: {
    ok: (value: T) => U;
    err: (error: E) => U;
  }
): U {
  return result.ok ? patterns.ok(result.value) : patterns.err(result.error);
}
