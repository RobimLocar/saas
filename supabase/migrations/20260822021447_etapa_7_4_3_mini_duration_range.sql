update ai_models set params = jsonb_set(params, '{duration_range}', '"4s–15s"'::jsonb, true) where model_id = 'seedance-1.5-pro';
