import { Hono } from "hono";
import { z } from "zod";
import type { AccountsService } from "../../application/accounts/accounts-service";
import { toAccountSummary } from "../../application/accounts/summary";
import { PLATFORMS } from "../../domain/accounts";
import type { AccountListDto } from "../../../shared/account-types";
import { type AppEnv, currentUser, readJson, requireUser } from "../http";

const newAccount = z.object({ platform: z.enum(PLATFORMS), label: z.string() });
const renaming = z.object({ label: z.string() });
const confirmation = z.object({ password: z.string() });

export function accountsRoutes(accounts: AccountsService) {
  return new Hono<AppEnv>()
    .use(requireUser)
    .get("/", async (c) => {
      const { accounts: list, activeId } = await accounts.list(currentUser(c).id);
      const body: AccountListDto = { accounts: list.map((a) => toAccountSummary(a, activeId)) };
      return c.json(body);
    })
    .post("/", async (c) => {
      const account = await accounts.create(currentUser(c).id, await readJson(c, newAccount));
      return c.json({ account: toAccountSummary(account, account.id) }, 201);
    })
    .patch("/:id", async (c) => {
      const { label } = await readJson(c, renaming);
      await accounts.rename(currentUser(c).id, c.req.param("id"), label);
      return c.body(null, 204);
    })
    .post("/:id/activate", async (c) => {
      await accounts.activate(currentUser(c).id, c.req.param("id"));
      return c.body(null, 204);
    })
    .delete("/:id", async (c) => {
      const { password } = await readJson(c, confirmation);
      await accounts.remove(currentUser(c).id, c.req.param("id"), password);
      return c.body(null, 204);
    });
}
