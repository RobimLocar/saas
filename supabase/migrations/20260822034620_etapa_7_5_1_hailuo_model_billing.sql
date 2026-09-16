update ai_models set params = jsonb_set(params, '{credit_cost_map}', '{"768":{"6":19,"10":36},"1080":{"6":32}}'::jsonb, true) where model_id = 'hailuo';
update ai_models set params = jsonb_set(jsonb_set(params, '{hailuo_model}', '"v2.3-fast"'::jsonb, true), '{credit_cost_map}', '{"768":{"6":13,"10":21},"1080":{"6":21}}'::jsonb, true) where model_id = 'hailuo-live';
