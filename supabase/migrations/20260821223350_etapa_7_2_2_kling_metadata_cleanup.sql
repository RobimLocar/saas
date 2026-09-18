update ai_models set params = jsonb_set(jsonb_set(params, '{resolution}', '"1080p"'::jsonb, true), '{has_audio}', 'false'::jsonb, true) where model_id = 'kling-omni';
update ai_models set params = jsonb_set(params, '{has_audio}', 'false'::jsonb, true) where model_id = 'kling-2.5-turbo';
