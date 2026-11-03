-- Day6 stop 2: exact address match in Tainan's published house-number coordinates.
-- Preserve the existing stop ID, assignment references, and all other map corrections.
begin;
do $$
begin
 if not exists(select 1 from public.route_stop_overlays where id='d6000000-0000-4000-8000-000000000001' and route_token='日間6' and stop_name='大橋一街228號' and display_order=2 and status='active') then
  raise exception 'Day6 stop identity changed; location correction not applied';
 end if;
end $$;
insert into public.achang_day_route_catalogs(catalog_id,payload,updated_at)
values('map_location_overrides','{"version":1,"checked_date":"2026-11-04","stops":[{"source_id":"OVERLAY:d6000000-0000-4000-8000-000000000001","source_name":"大橋一街228號","route":"日間6","original_order":2,"longitude":120.229396336,"latitude":23.017772546,"status":"address_match","address_confirmed":true,"confirmed_address":"臺南市永康區大橋一街228號","confirmation_source":"Owner於2026-11-03指定","previous_name":"大橋一街103巷口","notes":[],"verification":{"exact_match":true,"match_count":1,"source":"臺南市政府民政局｜114年臺南市門牌坐標資料","source_url":"https://data.tainan.gov.tw/File/ResourceCsvDownload/af44f904-2f4c-49b2-aaf8-1a64dce09bd4","dataset_url":"https://data.gov.tw/dataset/120044","checked_date":"2026-11-04","input_crs":"EPSG:3826","twd97_e":171012.34,"twd97_n":2546458.84,"output_crs":"EPSG:4326","source_record":{"縣市別代碼":"67000","地址-行政區域代碼":"6703100","村里":"大橋里","鄰":"27","街路段":"大橋一街","地區":"","巷":"","弄":"","號":"228號","橫座標[E 坐標]":"171012.34","縱座標[N 坐標]":"2546458.84"},"source_record_sha256":"08c911e217edc268f6c9599d398b120d0eaebec04eb2c0dc4373889105439b7b","coordinate_notice":"市府門牌參考座標，非實測定位"}}]}'::jsonb,now())
on conflict(catalog_id) do update set
 payload=achang_day_route_catalogs.payload||excluded.payload||jsonb_build_object('stops',
  coalesce((select jsonb_agg(stop) from jsonb_array_elements(achang_day_route_catalogs.payload->'stops') stop where stop->>'source_id'<>'OVERLAY:d6000000-0000-4000-8000-000000000001'),'[]'::jsonb)||(excluded.payload->'stops')),
 updated_at=now();
commit;
