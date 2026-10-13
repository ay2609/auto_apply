import { statSync } from "node:fs";
import Link from "next/link";
import { pdfPageCount } from "@/lib/resume/page-count";
import { resumePath, resumeExists } from "@/lib/resume/paths";

export const dynamic = "force-dynamic";

export default function ResumePage() {
  const path = resumePath();
  const built = resumeExists();
  const pages = built ? pdfPageCount(path) : 0;
  const mtime = built ? statSync(path).mtime : null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">
          <Link href="/" className="text-[color:var(--color-muted)] hover:text-[color:var(--color-accent)]">
            auto-apply
          </Link>{" "}
          / resume
        </h1>
        <p className="text-[color:var(--color-muted)] text-sm mt-1">
          This exact PDF is attached to every application. To change it, replace{" "}
          <span className="font-mono text-[13px]">{path}</span> and refresh.
        </p>
      </header>

      <section className="rounded-lg border bg-[color:var(--color-panel)] overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-medium">Resume</h2>
          {built ? (
            <div className="text-right">
              <span
                className={`rounded px-2 py-1 text-xs ${
                  pages === 1
                    ? "bg-[color:var(--color-success)]/10 text-[color:var(--color-success)]"
                    : "bg-amber-500/10 text-amber-400"
                }`}
              >
                {pages || "?"} page{pages === 1 ? "" : "s"}
              </span>
              {mtime && <p className="mt-1 text-[10px] text-[color:var(--color-muted)]">updated {mtime.toLocaleString()}</p>}
            </div>
          ) : (
            <span className="rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-400">missing</span>
          )}
        </div>
        {built ? (
          <iframe src="/api/resume#toolbar=0&navpanes=0" title="resume" className="h-[80vh] w-full bg-white" />
        ) : (
          <div className="px-6 py-12 text-center text-sm text-[color:var(--color-muted)]">
            Copy your PDF to <span className="font-mono text-[13px]">{path}</span>.
          </div>
        )}
      </section>
    </main>
  );
}
