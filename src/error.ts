import assert from "node:assert";
import {Result} from "./index.js";

export type Error<T extends string = "unknown-error", C = unknown> = {
	kind: T;
	message?: string;
	cause?: C;
};

/**
 * Asserts that the Result is an error (ok: false) AND that the error has the
 * specified `kind`.  If the result is ok, or if the error kind does not match,
 * this function throws an informative AssertionError.  Narrows the type of
 * `result` to `Result<never, E>` where E's kind matches `expectedKind`.
 *
 * @param result The Result object to check.
 * @param expectedKind The expected `kind` property of the error.
 */
export function assertError<
	T, // Value type (usually unknown/never in error cases)
	E extends Error<string, unknown>, // Base error type in the Result
	K extends E["kind"] // The specific error kind we are expecting
>(result: Result<T, E>, expectedKind: K): asserts result is {ok: false; value: null; error: Extract<E, {kind: K}>} {
	if (result.ok) {
		assert.fail(`Expected result to be an error of kind '${expectedKind}', but it was ok.`);
	}

	// If !result.ok, then result.error is guaranteed to exist by the
	// Result type definition.
	const actualKind = result.error.kind;

	if (actualKind !== expectedKind) {
		assert.fail(
			`Expected result error kind to be '${expectedKind}', but received '${actualKind}'.` +
				`\n  Full Error: ${JSON.stringify(result.error, null, 2)}`
		);
	}

	// If we reach here, the assertions passed, and the type guard
	// takes effect.
}

// This function is used to check if the result is an error object
// and has a 'kind' property
export function isErr(result: unknown): result is Error<string> {
	return typeof result === "object" && result !== null && "kind" in result;
}
