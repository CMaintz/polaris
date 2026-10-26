// Response shapes shared by the API and the web client. Types only: nothing here runs.

export interface UserDto {
  id: string;
  email: string;
  createdAt: string;
}

export type JobStatusDto = "queued" | "running" | "completed" | "failed" | "retrying";

export interface JobDto {
  id: string;
  type: string;
  status: JobStatusDto;
  progress: number;
  error: string | null;
  result: unknown;
  retryCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  label: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
