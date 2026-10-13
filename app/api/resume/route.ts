import { readFileSync } from "node:fs";
import { resumePath, resumeExists } from "@/lib/resume/paths";

export const dynamic = "force-dynamic";

/** Serves the one resume that gets attached to every application. */
export async function GET() {
  if (!resumeExists()) return new Response("no resume — copy your PDF to data/resume.pdf", { status: 404 });
  return new Response(readFileSync(resumePath()), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="resume.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
