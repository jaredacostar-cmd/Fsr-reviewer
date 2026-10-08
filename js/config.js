/*
 * Data sources. All are public ArcGIS REST services published by the Peel
 * municipalities; they are queried directly from the browser.
 *
 * - `services`: known FeatureServer/MapServer URLs, loaded on start-up.
 * - `hubs`: the municipalities' ArcGIS Hub open-data sites. "Discover datasets"
 *   resolves each hub to its ArcGIS Online organisation and lists every
 *   development / planning / permit feature service it publishes, so new or
 *   renamed datasets are picked up without editing this file.
 *
 * kind: 'application' (planning files: OPA, ZBA, subdivision, site plan, ...)
 *       'permit'      (building permits: issuance, inspections, closure)
 */
(function (root) {
'use strict';
const PEEL_CONFIG = {
  // Peel Region bounding box (WGS84). Every query is clipped to it.
  bbox: { xmin: -80.16, ymin: 43.47, xmax: -79.48, ymax: 44.00 },
  center: [43.70, -79.80],
  zoom: 10,

  services: [
    {
      id: 'mis-devapps',
      name: 'Mississauga – active development applications',
      municipality: 'Mississauga',
      kind: 'application',
      url: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/ArcGIS/rest/services/GrowthManagementActiveDevelopmentApplications/FeatureServer',
      enabled: true,
    },
    {
      id: 'mis-siteplan',
      name: 'Mississauga – site plan applications',
      municipality: 'Mississauga',
      kind: 'application',
      url: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/ArcGIS/rest/services/Site_Plan_Applications/FeatureServer',
      enabled: true,
    },
    {
      id: 'mis-permits-growth',
      name: 'Mississauga – permits adding units / floor area',
      municipality: 'Mississauga',
      kind: 'permit',
      url: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/ArcGIS/rest/services/GrowthManagement_IssuedBuildingPermits/FeatureServer',
      enabled: true,
    },
    {
      id: 'mis-permits',
      name: 'Mississauga – all issued building permits (status)',
      municipality: 'Mississauga',
      kind: 'permit',
      url: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/ArcGIS/rest/services/Issued_Building_Permits/FeatureServer',
      enabled: true,
    },
  ],

  hubs: [
    { municipality: 'Mississauga', host: 'data.mississauga.ca' },
    { municipality: 'Brampton',    host: 'geohub.brampton.ca' },
    { municipality: 'Caledon',     host: 'data-caledon.opendata.arcgis.com' },
    { municipality: 'Peel Region', host: 'data.peelregion.ca' },
  ],

  // Which hub datasets count as "development" data, and how to tell permits apart.
  discoverQuery: '(title:permit OR title:permits OR title:development OR title:"site plan" OR title:subdivision OR title:"zoning by-law amendment" OR title:"official plan amendment" OR title:"planning application" OR title:"planning applications" OR title:"development applications")',
  discoverExclude: /parking|sign permit|road occupancy|film|patio|tree|dog|pool|fence|lottery|taxi|heritage permit|commissioner|charges|levy|fee/i,
  permitPattern: /permit/i,

  // Query defaults (editable in the UI).
  sinceYear: 2016,
  maxPerLayer: 20000,
  pageSize: 2000,
};
if (typeof module !== 'undefined' && module.exports) module.exports = PEEL_CONFIG;
else root.PEEL_CONFIG = PEEL_CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
