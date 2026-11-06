import json
R=json.load(open('results2.json')); D='/home/user/Fsr-reviewer/deliverables/priority-areas-2031'
K=['u26','u2631','u31','uF','p26','p2631','p31','pF','j26','j2631','j31','jF']
fs=[]
for a in R['areas']:
    fs.append({'type':'Feature','geometry':a['boundary'],'properties':{'kind':'area_boundary','area_id':a['code'],'name':a['name'],'boundary':a['mode'],'why':a['why'],'boundary_ha':a['boundaryHa'],'map_pop':a['mapPop'],'map_ha':a['mapHa'],'ppt_slide':10+a['id'],**{k:round(a['total'][k]) for k in K}}})
    fs.append({'type':'Feature','geometry':{'type':'Polygon','coordinates':[a['ring']+[a['ring'][0]]]},'properties':{'kind':'region_map_box','area_id':a['code'],'name':a['name'],'box_ha':a['boxHa'],'resized':'px_original' in a}})
    for r in a['rows']:
        fs.append({'type':'Feature','geometry':{'type':'Point','coordinates':[round(r['lng'],6),round(r['lat'],6)]},'properties':{'kind':'application','dev_id':r['id'],'area_id':a['code'],'title':r['title'],'stage':r['stage'],'files':r['files'],'parcel_ha':r['parcelHa'],**{k:round(r[k],1) for k in K}}})
    for d in a['dots']:
        fs.append({'type':'Feature','geometry':{'type':'Point','coordinates':[round(d['lon'],6),round(d['lat'],6)]},'properties':{'kind':'region_map_point','point_id':d['dot'],'area_id':a['code'],'legend':d['kind'],'matched_dev_id':d['match'],'distance_m':d['dist'],'inside_boundary':d['inside']}})
json.dump({'type':'FeatureCollection','name':'priority_areas_2031_growth','properties':{'basis':'growth since 2021 Census (census day 2021-05-11); u/p/j = units/people/jobs; 26 = 2021-2026, 2631 = 2026-2031, 31 = total to 2031, F = final growth'},'features':fs},open(f'{D}/priority_areas_2031.geojson','w'))
print('geojson', len(fs))
