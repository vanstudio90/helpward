/*
 * A point KNOWN to be inside each approved jurisdiction, with that
 * jurisdiction's area.
 *
 * WHY THIS FILE EXISTS. Checking that a dataset carries all 17
 * jurisdiction IDs is necessary and not sufficient. An audit built a
 * 17-row dataset whose District-of-North-Vancouver and
 * Township-of-Langley rows held DUPLICATE CITY polygons: every id
 * present, every id distinct, every geometry valid, feature_count
 * correct — and points in the District and the Township were refused.
 * The labels were right and the territory was wrong, which no amount of
 * set comparison can see.
 *
 * So coverage is also checked where it is actually felt: a point inside
 * each jurisdiction has to be serviceable. These points come from
 * ST_PointOnSurface over the provenance-loaded polygons themselves, so
 * each one is guaranteed interior rather than guessed from a map, and
 * they survive small boundary revisions because they are not near an
 * edge.
 *
 * `km2` is recorded so a replacement dataset that collapses a
 * jurisdiction to a fraction of its territory is visible even when the
 * interior point happens to survive — a township replaced by its city
 * keeps the city's centre but loses 97% of its area.
 *
 * Regenerate after a deliberate boundary change:
 *   see docs/BOUNDARY-DATASETS.md
 */

export const JURISDICTION_PROBES = [
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-burnaby", name: "Burnaby", lng: -122.95811, lat: 49.24124, km2: 96.6 },
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-coquitlam", name: "Coquitlam", lng: -122.79417, lat: 49.28546, km2: 129.6 },
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-delta", name: "Delta", lng: -122.99283, lat: 49.09738, km2: 392.0 },
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-langley-city", name: "Langley", lng: -122.65923, lat: 49.09869, km2: 10.3 },
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-langley-township", name: "Langley", lng: -122.55036, lat: 49.10612, km2: 317.5 },
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-maple-ridge", name: "Maple Ridge", lng: -122.51260, lat: 49.26053, km2: 287.1 },
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-new-westminster", name: "New Westminster", lng: -122.92099, lat: 49.20788, km2: 18.5 },
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-north-vancouver-city", name: "North Vancouver", lng: -123.07868, lat: 49.31487, km2: 14.9 },
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-north-vancouver-district", name: "North Vancouver", lng: -123.01014, lat: 49.35117, km2: 177.5 },
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-pitt-meadows", name: "Pitt Meadows", lng: -122.65280, lat: 49.27481, km2: 96.3 },
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-port-coquitlam", name: "Port Coquitlam", lng: -122.76054, lat: 49.25157, km2: 34.5 },
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-port-moody", name: "Port Moody", lng: -122.89241, lat: 49.30001, km2: 32.7 },
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-richmond", name: "Richmond", lng: -123.13563, lat: 49.17471, km2: 267.0 },
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-surrey", name: "Surrey", lng: -122.78515, lat: 49.10994, km2: 364.7 },
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-vancouver", name: "Vancouver", lng: -123.11331, lat: 49.25744, km2: 137.4 },
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-west-vancouver", name: "West Vancouver", lng: -123.20344, lat: 49.35917, km2: 99.0 },
  { areaId: "lower-mainland-bc", jurisdictionId: "bc-white-rock", name: "White Rock", lng: -122.81236, lat: 49.02089, km2: 14.3 },
  { areaId: "san-diego-ca", jurisdictionId: "ca-san-diego", name: "San Diego", lng: -117.15202, lat: 32.82449, km2: 886.7 },
];

export function probesForArea(areaId) {
  return JURISDICTION_PROBES.filter((p) => p.areaId === areaId);
}
