# /api/ai: a param named `type` can never reach a handler

> **Lesson:** The `/api/ai` dispatcher uses `type` as its routing key and strips it off the body — so any handler param that is *also* named `type` (icebreaker's `'fun' | 'deep'`, roast_or_toast's `'roast' | 'toast'`) silently never arrives, and one client calling shape breaks routing entirely.

## What happened
Found while adding zod validation at the `/api/ai` boundary (2026-07-03). Deriving
schemas from what each handler actually consumes exposed two mismatches:

- `api/_lib/handlers-gemini.ts` `handleIcebreaker` and `api/_lib/handlers-image.ts`
  `handleRoastOrToast` both read a param named `type` from their params object.
- `api/ai.ts` does `const { type, ...params } = body` — `type` is the routing key,
  so it is removed before params reach the handler. The handler's `type` param is
  always `undefined`; both handlers happen to tolerate that by falling into a
  default branch (icebreaker defaults to "fun", roast_or_toast to "roast").
- Worse: the client (`src/services/geminiService.ts` around lines 65/91) sends
  `callAI('icebreaker', { type: 'fun' })`, and `callAI` builds `{ type, ...params }` —
  the spread **overwrites the routing key**, so the request goes out as
  `type: 'fun'` and the dispatcher 400s it as an unknown type. The "deep
  icebreakers" and "toast" variants are effectively dead code paths over the wire.

## What was (deliberately) done about it
Nothing behavioral — fixing it was out of scope for the Phase 1 hardening pass
(no feature changes). The zod schemas mark those two fields **optional** so
validation matches wire reality instead of rejecting the one shape that works.

## The real fix, when someone picks it up
Rename the handler param (e.g. `variant` or `mood`) in the handler, the schema in
`api/_lib/schemas.ts`, AND the client wrappers in `src/services/geminiService.ts`,
then verify Icebreakers "deep" mode and Roast Me's toast mode actually change output.
