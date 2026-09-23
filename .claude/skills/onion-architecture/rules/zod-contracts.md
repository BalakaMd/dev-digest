# Contracts and validation

Zod is how untrusted input becomes a typed domain value, once, at the edge.

## Parse at the boundary, once

Routes declare `params` / `body` / `response` schemas from `@devdigest/shared`
through `fastify-type-provider-zod`. Invalid input is rejected with 422 *before*
the handler runs, and the same schema serialises the response.

Do not write `Schema.parse(req.body)` inside a handler. It validates input while
leaving the response unchecked, duplicates the schema reference, and moves the
failure from the framework's boundary into application code.

Inner rings receive parsed values and trust them. A service re-parsing its own
arguments is a sign the boundary is in the wrong place — or that the type it
accepts is too loose to describe what it actually needs. This is "parse, don't
validate": make the illegal state unrepresentable at the edge, then stop
checking for it everywhere inside.

Exception that already exists and is fine: a genuinely optional body parsed
tolerantly in the handler (`RunRequest.parse(req.body ?? {})`), because "no body"
is a legitimate request shape rather than a validation failure.

## Contracts are ring 2

`server/src/vendor/shared` is canonical; `client/src/vendor/shared` is a copy.
Changing a contract means editing both, in one commit. The barrel
(`vendor/shared/index.ts`) is stable: features **extend** it with new files
rather than editing existing ones.

A contract describes what crosses a boundary. It is not the database schema and
not the LLM's response shape — when those coincide today, that is a coincidence
worth keeping accidental.

## Schemas as domain vocabulary

`Finding`, `Review`, `Intent`, `RunTrace`, `Settings` are the words every ring
uses. When a service needs a shape that no contract describes, the choice is:

- it crosses a boundary → add a contract in `vendor/shared/contracts/`;
- it is internal to the module → a plain TypeScript type in the module, no Zod.

Zod at rest, inside a ring, buys nothing but runtime cost.

## Structured LLM output

`completeStructured({ schema })` is the same idea aimed outward: the model's
reply is untrusted input, parsed at the adapter boundary into a contract type
before it reaches the core. Reprompt-on-error lives in the adapter, not in the
service.

## Reference

- Parse, don't validate: <https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/>
- Zod: <https://zod.dev/>
