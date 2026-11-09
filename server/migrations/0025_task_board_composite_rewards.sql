-- Task Board rewards use the same one-to-three spendable Spark composition as
-- Reward Shop prices. Radiant remains a direct Top Management distinction.
CREATE FUNCTION app.valid_spendable_spark_components(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  component jsonb;
  seen_types text[] := ARRAY[]::text[];
  spark_type text;
  amount_text text;
BEGIN
  IF jsonb_typeof(value) <> 'array' OR jsonb_array_length(value) NOT BETWEEN 1 AND 3 THEN
    RETURN false;
  END IF;
  FOR component IN SELECT item FROM jsonb_array_elements(value) item LOOP
    IF jsonb_typeof(component) <> 'object' THEN RETURN false; END IF;
    spark_type := component->>'sparkType';
    amount_text := component->>'amount';
    IF spark_type NOT IN ('White', 'Yellow', 'Blue')
      OR spark_type = ANY(seen_types)
      OR amount_text IS NULL
      OR amount_text !~ '^[1-9][0-9]*$'
      OR amount_text::numeric > 1000000 THEN
      RETURN false;
    END IF;
    seen_types := array_append(seen_types, spark_type);
  END LOOP;
  RETURN true;
END;
$$;

ALTER TABLE app.task_board_approval_sessions
  ADD COLUMN reward_components jsonb;

UPDATE app.task_board_approval_sessions
   SET reward_components=jsonb_build_array(jsonb_build_object(
     'sparkType','White','amount',reward_amount
   ));

ALTER TABLE app.task_board_approval_sessions
  ALTER COLUMN reward_components SET NOT NULL,
  ADD CONSTRAINT task_board_approval_reward_components_valid
    CHECK (app.valid_spendable_spark_components(reward_components)),
  ADD CONSTRAINT task_board_approval_primary_reward_consistent
    CHECK (reward_amount=(reward_components->0->>'amount')::integer);

ALTER TABLE app.task_board_tasks
  ADD COLUMN reward_components jsonb;

UPDATE app.task_board_tasks
   SET reward_components=jsonb_build_array(jsonb_build_object(
     'sparkType',reward_spark_type,'amount',reward_amount
   ));

ALTER TABLE app.task_board_tasks
  DROP CONSTRAINT task_board_tasks_reward_spark_type_check,
  ADD CONSTRAINT task_board_tasks_reward_spark_type_check
    CHECK (reward_spark_type IN ('White','Yellow','Blue')),
  ALTER COLUMN reward_components SET NOT NULL,
  ADD CONSTRAINT task_board_reward_components_valid
    CHECK (app.valid_spendable_spark_components(reward_components)),
  ADD CONSTRAINT task_board_primary_reward_consistent CHECK (
    reward_spark_type=reward_components->0->>'sparkType'
    AND reward_amount=(reward_components->0->>'amount')::integer
  );
