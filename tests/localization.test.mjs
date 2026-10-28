import assert from 'node:assert/strict';
import test from 'node:test';
import { EN_TRANSLATIONS, translate } from '@/constants/translations';
import { localizeContent } from '@/services/contentLocalization';

test('lazy interface dictionaries preserve the stable English key contract', async () => {
  const [{ UK_TRANSLATIONS }, { RU_TRANSLATIONS }] = await Promise.all([
    import('@/constants/translations.uk'),
    import('@/constants/translations.ru'),
  ]);
  const englishKeys = Object.keys(EN_TRANSLATIONS).sort();
  assert.deepEqual(Object.keys(UK_TRANSLATIONS).sort(), englishKeys);
  assert.deepEqual(Object.keys(RU_TRANSLATIONS).sort(), englishKeys);
  assert.equal(translate(UK_TRANSLATIONS, 'shell.forEmployee', { name: 'Olena' }), 'Для Olena');
  assert.equal(translate(RU_TRANSLATIONS, 'shell.forEmployee', { name: 'Alex' }), 'Для Alex');
});

test('localizes interface copy into natural Ukrainian and Russian', () => {
  assert.equal(localizeContent('uk', 'Peer recognition'), 'Визнання колег');
  assert.equal(localizeContent('ru', 'Peer recognition'), 'Признание коллег');
  const source = 'Disenchant requests from employees in this department will appear here. This frontend does not send payments.';
  assert.equal(localizeContent('uk', source), 'Тут з’являться запити на розпилення від працівників цього відділу. Цей інтерфейс не здійснює виплат.');
  assert.equal(localizeContent('ru', source), 'Здесь появятся запросы на распыление от сотрудников этого отдела. Этот интерфейс не выполняет выплаты.');
});

test('uses correct plural forms for dynamic category counts', () => {
  assert.equal(localizeContent('uk', '1 active categories'), '1 активна категорія');
  assert.equal(localizeContent('uk', '3 active categories'), '3 активні категорії');
  assert.equal(localizeContent('uk', '10 active categories'), '10 активних категорій');
  assert.equal(localizeContent('ru', '1 active categories'), '1 активная категория');
  assert.equal(localizeContent('ru', '3 active categories'), '3 активные категории');
  assert.equal(localizeContent('ru', '10 active categories'), '10 активных категорий');
});

test('preserves interpolated business data and surrounding whitespace', () => {
  assert.equal(localizeContent('uk', '  Awarded by Olena  '), '  Нагородив: Olena  ');
  assert.equal(localizeContent('ru', 'Good morning, Alex.'), 'Доброе утро, Alex.');
  assert.equal(localizeContent('uk', 'Custom administrator text'), 'Custom administrator text');
});
