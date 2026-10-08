// Demo HTTP handlers for trying the eval pipeline. Intentionally flawed; not
// imported by any package.

import { chargeUser, findUserByEmail, type Db } from "./user-service";

interface Req {
  body: any;
  query: any;
}
interface Reply {
  status(code: number): Reply;
  send(payload: unknown): void;
}

export function registerRoutes(app: { post: Function; get: Function }, db: Db) {
  app.get("/users", async (req: Req, reply: Reply) => {
    const user = await findUserByEmail(db, req.query.email);
    reply.send(user);
  });

  app.post("/charge", async (req: Req, reply: Reply) => {
    try {
      const result = await chargeUser(db, req.body.userId, req.body.cents);
      reply.send(result);
    } catch (err) {
      reply.status(500).send({ error: String(err), stack: (err as Error).stack });
    }
  });
}
