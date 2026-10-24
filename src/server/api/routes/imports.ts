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

async function readForm(request: { formData(): Promise<FormData> }): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new ValidationError("Send the files as multipart/form-data");
  }
}

// Enforced while streaming, so an oversized request never reaches memory in full.
function uploadLimit(maxBytes: number) {
  const message = `Uploads are limited to ${Math.round(maxBytes / 1048576)} MB`;
  return bodyLimit({
    maxSize: maxBytes,
    onError: (c) => c.json({ error: { code: "too_large", message } }, 413),
  });
}

export function importRoutes(imports: ImportService, maxBytes: number) {
  return new Hono<AppEnv>()
    .use(requireUser)
    .post("/", uploadLimit(maxBytes), async (c) => {
      const files = await readUploads(await readForm(c.req));
      const job = await imports.startImport(currentUser(c).id, files);
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
