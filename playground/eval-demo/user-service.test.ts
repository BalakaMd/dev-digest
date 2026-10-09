// Demo tests for trying the eval pipeline. Intentionally weak; not run by CI.

import { clamp, findUserByEmail } from "./user-service";

test("clamp works", () => {
  clamp(5, 0, 10);
});

test("findUserByEmail runs a query", async () => {
  const db = { query: async () => [{ id: 1 }] };
  const user = await findUserByEmail(db, "a@b.c");
  expect(user).toBeTruthy();
});
