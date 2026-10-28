/*
 * THE APPROVED JURISDICTIONS, with their stable ids.
 *
 * Shared by the boundary loader, the activation call and preflight,
 * because the thing that went wrong was these three disagreeing about
 * what "covered" means.
 *
 * WHY IDS AND NOT NAMES. Two pairs here share a display name:
 *
 *   North Vancouver — the CITY and the DISTRICT
 *   Langley         — the CITY and the TOWNSHIP
 *
 * Both members of each pair are separate municipalities with separate
 * territory, and the district/township is several times the area of the
 * city. Boundary rows stored only the normalised NAME, so a dataset
 * containing the City of North Vancouver twice looked identical to one
 * containing the City and the District: 17 rows, 15 distinct names, no
 * missing municipality, nothing invalid. An audit built exactly that and
 * preflight said GO, while every address in the District of North
 * Vancouver and the Township of Langley silently lost coverage —
 * hundreds of square kilometres of a launch market.
 *
 * `requireStatus` is how a feature is matched to the right half of a
 * pair: the source name has to carry the status word.
 */
export const APPROVED = {
  "lower-mainland-bc": [
    { id: "bc-vancouver",          match: "Vancouver" },
    { id: "bc-burnaby",            match: "Burnaby" },
    { id: "bc-richmond",           match: "Richmond" },
    { id: "bc-new-westminster",    match: "New Westminster" },
    { id: "bc-surrey",             match: "Surrey" },
    { id: "bc-delta",              match: "Delta" },
    { id: "bc-white-rock",         match: "White Rock" },
    { id: "bc-coquitlam",          match: "Coquitlam" },
    { id: "bc-port-coquitlam",     match: "Port Coquitlam" },
    { id: "bc-port-moody",         match: "Port Moody" },
    { id: "bc-pitt-meadows",       match: "Pitt Meadows" },
    { id: "bc-maple-ridge",        match: "Maple Ridge" },
    { id: "bc-north-vancouver-city",     match: "North Vancouver", requireStatus: "city" },
    { id: "bc-north-vancouver-district", match: "North Vancouver", requireStatus: "district" },
    { id: "bc-west-vancouver",     match: "West Vancouver" },
    { id: "bc-langley-city",       match: "Langley", requireStatus: "city" },
    { id: "bc-langley-township",   match: "Langley", requireStatus: "township" },
  ],
  "san-diego-ca":   [{ id: "ca-san-diego",   match: "San Diego" }],
};
/** Every jurisdiction id we require for an area. */
export function expectedJurisdictionIds(areaId) {
  return (APPROVED[areaId] ?? []).map((j) => j.id);
}

/** Areas this module knows about. */
export function knownAreaIds() {
  return Object.keys(APPROVED);
}
