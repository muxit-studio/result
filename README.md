# @muxit-studio/result

A lightweight, type-safe `Result<T, E>` type for TypeScript, inspired by Go's explicit
error handling and Rust's Result type. Zero dependencies.

## Why?

TypeScript's `try/catch` doesn't tell you what can fail. Functions that throw hide their
error types from the caller, and forgetting a `try/catch` leads to uncaught exceptions.

With `Result`, errors are just return values. The type system tracks them and forces you
to handle both cases.

## Installation

```bash
npm install @muxit-studio/result
```

## Core Types

### `Result<T, E>`

```typescript
type Result<T, E> = { ok: true; value: T; error: null } | { ok: false; value: null; error: E }
```

A discriminated union — check `result.ok` and TypeScript narrows the type automatically.

### `Error<K>`

```typescript
type Error<K extends string = "unknown-error", C = unknown> = {
	kind: K
	message?: string
	cause?: C
}
```

Define your domain errors as individual type aliases. Each error gets its own `kind` —
no bundling into a single union type:

```typescript
import { type Error } from "@muxit-studio/result"

type AuthEmailInvalid       = Error<"auth-email-invalid">
type AuthEmailExists        = Error<"auth-email-exists">
type AuthTokenExpired       = Error<"auth-token-expired">
type AuthCodeMismatch       = Error<"auth-code-mismatch">
type AuthError              = Error<"auth-error">
```

## Primary Pattern: Imperative Check and Return

This is the Go-inspired style — check for errors and propagate them explicitly. It's the
recommended default for most code.

### Scenario: User Registration

```typescript
import { type Error, ok, err } from "@muxit-studio/result"
import * as v from "valibot"

// Define domain errors
type AuthEmailInvalid = Error<"auth-email-invalid">
type AuthEmailExists  = Error<"auth-email-exists">
type AuthError        = Error<"auth-error">

// Validation layer: returns Result
function validateEmail(input: string): Result<string, AuthEmailInvalid> {
	const parsed = v.safeParse(v.pipe(v.string(), v.email()), input)
	if (!parsed.success) {
		return err({
			kind: "auth-email-invalid",
			message: `"${input}" is not a valid email`,
			cause: parsed.issues,
		})
	}
	return ok(parsed.output)
}

// Database layer: — returns Result via wrap
async function insertUser(email: string): Promise<Result<User, AuthEmailExists | AuthError>> {
	return wrapAsync(
		() => db.user.create({ data: { email } }),
		(cause) => {
			if (isDuplicateError(cause)) {
				return err({ kind: "auth-email-exists", message: "Email already registered", cause })
			}
			return err({ kind: "auth-error", message: "User creation failed", cause })
		},
	)
}

// Compose them: check and propagate
async function registerUser(email: string): Promise<Result<User, AuthEmailInvalid | AuthEmailExists | AuthError>> {
	const validEmail = validateEmail(email)
	if (!validEmail.ok) return validEmail

	const user = await insertUser(validEmail.value)
	if (!user.ok) return user

	return ok(user.value)
}
```

Key points:

- Each function declares exactly what can go wrong in its return type
- Error propagation is explicit: `if (!result.ok) return result`
- The caller of `registerUser` can't forget to handle errors — the type enforces it
- Unexpected errors (bugs) still throw — they aren't domain errors

## `match`

`match` converts a `Result` into a concrete value by handling both branches. Use it at IO
boundaries: HTTP handlers, CLI output, or anywhere you need a single return type.

```typescript
// HTTP route handler
router.post("/register", async (req) => {
	const result = await registerUser(req.body.email)

	return match(result, {
		ok: (user) => new Response(JSON.stringify(user), { status: 201 }),
		err: (e) => {
			switch (e.kind) {
				case "auth-email-invalid":
					return new Response(JSON.stringify({ error: e.message }), { status: 400 })
				case "auth-email-exists":
					return new Response(JSON.stringify({ error: "Email already taken" }), { status: 409 })
				case "auth-error":
					return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 502 })
			}
		},
	})
})
```

- TypeScript enforces both branches return the same type (`Response`)
- The `switch` on `e.kind` is exhaustive — add a new error variant and you get a compile error
- No default case needed; the compiler proves all variants are handled

## `mapErr`

When a low-level function returns technical errors, translate them into domain errors for
the layer above:

```typescript
type DbTimeout  = Error<"db-timeout">
type DbGone     = Error<"db-connection-lost">
type OrderError = Error<"order-unavailable">

// Low-level: returns technical errors
function findOrder(id: string): Result<Order, DbTimeout | DbGone>

// Service layer: translates to domain error
function getOrder(id: string): Result<Order, OrderError> {
	return mapErr(findOrder(id), (dbErr) => ({
		kind: "order-unavailable",
		message: "Could not retrieve order",
		cause: dbErr,
	}))
}
```

The happy path passes through untouched. Only the error is transformed.

## `wrap` / `wrapAsync`

Use `wrap` to safely call functions that may throw — third-party libs, `JSON.parse`, fs
operations, Valibot/Zod parsing without `safeParse`:

```typescript
import { wrap, wrapAsync } from "@muxit-studio/result"

// Synchronous: JSON.parse
function parseConfig(raw: string): Result<AppConfig, Error<"parse-error">> {
	return wrap(
		() => JSON.parse(raw) as AppConfig,
		(cause) => err({ kind: "parse-error", message: "Invalid config JSON", cause }),
	)
}

// Async: external API call
async function fetchRemoteConfig(): Promise<Result<AppConfig, Error<"fetch-error">>> {
	return wrapAsync(
		() => fetch("https://api.example.com/config").then((r) => r.json()),
		(cause) => err({ kind: "fetch-error", message: "Failed to fetch config", cause }),
	)
}
```

## `map`

Less commonly needed. Extracts or reshapes a success value without leaving the Result:

```typescript
// Without map
const sub = findActiveSubscription(userId)
if (!sub.ok) return sub
const plan = sub.value.plan

// With map — same thing in one line
const plan = map(findActiveSubscription(userId), (sub) => sub.plan)
```

Prefer the if-style when the transform is complex or when it improves readability.

## `unwrap`

`unwrap` extracts the value or throws the error. Use it only where there's no caller to
propagate to:

```typescript
// CLI entry point — crash on failure
function main() {
	const config = unwrap(loadConfig())
	startServer(config)
}

// Tests — the assertion is the point
test("valid email passes validation", () => {
	const result = validateEmail("user@example.com")
	const email = unwrap(result)
	expect(email).toBe("user@example.com")
})
```

Passing a default value silences the error — avoid it in business logic:

```typescript
// Bad — error is swallowed
const user = unwrap(findUser(id), { name: "Guest" })

// Good — caller decides how to recover
const result = findUser(id)
if (!result.ok) return redirect("/login")
const user = result.value
```

## `assertNoError` / `assertError` — Testing

Type assertions that throw `AssertionError` with descriptive failure messages:

```typescript
import { assertNoError, assertError } from "@muxit-studio/result"

test("duplicate email returns auth-email-exists", async () => {
	const result = await registerUser("existing@example.com")
	assertError(result, "auth-email-exists")
	// result.error is narrowed to AuthEmailExists
	expect(result.error.message).toContain("already registered")
})

test("valid registration succeeds", async () => {
	const result = await registerUser("new@example.com")
	assertNoError(result)
	// result is narrowed to the success variant
	expect(result.value.email).toBe("new@example.com")
})
```

## Anti-Patterns

- **Don't throw inside Result-returning functions.** If something is truly unexpected
  (bug, invariant violation), let it propagate naturally. Use `wrap` only at the boundary
  to call throw-based code.

- **Don't use `unwrap` with a default in business logic.** It discards the error. Let the
  caller handle it explicitly.

- **Don't overuse combinators.** If `map` or `mapErr` makes the code harder to read than
  an if-statement, use the if-statement.

## License

MIT
