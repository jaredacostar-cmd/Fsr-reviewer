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
    // ---- Mississauga (services6.arcgis.com, org hM5ymMLbxIyWTjn2)
    {
      id: 'mis-devapps',
      name: 'Mississauga – development applications (latest monthly)',
      municipality: 'Mississauga',
      kind: 'application',
      // Republished monthly as DevApps_<Month><Year>; use the newest one.
      latest: { orgId: 'hM5ymMLbxIyWTjn2', title: /^dev_?apps/i },
      url: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/DevApps_September2026_WFL1/FeatureServer',
      enabled: true,
    },
    {
      id: 'mis-gm-devapps',
      name: 'Mississauga – growth management active applications',
      municipality: 'Mississauga',
      kind: 'application',
      url: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/Growth_Management_%E2%80%93_Active_Development_Applications/FeatureServer',
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
      id: 'mis-permits',
      name: 'Mississauga – issued building permits',
      municipality: 'Mississauga',
      kind: 'permit',
      url: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/ArcGIS/rest/services/Issued_Building_Permits/FeatureServer',
      enabled: true,
    },
    {
      id: 'mis-gm-permits',
      name: 'Mississauga – growth management permits (new units / floor area)',
      municipality: 'Mississauga',
      kind: 'permit',
      url: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/Growth_Management_%E2%80%93_Issued_Building_Permits/FeatureServer',
      enabled: true,
    },

    // ---- Brampton (services3.arcgis.com, org rl7ACuZkiFsmDA2g; permits on maps1.brampton.ca)
    {
      id: 'bra-opa-zba-sub',
      name: 'Brampton – official plan / zoning amendments & subdivisions',
      municipality: 'Brampton',
      kind: 'application',
      url: 'https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Planning_Land_Use_Development/FeatureServer/9',
      enabled: true,
    },
    {
      id: 'bra-siteplan',
      name: 'Brampton – site plan approval',
      municipality: 'Brampton',
      kind: 'application',
      url: 'https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Planning_Land_Use_Development/FeatureServer/11',
      enabled: true,
    },
    {
      id: 'bra-condo',
      name: 'Brampton – draft plans of condominium',
      municipality: 'Brampton',
      kind: 'application',
      url: 'https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Planning_Land_Use_Development/FeatureServer/7',
      enabled: true,
    },
    {
      id: 'bra-dps',
      name: 'Brampton – development permit system',
      municipality: 'Brampton',
      kind: 'application',
      url: 'https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Planning_Land_Use_Development/FeatureServer/6',
      enabled: true,
    },
    {
      id: 'bra-precon',
      name: 'Brampton – pre-consultation',
      municipality: 'Brampton',
      kind: 'application',
      maxPhase: 'inception', // a closed pre-consultation has moved on to a formal application
      countUnits: false,     // its proposal repeats in the formal application; don't count units twice
      url: 'https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Planning_Land_Use_Development/FeatureServer/10',
      enabled: true,
    },
    {
      id: 'bra-permits',
      name: 'Brampton – building permits',
      municipality: 'Brampton',
      kind: 'permit',
      url: 'https://maps1.brampton.ca/arcgis/rest/services/BuildingPermit/Building_Permits/MapServer/0',
      enabled: true,
    },

    // ---- Caledon (services3.arcgis.com, org AbUjpCl3KckkXVBh; permits via utility.arcgis.com proxy)
    {
      id: 'cal-devapps',
      name: 'Caledon – development applications',
      municipality: 'Caledon',
      kind: 'application',
      url: 'https://services3.arcgis.com/AbUjpCl3KckkXVBh/arcgis/rest/services/Dev_Update_Online_Dynamic/FeatureServer/0',
      enabled: true,
    },
    {
      id: 'cal-permits',
      name: 'Caledon – building permits',
      municipality: 'Caledon',
      kind: 'permit',
      url: 'https://utility.arcgis.com/usrsvcs/servers/51b993780db441b083808ed0bd59a554/rest/services/AGOL/MiscLayers/MapServer/0',
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
