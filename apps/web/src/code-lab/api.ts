import {
  SandboxAvailabilityDtoSchema,
  SandboxFilesDtoSchema,
  SandboxReportDtoSchema,
  SandboxRunDtoSchema,
  SandboxSessionDtoSchema,
  SandboxTurnDtoSchema,
  type SandboxFilesDto,
  type SandboxReportDto,
  type SandboxSessionDto,
} from "@trajectoryos/contracts";
import type { ApiClient } from "../lib/api";

export const turnSchema = SandboxTurnDtoSchema;
export const runSchema = SandboxRunDtoSchema;
export const sessionSchema = SandboxSessionDtoSchema;
export const filesSchema = SandboxFilesDtoSchema;
export const reportSchema = SandboxReportDtoSchema;
const availabilitySchema = SandboxAvailabilityDtoSchema;

export type SandboxSession = SandboxSessionDto;
export type SandboxFiles = SandboxFilesDto;
export type SandboxReport = SandboxReportDto;

export function sandboxApi(api: ApiClient) {
  const base = "/sandbox/sessions";
  return {
    availability: () => api.request("/sandbox/availability", availabilitySchema),
    challengeFiles: () => api.request("/sandbox/challenge/files", filesSchema),
    start: (clientRequestId: string) => api.request(base, sessionSchema, "POST", { clientRequestId }),
    session: (sessionId: string) => api.request(base + "/" + encodeURIComponent(sessionId), sessionSchema),
    files: (sessionId: string) => api.request(base + "/" + encodeURIComponent(sessionId) + "/files", filesSchema),
    saveSource: (sessionId: string, clientRequestId: string, source: string) => api.request(
      base + "/" + encodeURIComponent(sessionId) + "/source", sessionSchema, "POST", { clientRequestId, source }),
    send: (sessionId: string, clientRequestId: string, prompt: string) => api.request(
      base + "/" + encodeURIComponent(sessionId) + "/turns", turnSchema, "POST", { clientRequestId, prompt }),
    turn: (sessionId: string, turnId: string) => api.request(
      base + "/" + encodeURIComponent(sessionId) + "/turns/" + encodeURIComponent(turnId), turnSchema),
    visible: (sessionId: string, clientRequestId: string) => api.request(
      base + "/" + encodeURIComponent(sessionId) + "/visible-tests", runSchema, "POST", { clientRequestId }),
    submit: (sessionId: string, clientRequestId: string) => api.request(
      base + "/" + encodeURIComponent(sessionId) + "/submit", sessionSchema, "POST", { clientRequestId }),
    report: (sessionId: string) => api.request(base + "/" + encodeURIComponent(sessionId) + "/report", reportSchema),
  };
}
