import { existsSync } from "node:fs";

/**
 * One resume for every application — no per-job tailoring. Drop the PDF at
 * data/resume.pdf (or point RESUME_PATH elsewhere).
 */
const RESUME_PATH = process.env.RESUME_PATH ?? "./data/resume.pdf";
const TRANSCRIPT_PATH = process.env.TRANSCRIPT_PATH ?? "./data/transcript.pdf";

export function resumePath(): string {
  return RESUME_PATH;
}

export function resumeExists(): boolean {
  return existsSync(RESUME_PATH);
}

/** Official undergrad transcript PDF for applications that require it. */
export function transcriptPath(): string | null {
  return existsSync(TRANSCRIPT_PATH) ? TRANSCRIPT_PATH : null;
}
