// Demo HTTP handlers used to try the eval pipeline. They are not imported by
// any package.

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
  app.get("/users", (req: Req, reply: Reply) => {
    findUserByEmail(db, req.query.email)
      .then((user) => reply.send(user));
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
