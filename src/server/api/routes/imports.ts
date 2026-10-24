import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ImportService } from "../../application/imports/import-service";
import type { SourceFile } from "../../application/imports/ports";
import { ValidationError } from "../../application/errors";
import { type AppEnv, currentUser, requireUser } from "../http";
import { toJobDto } from "./jobs";

async function readUploads(form: FormData): Promise<SourceFile[]> {
  const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) throw new ValidationError("Choose at least one file to import");
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}

export function importRoutes(imports: ImportService, maxBytes: number) {
  // Enforced while streaming, so an oversized request never reaches memory in full.
  const limit = bodyLimit({
    maxSize: maxBytes,
    onError: (c) =>
      c.json(
        {
          error: {
            code: "too_large",
            message: `Uploads are limited to ${Math.round(maxBytes / 1048576)} MB`,
          },
        },
        413,
      ),
  });
  return new Hono<AppEnv>()
    .use(requireUser)
    .post("/", limit, async (c) => {
      let form: FormData;
      try {
        form = await c.req.formData();
      } catch {
        throw new ValidationError("Send the files as multipart/form-data");
      }
      const job = await imports.startImport(currentUser(c).id, await readUploads(form));
      return c.json({ job: toJobDto(job) }, 202);
    })
    .post("/demo", async (c) => {
      const job = await imports.startDemo(currentUser(c).id);
      return c.json({ job: toJobDto(job) }, 202);
    })
    .delete("/demo", async (c) => {
      await imports.deleteDemo(currentUser(c).id);
      return c.body(null, 204);
    })
    .get("/status", async (c) => c.json(await imports.status(currentUser(c).id)));
}
