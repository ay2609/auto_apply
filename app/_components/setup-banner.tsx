import { existsSync } from "node:fs";
import { AlertTriangle } from "lucide-react";
import { resumeExists } from "@/lib/resume/paths";
import { unfilledScreeningAnswers } from "@/lib/tailor/prompt";

/**
 * Server component: surfaces missing setup. Discovery works with none of it;
 * drafting needs the API key + profile, auto-apply needs everything.
 */
export function SetupBanner() {
  const missing: Array<{ what: string; fix: string }> = [];

  if (!process.env.ANTHROPIC_API_KEY) {
    missing.push({
      what: "ANTHROPIC_API_KEY",
      fix: "add it to .env.local, then restart the dev server. Needed for drafts, auto-apply and the HN scout (job discovery works without it)",
    });
  }
  if (!existsSync(process.env.PROFILE_PATH ?? "./data/profile.md")) {
    missing.push({ what: "data/profile.md", fix: "cp data/profile.md.template data/profile.md and fill it in" });
  }
  if (!resumeExists()) {
    missing.push({ what: "data/resume.pdf", fix: "copy your resume PDF here; it's attached to every application" });
  }
  if (!existsSync("./data/contact.json")) {
    missing.push({ what: "data/contact.json", fix: "name, email, phone, links, school: used to fill identity fields" });
  }
  if (!existsSync(process.env.SCREENING_PATH ?? "./data/screening-answers.json")) {
    missing.push({
      what: "data/screening-answers.json",
      fix: "cp config/screening-answers.example.json data/screening-answers.json and fill it in",
    });
  } else {
    const todo = unfilledScreeningAnswers();
    if (todo.length > 0) {
      missing.push({
        what: "data/screening-answers.json",
        fix: `still TODO: ${todo.join(", ")} (auto-apply is blocked until these are filled)`,
      });
    }
  }

  if (missing.length === 0) return null;
  return (
    <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-amber-400">
        <AlertTriangle className="h-4 w-4" /> Setup incomplete (discovery still runs; drafting / auto-apply need this)
      </div>
      <ul className="mt-2 space-y-1 text-[color:var(--color-muted)]">
        {missing.map((m) => (
          <li key={m.what}>
            <span className="font-mono text-[13px] text-amber-300/80">{m.what}</span>: {m.fix}
          </li>
        ))}
      </ul>
    </div>
  );
}
