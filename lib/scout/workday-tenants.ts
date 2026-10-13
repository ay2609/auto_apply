/**
 * Workday career sites polled by the Workday scout (each verified against the
 * CXS search API on 2026-10-13; RTX covers Raytheon, Collins and Pratt & Whitney). `domain: true` = robotics/embedded-native company, so its
 * generic engineering internships count too.
 *
 * To add one: open the company's careers page, find the
 * <tenant>.wdN.myworkdayjobs.com/<site> URL, and check
 *   curl -s -XPOST https://<host>/wday/cxs/<tenant>/<site>/jobs \
 *     -H 'Content-Type: application/json' -d '{"appliedFacets":{},"limit":1,"offset":0,"searchText":"intern"}'
 */
export type WorkdayTenant = { company: string; host: string; tenant: string; site: string; domain?: boolean };

export const WORKDAY_TENANTS: WorkdayTenant[] = [
  { company: "ABB", host: "abb.wd3.myworkdayjobs.com", tenant: "abb", site: "External_Career_Page" },
  { company: "Abbott", host: "abbott.wd5.myworkdayjobs.com", tenant: "abbott", site: "abbottcareers" },
  { company: "Allison Transmission", host: "allisontransmission.wd1.myworkdayjobs.com", tenant: "allisontransmission", site: "ATI-External" },
  { company: "Analog Devices", host: "analogdevices.wd1.myworkdayjobs.com", tenant: "analogdevices", site: "External" },
  { company: "Applied Materials", host: "amat.wd1.myworkdayjobs.com", tenant: "amat", site: "External" },
  { company: "Aptiv", host: "aptiv.wd5.myworkdayjobs.com", tenant: "aptiv", site: "APTIV_CAREERS" },
  { company: "Axiom Space", host: "axiomspace.wd5.myworkdayjobs.com", tenant: "axiomspace", site: "External_Career_Site", domain: true },
  { company: "Blue Origin", host: "blueorigin.wd5.myworkdayjobs.com", tenant: "blueorigin", site: "BlueOrigin", domain: true },
  { company: "Boeing", host: "boeing.wd1.myworkdayjobs.com", tenant: "boeing", site: "EXTERNAL_CAREERS", domain: true },
  { company: "BorgWarner", host: "borgwarner.wd5.myworkdayjobs.com", tenant: "borgwarner", site: "BorgWarner_Careers" },
  { company: "Boston Dynamics", host: "bostondynamics.wd1.myworkdayjobs.com", tenant: "bostondynamics", site: "Boston_Dynamics", domain: true },
  { company: "Broadcom", host: "broadcom.wd1.myworkdayjobs.com", tenant: "broadcom", site: "External_Career" },
  { company: "Cadence", host: "cadence.wd1.myworkdayjobs.com", tenant: "cadence", site: "External_Careers" },
  { company: "Caterpillar", host: "cat.wd5.myworkdayjobs.com", tenant: "cat", site: "CaterpillarCareers" },
  { company: "Dexcom", host: "dexcom.wd1.myworkdayjobs.com", tenant: "dexcom", site: "Dexcom" },
  { company: "Draper", host: "draper.wd5.myworkdayjobs.com", tenant: "draper", site: "Draper_Careers", domain: true },
  { company: "GE Aerospace", host: "geaerospace.wd5.myworkdayjobs.com", tenant: "geaerospace", site: "GE_ExternalSite", domain: true },
  { company: "GE HealthCare", host: "gehc.wd5.myworkdayjobs.com", tenant: "gehc", site: "GEHC_ExternalSite" },
  { company: "General Dynamics IT (GDIT)", host: "gdit.wd5.myworkdayjobs.com", tenant: "gdit", site: "External_Career_Site" },
  { company: "General Motors", host: "generalmotors.wd5.myworkdayjobs.com", tenant: "generalmotors", site: "Careers_GM" },
  { company: "HP", host: "hp.wd5.myworkdayjobs.com", tenant: "hp", site: "ExternalCareerSite" },
  { company: "HPE", host: "hpe.wd5.myworkdayjobs.com", tenant: "hpe", site: "Jobsathpe" },
  { company: "Insulet", host: "insulet.wd5.myworkdayjobs.com", tenant: "insulet", site: "insuletcareers" },
  { company: "Intel", host: "intel.wd1.myworkdayjobs.com", tenant: "intel", site: "External" },
  { company: "Johnson & Johnson", host: "jj.wd5.myworkdayjobs.com", tenant: "jj", site: "JJ" },
  { company: "KLA", host: "kla.wd1.myworkdayjobs.com", tenant: "kla", site: "Search" },
  { company: "Lattice Semiconductor", host: "latticesemi.wd5.myworkdayjobs.com", tenant: "latticesemi", site: "latticesemiconductorscareers" },
  { company: "Leidos", host: "leidos.wd5.myworkdayjobs.com", tenant: "leidos", site: "External" },
  { company: "Magna", host: "magna.wd3.myworkdayjobs.com", tenant: "magna", site: "Magna" },
  { company: "Marvell", host: "marvell.wd1.myworkdayjobs.com", tenant: "marvell", site: "MarvellCareers" },
  { company: "Medtronic", host: "medtronic.wd1.myworkdayjobs.com", tenant: "medtronic", site: "MedtronicCareers" },
  { company: "Microchip Technology", host: "microchiphr.wd5.myworkdayjobs.com", tenant: "microchiphr", site: "External" },
  { company: "Micron", host: "micron.wd1.myworkdayjobs.com", tenant: "micron", site: "External" },
  { company: "Moog", host: "moog.wd5.myworkdayjobs.com", tenant: "moog", site: "MOOG_External_Career_Site", domain: true },
  { company: "Motorola Solutions", host: "motorolasolutions.wd5.myworkdayjobs.com", tenant: "motorolasolutions", site: "Careers" },
  { company: "Northrop Grumman", host: "ngc.wd1.myworkdayjobs.com", tenant: "ngc", site: "Northrop_Grumman_External_Site", domain: true },
  { company: "NVIDIA", host: "nvidia.wd5.myworkdayjobs.com", tenant: "nvidia", site: "NVIDIAExternalCareerSite" },
  { company: "NXP", host: "nxp.wd3.myworkdayjobs.com", tenant: "nxp", site: "careers" },
  { company: "Philips", host: "philips.wd3.myworkdayjobs.com", tenant: "philips", site: "jobs-and-careers" },
  { company: "Polaris", host: "polaris.wd5.myworkdayjobs.com", tenant: "polaris", site: "PolarisJobs" },
  { company: "Procept BioRobotics", host: "proceptbiorobotics.wd108.myworkdayjobs.com", tenant: "proceptbiorobotics", site: "PROCEPT", domain: true },
  { company: "Rockwell Automation", host: "rockwellautomation.wd1.myworkdayjobs.com", tenant: "rockwellautomation", site: "External_Rockwell_Automation" },
  { company: "RTX", host: "globalhr.wd5.myworkdayjobs.com", tenant: "globalhr", site: "REC_RTX_Ext_Gateway", domain: true },
  { company: "Sierra Nevada Corp", host: "snc.wd1.myworkdayjobs.com", tenant: "snc", site: "SNC_External_Career_Site", domain: true },
  { company: "Sierra Space", host: "sierraspace.wd1.myworkdayjobs.com", tenant: "sierraspace", site: "Sierra_Space_External_Career_Site", domain: true },
  { company: "SiFive", host: "sifive.wd1.myworkdayjobs.com", tenant: "sifive", site: "sifivecareers" },
  { company: "Stryker", host: "stryker.wd1.myworkdayjobs.com", tenant: "stryker", site: "StrykerCareers" },
  { company: "Tandem Diabetes", host: "tandemdiabetes.wd12.myworkdayjobs.com", tenant: "tandemdiabetes", site: "tandemdiabetes" },
  { company: "Zebra Technologies", host: "zebra.wd501.myworkdayjobs.com", tenant: "zebra", site: "Zebra_careers" },
];
