import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AuthService, SignedIn } from "../../application/auth/auth-service";
import { type AppEnv, currentUser, readJson, requireUser } from "../http";

export const SESSION_COOKIE = "polaris_session";

const credentials = z.object({ email: z.string(), password: z.string() });

export function authRoutes(auth: AuthService, secureCookies: boolean) {
  const setSession = (c: Parameters<typeof setCookie>[0], signedIn: SignedIn) =>
    setCookie(c, SESSION_COOKIE, signedIn.token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: secureCookies,
      path: "/",
      expires: new Date(signedIn.expiresAt),
    });

  return new Hono<AppEnv>()
    .post("/register", async (c) => {
      const { email, password } = await readJson(c, credentials);
      const signedIn = await auth.register(email, password);
      setSession(c, signedIn);
      return c.json({ user: signedIn.user }, 201);
    })
    .post("/login", async (c) => {
      const { email, password } = await readJson(c, credentials);
      const signedIn = await auth.login(email, password);
      setSession(c, signedIn);
      return c.json({ user: signedIn.user });
    })
    .post("/logout", async (c) => {
      const token = getCookie(c, SESSION_COOKIE);
      if (token) await auth.logout(token);
      deleteCookie(c, SESSION_COOKIE, { path: "/" });
      return c.body(null, 204);
    })
    .get("/me", requireUser, (c) => c.json({ user: currentUser(c) }));
}
