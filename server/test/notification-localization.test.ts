import assert from 'node:assert/strict';
import test from 'node:test';
import { localizeNotification } from '../src/notification-localization.js';

test('localizes notification literals and preserves English', () => {
  assert.equal(localizeNotification('uk', 'Purchase completed'), 'Покупку завершено');
  assert.equal(localizeNotification('ru', 'Purchase completed'), 'Покупка завершена');
  assert.equal(localizeNotification('en', 'Purchase completed'), 'Purchase completed');
});

test('localizes dynamic notification content without changing business values', () => {
  assert.equal(
    localizeNotification('uk', 'Your purchase of Monitor Pro is complete.'),
    'Покупку «Monitor Pro» завершено.',
  );
  assert.equal(
    localizeNotification('ru', 'Q3 2026 performance was imported with 3 White Sparks.'),
    'Результаты за Q3 2026 импортированы; начислено 3 White Sparks.',
  );
  assert.equal(
    localizeNotification('uk', 'person@c-job.com requested access with Microsoft.'),
    'person@c-job.com запитує доступ через Microsoft.',
  );
});

test('keeps administrator-entered reasons unchanged', () => {
  const reason = 'Approved after a manual HR check';
  assert.equal(localizeNotification('uk', reason), reason);
  assert.equal(localizeNotification('ru', reason), reason);
});
