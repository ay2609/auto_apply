#!/usr/bin/env tsx
/**
 * Targeting smoke test: checks the embedded/robotics title, level and US
 * location filters against known examples, then counts how many rows each
 * GitHub list source would keep.
 *
 *   pnpm test:discovery            # filters + live list counts
 *   pnpm test:discovery --offline  # filters only
 */
import "./load-env";
import { isWantedPosting } from "@/lib/target";
import { classify, isTargetLocation } from "@/lib/ingest/location";
import { SOURCES, rawUrl } from "@/lib/ingest/sources";
import { parseTables, parseHtmlTables } from "@/lib/ingest/markdown-table";
import { normalizeRow } from "@/lib/ingest/row-normalizer";

type Case = { title: string; company: string; expect: "internship" | "new-grad" | null; domainBoard?: boolean; listKind?: "internship" | "new-grad" };

const CASES: Case[] = [
  { title: "Embedded Software Engineering Intern", company: "Garmin", expect: "internship" },
  { title: "Firmware Engineer Intern", company: "Acme", expect: "internship" },
  { title: "Robotics Software Intern - Summer 2027", company: "Acme", expect: "internship" },
  { title: "Electrical Engineering Intern - FPGA", company: "Northrop Grumman", expect: "internship" },
  { title: "Hardware Engineering Co-op", company: "Acme", expect: "internship" },
  { title: "Autonomy Engineer, Intern", company: "Acme", expect: "internship" },
  { title: "Perception Intern", company: "Acme", expect: "internship" },
  { title: "GNC Engineering Intern", company: "Acme", expect: "internship" },
  { title: "Software Engineer Intern", company: "Anduril", expect: "internship" },
  { title: "Software Engineer", company: "Skydio", expect: "internship", domainBoard: true, listKind: "internship" },
  { title: "Software Engineer Intern", company: "Stripe", expect: null },
  { title: "Frontend Engineer Intern", company: "Anduril", expect: null },
  { title: "Senior Embedded Engineer", company: "Acme", expect: null },
  { title: "Embedded Software Engineer", company: "Acme", expect: null },
  { title: "PhD Robotics Research Intern", company: "Acme", expect: null },
  { title: "Marketing Intern, Robotics", company: "Acme", expect: null },
  { title: "Localization Intern (Japanese)", company: "Acme", expect: null },
  { title: "Software Engineer Intern", company: "Gecko Robotics", expect: "internship" },
  { title: "Software Intern", company: "Stoke Space", expect: "internship" },
  { title: "Full Stack Software Engineer Intern", company: "Gecko Robotics", expect: null },
  { title: "Silicon Hardware Engineering Intern - Graduate", company: "Intel", expect: null },
  { title: "Silicon Hardware Engineering Intern - Bachelor's", company: "Intel", expect: "internship" },
  { title: "Modeling Engineer Intern - Analytics and Simulation Sciences", company: "Radiance Technologies", expect: null },
  { title: "Simulation Software Engineering Intern", company: "K2 Space", expect: "internship" },
  { title: "Manufacturing Engineering Intern - Summer 2027", company: "Allison Transmission", expect: null },
  { title: "Propulsion Engineering Intern - Spring/Summer/Fall 2027", company: "Hermeus", expect: null },
  { title: "Flight Software Internship - Spring 2027", company: "Varda Space", expect: "internship" },
  { title: "Software Engineer, DevSecOps Co-Op (Summer/Fall 2027)", company: "RTX", expect: null },
];

const LOCATIONS: Array<[string, boolean]> = [
  ["Pittsburgh, PA", true],
  ["Huntsville, AL", true],
  ["Remote in USA", true],
  ["SF", true],
  ["El Segundo, CA", true],
  ["3 Locations", true],
  ["Toronto, ON, Canada", false],
  ["London, UK", false],
  ["Remote in Canada", false],
  ["Munich, Germany", false],
  ["IL - Petah Tikva", false],
  ["CA-QC-LONGUEUIL-J01 ~ 1000 Blvd Marie-Victorin ~ J01 BLDG", false],
  ["US-IA-CEDAR RAPIDS-105 ~ 400 Collins Rd NE ~ BLDG 105", true],
  ["US, CA, Santa Clara", true],
  ["Seattle, WA, Vancouver, BC, Canada", true],
  ["Plano, TX", true],
];

async function main() {
  let failed = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed += 1;
  };

  for (const c of CASES) {
    const got = isWantedPosting({ title: c.title, company: c.company, domainBoard: c.domainBoard, listKind: c.listKind });
    check(`title "${c.title}" @ ${c.company}`, got === c.expect, `got ${got}`);
  }
  for (const [loc, want] of LOCATIONS) {
    check(`location "${loc}"`, isTargetLocation(loc) === want, classify(loc));
  }

  if (!process.argv.includes("--offline")) {
    console.log("\nLive list sources (rows kept by the embedded/robotics filter):");
    for (const src of SOURCES) {
      try {
        const res = await fetch(rawUrl(src), { signal: AbortSignal.timeout(30_000) });
        const md = await res.text();
        let seen = 0;
        const kept: string[] = [];
        for (const table of [...parseTables(md), ...parseHtmlTables(md)]) {
          let lastCompany = "";
          for (const cells of table.rows) {
            const row = normalizeRow(table.headers, cells);
            if (!row) continue;
            if (/↳|⤷/.test(cells[0] ?? "") && lastCompany) row.company = lastCompany;
            else lastCompany = row.company;
            seen += 1;
            if (row.isClosed) continue;
            if (!isWantedPosting({ title: row.title, company: row.company, listKind: src.kind })) continue;
            if (!isTargetLocation(row.locationRaw)) continue;
            kept.push(`${row.company} — ${row.title}`);
          }
        }
        console.log(`  ${src.key.padEnd(28)} seen=${seen} kept=${kept.length}`);
        for (const k of kept.slice(0, 5)) console.log(`      ${k}`);
      } catch (e) {
        console.log(`  ${src.key.padEnd(28)} ERROR ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
}

main();
