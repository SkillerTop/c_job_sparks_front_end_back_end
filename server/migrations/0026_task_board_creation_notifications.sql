ALTER TABLE app.notifications
  DROP CONSTRAINT notifications_notification_type_check;

ALTER TABLE app.notifications
  ADD CONSTRAINT notifications_notification_type_check CHECK (notification_type IN (
    'ApprovalRequested', 'AwardApproved', 'AwardRejected', 'SparksCredited',
    'PurchaseCompleted', 'InventoryActivated', 'InventoryExpiring',
    'DisenchantStatusChanged', 'TaskCreated', 'TaskBooked', 'TaskUnassigned', 'TaskCompleted',
    'TaskRewardFailed', 'System'
  ));
