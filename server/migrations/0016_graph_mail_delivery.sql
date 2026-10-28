ALTER TABLE app.outbox_events
  ADD COLUMN failed_at timestamptz;

ALTER TABLE app.outbox_events
  ADD CONSTRAINT outbox_events_delivery_terminal_check CHECK (
    published_at IS NULL OR failed_at IS NULL
  );

-- Reward fulfillment events created before a mail adapter existed must not be
-- delivered retroactively when the worker is first enabled.
UPDATE app.outbox_events
   SET published_at = clock_timestamp(),
       last_error = 'Skipped: created before Graph mail delivery was enabled.'
 WHERE event_type = 'RewardFulfillmentRequested'
   AND published_at IS NULL
   AND payload ? 'emailTo';

CREATE INDEX outbox_events_mail_pending_idx
  ON app.outbox_events(available_at, occurred_at)
  WHERE published_at IS NULL
    AND failed_at IS NULL
    AND event_type = 'RewardFulfillmentRequested';
