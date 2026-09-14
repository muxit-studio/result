import { Error, assertError, isErr, formatError } from "./error.js";

export { type Error, assertError, isErr, formatError };

export type Result<T, E> =
	| { ok: true; value: T; error: null }
	| { ok: false; value: null; error: E };

export function ok<T>(value: T): Result<T, never> {
	return { ok: true, value, error: null };
}

export const err = <const T>(errData: T): Result<never, T> => {
	return { ok: false, value: null, error: errData };
};

export function wrap<T>(fn: () => T): Result<T, unknown>;
export function wrap<T, E>(
	fn: () => T,
	mapError: (error: unknown) => E,
): Result<T, E>;
export function wrap<T, E>(
	fn: () => T,
	mapError?: (error: unknown) => E,
): Result<T, E | unknown> {
	try {
		const value = fn();
		return ok(value);
	} catch (error) {
		return err(mapError ? mapError(error) : error);
	}
}

export function wrapAsync<T>(fn: () => Promise<T>): Promise<Result<T, unknown>>;
export function wrapAsync<T, E>(
	fn: () => Promise<T>,
	mapError: (error: unknown) => E,
): Promise<Result<T, E>>;
export async function wrapAsync<T, E>(
	fn: () => Promise<T>,
	mapError?: (error: unknown) => E,
): Promise<Result<T, E | unknown>> {
	try {
		const value = await fn();
		return ok(value);
	} catch (error) {
		return err(mapError ? mapError(error) : error);
	}
}

export function unwrap<T, E>(result: Result<T, E>, defaultValue?: T): T {
	if (result.ok) return result.value;
	if (defaultValue !== undefined) return defaultValue;
	throw result.error;
}

export async function unwrapAsync<T, E>(
	result: Promise<Result<T, E>>,
	defaultValue?: T,
): Promise<T> {
	const res = await result;
	if (res.ok) return res.value;
	if (defaultValue !== undefined) return defaultValue;
	throw res.error;
}

export function map<T, U, E>(
	result: Result<T, E>,
	fn: (value: T) => U,
): Result<U, E> {
	return result.ok ? ok(fn(result.value)) : result;
}

export function mapErr<T, E, F>(
	result: Result<T, E>,
	fn: (error: E) => F,
): Result<T, F> {
	return result.ok ? result : err(fn(result.error));
}

export function match<T, E, U>(
	result: Result<T, E>,
	patterns: {
		ok: (value: T) => U;
		err: (error: E) => U;
	},
): U {
	return result.ok ? patterns.ok(result.value) : patterns.err(result.error);
}
