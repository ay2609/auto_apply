import type { LocationClass } from "@/db/schema";
import { searchConfig } from "@/lib/target";

/**
 * Location classes: sf / nyc / remote_us / us (anywhere else in the US) / other
 * (non-US or unparseable). Embedded and robotics work clusters well outside
 * SF/NYC (Pittsburgh, Boston, Seattle, Detroit, Huntsville, LA, DC area…), so
 * the whole US is in scope.
 */

const SF_RE = /\b(san francisco|sf\b|south sf|bay area|south bay|peninsula|silicon valley|palo alto|mountain view|menlo park|sunnyvale|cupertino|santa clara|san jose|redwood city|berkeley|oakland|alameda|burlingame|foster city|san mateo|emeryville|fremont|hayward|milpitas|san carlos|san bruno)\b/i;
const NYC_RE = /\b(new york|nyc|manhattan|brooklyn|queens|bronx|jersey city|hoboken|long island city|lic\b)\b/i;
const REMOTE_RE = /\bremote\b/i;

const US_STATES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida",
  "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska",
  "nevada", "new hampshire", "new jersey", "new mexico", "north carolina", "north dakota", "ohio", "oklahoma",
  "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah",
  "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming", "district of columbia",
];
const US_STATE_RE = new RegExp(`\\b(${US_STATES.join("|")})\\b`, "i");
/** ", CA" / "CA, " / "US-CA" style state codes — case-sensitive so "in"/"or" don't match. */
const US_CODE_RE =
  /(?:^|[\s,(\-/])(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(?=$|[\s,)\-/])/;
const US_RE = /\b(usa|u\.s\.a?\.?|united states|us\b|us-only|us only|america)\b/i;
/** Big US hubs that often appear without a state (Simplify writes "LA", "SF", "NYC"). */
const US_CITY_RE =
  /\b(la|los angeles|seattle|boston|austin|pittsburgh|chicago|detroit|denver|atlanta|houston|dallas|san diego|huntsville|arlington|reston|herndon|el segundo|hawthorne|irvine|costa mesa|long beach|torrance|redmond|bellevue|kirkland|cambridge|somerville|waltham|ann arbor|raleigh|durham|phoenix|tempe|salt lake city|portland|minneapolis|columbus|cleveland|philadelphia|baltimore|washington,? dc|college park|columbia|annapolis|mclean|chantilly|tysons|fort worth|colorado springs|boulder|madison|san antonio|tucson|albuquerque|orlando|tampa|miami|melbourne,? fl|cedar rapids|st\.? louis|kansas city|nashville|charlotte|new haven|princeton|rochester|buffalo|santa barbara|goleta|sacramento|scottsdale|chandler|plano|richardson|wichita|dayton|cincinnati|indianapolis|milwaukee)\b/i;
const NON_US_RE =
  /\b(canada|ontario|quebec|british columbia|alberta|toronto|vancouver|montreal|waterloo|ottawa|calgary|uk|united kingdom|england|scotland|london|cambridge,? uk|berlin|munich|paris|tokyo|singapore|sydney|melbourne,? (?:vic|australia)|australia|israel|tel aviv|india|bangalore|bengaluru|hyderabad|pune|chennai|mumbai|delhi|amsterdam|dublin|europe|emea|apac|latam|poland|warsaw|krakow|spain|madrid|barcelona|portugal|lisbon|italy|milan|rome|france|germany|netherlands|sweden|stockholm|norway|oslo|denmark|copenhagen|finland|helsinki|switzerland|zurich|austria|vienna|czech|prague|romania|bucharest|hungary|budapest|ukraine|kyiv|estonia|tallinn|japan|korea|seoul|china|shanghai|beijing|shenzhen|taiwan|taipei|hsinchu|hong kong|philippines|manila|indonesia|vietnam|thailand|malaysia|egypt|nigeria|kenya|south africa|colombia|brazil|mexico|guadalajara|argentina|chile|peru|costa rica|uruguay|ireland|new zealand|belgium|greece|turkey|uae|dubai|saudi|petah tikva|haifa|herzliya|yokneam|jerusalem|ra'?anana|netanya|caesarea|kfar saba|rehovot|qc|quebec|longueuil|mississauga|kanata|burnaby)\b/i;
/** Workday "CA-QC-…" / "CA - ON" style Canadian province prefixes. */
const CA_PROVINCE_RE = /\bCA\s*-\s*(?:QC|ON|BC|AB|MB|NS|NB|SK|NL|PE)\b/;

/** Unambiguous US evidence (state names, "USA", known US cities). */
function hasStrongUsMarker(s: string): boolean {
  return US_STATE_RE.test(s) || US_RE.test(s) || US_CITY_RE.test(s) || SF_RE.test(s) || NYC_RE.test(s);
}

/**
 * Two-letter codes are ambiguous ("IL - Petah Tikva" is Israel, "CA-QC-…" is
 * Quebec), so they only count when nothing points outside the US.
 */
function hasUsMarker(s: string): boolean {
  if (hasStrongUsMarker(s)) return true;
  if (NON_US_RE.test(s) || CA_PROVINCE_RE.test(s)) return false;
  return US_CODE_RE.test(s);
}

export function classify(locationRaw: string): LocationClass {
  if (!locationRaw) return "other";
  const s = locationRaw.trim();
  if (SF_RE.test(s)) return "sf";
  if (NYC_RE.test(s)) return "nyc";
  const us = hasUsMarker(s);
  if (REMOTE_RE.test(s)) {
    if ((NON_US_RE.test(s) || CA_PROVINCE_RE.test(s)) && !US_RE.test(s)) return "other";
    return "remote_us";
  }
  if (us) return "us";
  return "other";
}

/** Location strings that carry no place at all ("Unspecified", "3 Locations", "Multiple"). */
function isUnknownLocation(locationRaw: string): boolean {
  const s = locationRaw.trim();
  return !s || /^(unspecified|n\/?a|tbd|multiple(?: locations)?|various|\d+\s+locations?|hybrid|on[\s-]?site|flexible)$/i.test(s);
}

export function isTarget(loc: LocationClass): boolean {
  return loc !== "other";
}

/** The location admission check every source uses. */
export function isTargetLocation(locationRaw: string): boolean {
  if (isTarget(classify(locationRaw))) return true;
  return searchConfig().includeUnknownLocation && isUnknownLocation(locationRaw);
}
