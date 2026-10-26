import { Hono } from "hono";
import { deleteCookie } from "hono/cookie";
import { z } from "zod";
import type { AccountService } from "../../application/account/account-service";
import { type AppEnv, currentUser, readJson, requireUser } from "../http";
import { SESSION_COOKIE } from "./auth";

const confirmation = z.object({ password: z.string() });

export function accountRoutes(account: AccountService) {
  return new Hono<AppEnv>()
    .use(requireUser)
    .get("/export", async (c) => {
      const data = await account.export(currentUser(c).id);
      c.header(
        "content-disposition",
        `attachment; filename="polaris-export-${data.exportedAt.slice(0, 10)}.json"`,
      );
      return c.json(data);
    })
    .delete("/data", async (c) => {
      const { password } = await readJson(c, confirmation);
      await account.deleteImportedData(currentUser(c).id, password);
      return c.body(null, 204);
    })
    .delete("/", async (c) => {
      const { password } = await readJson(c, confirmation);
      await account.deleteAccount(currentUser(c).id, password);
      deleteCookie(c, SESSION_COOKIE, { path: "/" });
      return c.body(null, 204);
    });
}
