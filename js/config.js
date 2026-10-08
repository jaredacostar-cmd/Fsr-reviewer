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

  // Aerial imagery by municipality, newest first. Each year is an ArcGIS ImageServer
  // (exportImage) or MapServer (export); `tiles` is a Web Mercator tile cache for the map.
  // All of these allow cross-origin reads, so the aerial check can analyse their pixels.
  imagery: {
    Mississauga: {
      owner: 'City of Mississauga',
      bbox: [-79.82, 43.47, -79.52, 43.74],
      years: {
        2024: { label: '2024', url: 'https://exwai.maps.mississauga.ca/img/rest/services/Imagery/2024_Aerial_Imagery/ImageServer' },
        2023: { label: '2023', url: 'https://exwai.maps.mississauga.ca/img/rest/services/Imagery/2023_Aerial_Imagery/ImageServer' },
        2022: { label: '2022', url: 'https://exwai.maps.mississauga.ca/img/rest/services/Imagery/2022_Aerial_Imagery/ImageServer' },
        2021: { label: '2021', url: 'https://exwai.maps.mississauga.ca/img/rest/services/Imagery/2021_Aerial_Imagery/ImageServer' },
        2020: { label: '2020', url: 'https://exwai.maps.mississauga.ca/img/rest/services/Imagery/2020_Aerial_Imagery/ImageServer' },
        2019: { label: '2019', url: 'https://exwai.maps.mississauga.ca/img/rest/services/Imagery/2019_Aerial_Imagery/ImageServer' },
        2018: { label: '2018', url: 'https://exwai.maps.mississauga.ca/img/rest/services/Imagery/2018_Aerial_Imagery/ImageServer' },
        2017: { label: '2017', url: 'https://exwai.maps.mississauga.ca/img/rest/services/Imagery/2017_Aerial_Imagery/ImageServer' },
        2016: { label: '2016', url: 'https://exwai.maps.mississauga.ca/img/rest/services/Imagery/2016_Aerial_Imagery/ImageServer' },
        2015: { label: '2015', url: 'https://exwai.maps.mississauga.ca/img/rest/services/Imagery/2015_Aerial_Imagery/ImageServer' },
        2014: { label: '2014', url: 'https://exwai.maps.mississauga.ca/img/rest/services/Imagery/2014_Aerial_Imagery/ImageServer' },
        2013: { label: '2013', url: 'https://exwai.maps.mississauga.ca/img/rest/services/Imagery/2013_Aerial_Imagery/ImageServer' },
      },
    },
    Brampton: {
      owner: 'City of Brampton',
      bbox: [-79.89, 43.61, -79.62, 43.85],
      years: {
        2004: { label: '2004 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2004F_SID_MOSAIC/ImageServer' },
        2005: { label: '2005 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2005F_SID_MOSAIC/ImageServer' },
        2006: { label: '2006 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2006F_SID_MOSAIC/ImageServer' },
        2007: { label: '2007 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2007F_SID_MOSAIC/ImageServer' },
        2008: { label: '2008 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2008F_SID_MOSAIC/ImageServer' },
        2009: { label: '2009 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2009F_SID_MOSAIC/ImageServer' },
        2010: { label: '2010 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2010F_SID_MOSAIC/ImageServer' },
        2011: { label: '2011 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2011F_SID_MOSAIC/ImageServer' },
        2012: { label: '2012 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2012F_SID_MOSAIC/ImageServer' },
        2013: { label: '2013 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2013F_SID_MOSAIC/ImageServer' },
        2014: { label: '2014 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2014F_SID_MOSAIC/ImageServer' },
        2015: { label: '2015 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2015F_SID_MOSAIC/ImageServer' },
        2018: { label: '2018 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2018F_SID_MOSAIC/ImageServer' },
        2019: { label: '2019 spring', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2019S_SID_MOSAIC/ImageServer' },
        2020: { label: '2020 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2020F_SID_MOSAIC/ImageServer' },
        2021: { label: '2021 spring', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2021S_SID_MOSAIC/ImageServer' },
        2022: { label: '2022 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2022F_SID_MOSAIC/ImageServer' },
        2023: { label: '2023 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2023F_SID_MOSAIC/ImageServer' },
        2024: { label: '2024 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2024F_SID_MOSAIC/ImageServer' },
        2025: { label: '2025 fall', url: 'https://maps1.brampton.ca/image/rest/services/Imagery/BRAM2025F_SID_MOSAIC/ImageServer' },
      },
    },
    Caledon: {
      owner: 'Town of Caledon',
      bbox: [-80.10, 43.74, -79.62, 44.02],
      tiles: 'https://utility.arcgis.com/usrsvcs/servers/dc046e30f8924e2990b233c8c5749b7c/rest/services/Basemaps/OrthoCurrent_WebMercatorCache/MapServer/tile/{z}/{y}/{x}',
      years: {
        2025: { label: '2025', url: 'https://utility.arcgis.com/usrsvcs/servers/4a5dde0fe97b4efe9d5a658284466e40/rest/services/Basemaps/Ortho2025Cache/MapServer' },
        2024: { label: '2024', url: 'https://utility.arcgis.com/usrsvcs/servers/f2b850e7a54f4697959529d53f37e5b5/rest/services/Basemaps/Ortho2024Cache/MapServer' },
        2023: { label: '2023', url: 'https://utility.arcgis.com/usrsvcs/servers/996fd7c185354720957765c6d68f2c1a/rest/services/Basemaps/Ortho2023Cache/MapServer' },
        2022: { label: '2022', url: 'https://utility.arcgis.com/usrsvcs/servers/6b379e7176594a588e6fe9f94a1c834d/rest/services/Basemaps/Ortho2022Cache/MapServer' },
        2021: { label: '2021', url: 'https://utility.arcgis.com/usrsvcs/servers/29e34b74c2f34ad19f301ec306086a20/rest/services/Basemaps/Ortho2021Cache/MapServer' },
        2020: { label: '2020', url: 'https://utility.arcgis.com/usrsvcs/servers/de5c79cbcfa241a2867f0cf7331bbab4/rest/services/Basemaps/Ortho2020Cache/MapServer' },
        2019: { label: '2019', url: 'https://utility.arcgis.com/usrsvcs/servers/865eacefb4514055956a7d30e2a8658d/rest/services/Basemaps/Ortho2019Cache/MapServer' },
        2018: { label: '2018', url: 'https://utility.arcgis.com/usrsvcs/servers/af3fa7fcff4440e4a6d281af1a262f4b/rest/services/Basemaps/Ortho2018Cache/MapServer' },
        2017: { label: '2017', url: 'https://utility.arcgis.com/usrsvcs/servers/feba2610b3fb4adcb3f615b758e34fde/rest/services/Basemaps/Ortho2017Cache/MapServer' },
        2016: { label: '2016', url: 'https://utility.arcgis.com/usrsvcs/servers/2a70dc8d866a4416bc565e649c4b7437/rest/services/Basemaps/Ortho2016Cache/MapServer' },
        2015: { label: '2015', url: 'https://utility.arcgis.com/usrsvcs/servers/1401d8dc599c4e7aa4657f6f226fbb85/rest/services/Basemaps/Ortho2015Cache/MapServer' },
        2014: { label: '2014', url: 'https://utility.arcgis.com/usrsvcs/servers/41b54da52c2e417a818aace653e7675a/rest/services/Basemaps/Ortho2014Cache/MapServer' },
      },
    },
  },

  // Building footprints traced from each year's aerial (Mississauga), or current (Brampton).
  footprints: {
    Mississauga: {
      years: {
        2024: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/Building_Footprints_2024/FeatureServer/0',
        2023: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/Building_Footprints_2023/FeatureServer/0',
        2022: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/Building_Footprints_2022/FeatureServer/0',
        2021: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/Building_Footprints_2021/FeatureServer/0',
        2020: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/Building_Footprints_2020/FeatureServer/0',
      },
    },
    Brampton: { current: 'https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Building_Footprints/FeatureServer/0' },
  },

  // Query defaults (editable in the UI).
  sinceYear: 2016,
  maxPerLayer: 20000,
  pageSize: 2000,
};
if (typeof module !== 'undefined' && module.exports) module.exports = PEEL_CONFIG;
else root.PEEL_CONFIG = PEEL_CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
