export type NotificationLanguage = 'en' | 'uk' | 'ru';

const uk: Record<string, string> = {
  'New Microsoft access request': 'Новий запит на доступ через Microsoft',
  'New access request': 'Новий запит на доступ',
  'Peer Recognition approval': 'Погодження визнання колеги',
  'A new Peer Recognition request needs your decision.': 'Новий запит на визнання колеги потребує вашого рішення.',
  'White Sparks credited': 'White Sparks зараховано',
  'A Peer Recognition award was credited to your balance.': 'Нагороду за визнання колеги зараховано на ваш баланс.',
  'Spark award approval': 'Погодження нагороди Spark',
  'A new Spark award request needs your decision.': 'Новий запит на нагороду Spark потребує вашого рішення.',
  'A direct award was credited to your balance.': 'Пряму нагороду зараховано на ваш баланс.',
  'Sparks credited': 'Sparks зараховано',
  'An approved award was credited to your balance.': 'Погоджену нагороду зараховано на ваш баланс.',
  'New Disenchant request': 'Новий запит на розпилення',
  'A new department Disenchant request is ready for review.': 'Новий запит на розпилення у відділі готовий до перевірки.',
  'Quality Gate added': 'Quality Gate додано',
  'Quality Gate cancelled': 'Quality Gate скасовано',
  'Your active Quality Gate was cancelled.': 'Ваш активний Quality Gate скасовано.',
  'Purchase completed': 'Покупку завершено',
  'Item activated': 'Предмет активовано',
  'Your inventory item is now active.': 'Предмет у вашому інвентарі тепер активний.',
  'Disenchant included in monthly report': 'Запит на розпилення включено до місячного звіту',
  'Your Disenchant request was included in the department monthly report.': 'Ваш запит на розпилення включено до місячного звіту відділу.',
  'Disenchant request exported': 'Запит на розпилення експортовано',
  'Your Disenchant request is now Exported.': 'Ваш запит на розпилення експортовано.',
  'Performance recorded': 'Результати роботи збережено',
  'Performance reward recorded': 'Нагороду за результати роботи збережено',
};

const ru: Record<string, string> = {
  'New Microsoft access request': 'Новый запрос на доступ через Microsoft',
  'New access request': 'Новый запрос на доступ',
  'Peer Recognition approval': 'Согласование признания коллеги',
  'A new Peer Recognition request needs your decision.': 'Новый запрос на признание коллеги требует вашего решения.',
  'White Sparks credited': 'White Sparks начислены',
  'A Peer Recognition award was credited to your balance.': 'Награда за признание коллеги начислена на ваш баланс.',
  'Spark award approval': 'Согласование награды Spark',
  'A new Spark award request needs your decision.': 'Новый запрос на награду Spark требует вашего решения.',
  'A direct award was credited to your balance.': 'Прямая награда начислена на ваш баланс.',
  'Sparks credited': 'Sparks начислены',
  'An approved award was credited to your balance.': 'Согласованная награда начислена на ваш баланс.',
  'New Disenchant request': 'Новый запрос на распыление',
  'A new department Disenchant request is ready for review.': 'Новый запрос на распыление в отделе готов к проверке.',
  'Quality Gate added': 'Quality Gate добавлен',
  'Quality Gate cancelled': 'Quality Gate отменён',
  'Your active Quality Gate was cancelled.': 'Ваш активный Quality Gate отменён.',
  'Purchase completed': 'Покупка завершена',
  'Item activated': 'Предмет активирован',
  'Your inventory item is now active.': 'Предмет в вашем инвентаре теперь активен.',
  'Disenchant included in monthly report': 'Запрос на распыление включён в месячный отчёт',
  'Your Disenchant request was included in the department monthly report.': 'Ваш запрос на распыление включён в месячный отчёт отдела.',
  'Disenchant request exported': 'Запрос на распыление экспортирован',
  'Your Disenchant request is now Exported.': 'Ваш запрос на распыление экспортирован.',
  'Performance recorded': 'Результаты работы сохранены',
  'Performance reward recorded': 'Награда за результаты работы сохранена',
};

const decision = (value: string, language: Exclude<NotificationLanguage, 'en'>) => {
  const approved = value.toLowerCase() === 'approved';
  return language === 'uk'
    ? (approved ? 'погоджено' : 'відхилено')
    : (approved ? 'согласован' : 'отклонён');
};

const status = (value: string, language: Exclude<NotificationLanguage, 'en'>) => {
  const values = language === 'uk'
    ? { Created: 'створено', Exported: 'експортовано', Paid: 'оплачено', Cancelled: 'скасовано', Ordered: 'замовлено', InProgress: 'в роботі', Ready: 'готово', Delivered: 'видано' }
    : { Created: 'создан', Exported: 'экспортирован', Paid: 'оплачен', Cancelled: 'отменён', Ordered: 'заказан', InProgress: 'в работе', Ready: 'готов', Delivered: 'выдан' };
  return values[value as keyof typeof values] ?? value;
};

export const localizeNotification = (
  language: NotificationLanguage,
  value: string,
): string => {
  if (language === 'en' || !value) return value;
  const dictionary = language === 'uk' ? uk : ru;
  if (dictionary[value]) return dictionary[value];

  let match = value.match(/^(.+) requested access with Microsoft\.$/);
  if (match) return language === 'uk'
    ? `${match[1]} запитує доступ через Microsoft.`
    : `${match[1]} запрашивает доступ через Microsoft.`;

  match = value.match(/^(.+) requested access\.$/);
  if (match) return language === 'uk'
    ? `${match[1]} запитує доступ.`
    : `${match[1]} запрашивает доступ.`;

  match = value.match(/^Peer Recognition (approved|rejected)$/i);
  if (match) return language === 'uk'
    ? `Визнання колеги ${decision(match[1]!, language)}`
    : `Признание коллеги ${decision(match[1]!, language)}`;

  match = value.match(/^Award request (approved|rejected)$/i);
  if (match) return language === 'uk'
    ? `Запит на нагороду ${decision(match[1]!, language)}`
    : `Запрос на награду ${decision(match[1]!, language)}`;

  match = value.match(/^Your request was (approved|rejected)\.$/i);
  if (match) return language === 'uk'
    ? `Ваш запит ${decision(match[1]!, language)}.`
    : `Ваш запрос ${decision(match[1]!, language)}.`;

  match = value.match(/^([A-Za-z]+) Sparks credited$/);
  if (match) return language === 'uk' ? `${match[1]} Sparks зараховано` : `${match[1]} Sparks начислены`;

  match = value.match(/^A Quality Gate is active from (.+) through (.+)\.$/);
  if (match) return language === 'uk'
    ? `Quality Gate діє з ${match[1]} до ${match[2]}.`
    : `Quality Gate действует с ${match[1]} по ${match[2]}.`;

  match = value.match(/^Your purchase of (.+) is complete\.$/);
  if (match) return language === 'uk'
    ? `Покупку «${match[1]}» завершено.`
    : `Покупка «${match[1]}» завершена.`;

  match = value.match(/^Reward fulfillment (.+)$/);
  if (match) return language === 'uk'
    ? `Видача нагороди: ${status(match[1]!, language)}`
    : `Выдача награды: ${status(match[1]!, language)}`;

  match = value.match(/^Your reward fulfillment is now (.+)\.$/);
  if (match) return language === 'uk'
    ? `Статус видачі вашої нагороди: ${status(match[1]!, language)}.`
    : `Статус выдачи вашей награды: ${status(match[1]!, language)}.`;

  match = value.match(/^Disenchant request (.+)$/);
  if (match) return language === 'uk'
    ? `Запит на розпилення: ${status(match[1]!, language)}`
    : `Запрос на распыление: ${status(match[1]!, language)}`;

  match = value.match(/^Your Disenchant request is now (.+)\.$/);
  if (match) return language === 'uk'
    ? `Статус вашого запиту на розпилення: ${status(match[1]!, language)}.`
    : `Статус вашего запроса на распыление: ${status(match[1]!, language)}.`;

  match = value.match(/^Access request (approved|rejected)$/i);
  if (match) return language === 'uk'
    ? `Запит на доступ ${decision(match[1]!, language)}`
    : `Запрос на доступ ${decision(match[1]!, language)}`;

  match = value.match(/^Your access request was (approved|rejected)\.$/i);
  if (match) return language === 'uk'
    ? `Ваш запит на доступ ${decision(match[1]!, language)}.`
    : `Ваш запрос на доступ ${decision(match[1]!, language)}.`;

  match = value.match(/^(.+) performance was stored; the White reward is blocked by a Quality Gate\.$/);
  if (match) return language === 'uk'
    ? `Результати за ${match[1]} збережено; нарахування White заблоковано активним Quality Gate.`
    : `Результаты за ${match[1]} сохранены; начисление White заблокировано активным Quality Gate.`;

  match = value.match(/^(.+) performance was imported with (\d+) White Sparks\.$/);
  if (match) return language === 'uk'
    ? `Результати за ${match[1]} імпортовано; нараховано ${match[2]} White Sparks.`
    : `Результаты за ${match[1]} импортированы; начислено ${match[2]} White Sparks.`;

  return value;
};
