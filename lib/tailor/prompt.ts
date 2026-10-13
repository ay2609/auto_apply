import { readFileSync, existsSync } from "node:fs";
import type { FormField, JobKind } from "@/db/schema";

const PROFILE_PATH = process.env.PROFILE_PATH ?? "./data/profile.md";
const SCREENING_PATH = process.env.SCREENING_PATH ?? "./data/screening-answers.json";

export type ScreeningAnswers = Record<string, string>;

export function profileExists(): boolean {
  return existsSync(PROFILE_PATH);
}

export function loadProfile(): string {
  if (!existsSync(PROFILE_PATH)) {
    throw new Error(
      `Profile not found at ${PROFILE_PATH}. Copy data/profile.md.template to data/profile.md and fill it in.`,
    );
  }
  return readFileSync(PROFILE_PATH, "utf-8");
}

/** Canonical answers (work auth, start date, EEOC…). Keys starting with "_" are comments. */
export function loadScreeningAnswers(): ScreeningAnswers {
  if (!existsSync(SCREENING_PATH)) return {};
  const raw = JSON.parse(readFileSync(SCREENING_PATH, "utf-8")) as ScreeningAnswers;
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => !k.startsWith("_") && v !== ""));
}

/** Screening answers still holding a TODO placeholder — auto-apply must not guess these. */
export function unfilledScreeningAnswers(): string[] {
  if (!existsSync(SCREENING_PATH)) return [];
  const raw = JSON.parse(readFileSync(SCREENING_PATH, "utf-8")) as ScreeningAnswers;
  return Object.entries(raw)
    .filter(([k, v]) => !k.startsWith("_") && /\bTODO\b/.test(v))
    .map(([k]) => k);
}

export const SYSTEM_PROMPT = `You are a job-application copilot for a student applying to embedded systems, firmware, robotics, autonomy, FPGA, and hardware engineering roles.

The candidate applies with ONE fixed resume; you never modify it. You receive the candidate's profile, a job description, and the ACTUAL fields of the application form (when available). You produce:
1. A short cover letter (Markdown, ~200 words). Concrete: connect one or two specific things from the profile (projects, internship work) to specific things in the JD. No platitudes, no hyperbole, no "I am writing to apply for…" opening. Sound like the candidate, not a template.
2. An answer for each application-form field, in the same order the fields are given, using each field's label verbatim as the question.

Rules per field type:
- Free-text / textarea: write the answer the candidate would type. 1-3 sentences for short questions; up to a short paragraph for "why us" / project questions. Ground every claim in the profile; never fabricate experience, numbers, coursework, or company knowledge.
- Experience / "tell us about a project" questions: prefer the profile item closest to this role (e.g. firmware work for a firmware role, ROS 2 / autonomy work for a robotics role, FPGA work for a digital design role).
- Select: the answer MUST be exactly one of the provided options, character-for-character. Pick using the candidate's canonical screening answers (work auth, demographics, relocation, etc.). For demographic/EEOC questions choose the option matching the canonical answer (e.g. a "decline to answer" option when the canonical answer is "prefer not to say").
- Multiselect: comma-separated subset of the provided options, verbatim.
- Contact fields (name, email, phone, LinkedIn, website, location): fill from the profile if present; otherwise answer with an empty string. Never invent contact info.
- Attachment fields (resume, cover letter upload): answer with a short note like "attach data/resume.pdf" or "paste the cover letter above".
- Education, graduation date, GPA, work authorization, citizenship, clearance: use ONLY what the profile and screening answers state. If they don't say, answer "prefer not to say" or leave a brief honest deflection. Never guess.

Style: NEVER use em dashes (—) or double/triple hyphens in any output. Use a comma, colon, period, or parentheses instead. This applies to the cover letter and every free-text answer.`;

export function buildUserPrompt(args: {
  company: string;
  title: string;
  locationRaw: string;
  jdText: string;
  kind?: JobKind | string | null;
  screeningAnswers: ScreeningAnswers;
  formFields: FormField[];
  formSource: "greenhouse" | "fallback";
}): string {
  return [
    `# Company: ${args.company}`,
    `# Role: ${args.title}`,
    `# Location: ${args.locationRaw}`,
    `# Kind: ${args.kind ?? "internship"}`,
    ``,
    `## Candidate's canonical screening answers (use these verbatim when relevant)`,
    "```json",
    JSON.stringify(args.screeningAnswers, null, 2),
    "```",
    ``,
    args.formSource === "greenhouse"
      ? `## Application form fields (the REAL form for this job; answer each one, in order)`
      : `## Application form fields (standard questions; the real form wasn't retrievable)`,
    "```json",
    JSON.stringify(args.formFields, null, 2),
    "```",
    ``,
    `## Job description`,
    args.jdText.slice(0, 16000),
  ].join("\n");
}
