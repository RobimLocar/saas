update ai_models set params = jsonb_set(params, '{credit_per_second}', '{"480p":13,"720p":31,"1080p":71}'::jsonb, true) where model_id = 'seedance-2.5';
