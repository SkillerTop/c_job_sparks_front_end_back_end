import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import type { InterfaceLanguage } from '@/models/profile';

type RouteMeta = { title: string; description: string };

const SITE_ORIGIN = 'https://c-job-sparks-final.workspace-523885.chatgpt.site';

const en: Record<string, RouteMeta> = {
  '/': { title: 'Home', description: 'Your C-Job Sparks balance, recognition activity and current impact.' },
  '/login': { title: 'Sign in', description: 'Sign in to the C-Job employee recognition workspace.' },
  '/register': { title: 'Request access', description: 'Request access to the C-Job Sparks workspace.' },
  '/registration-status': { title: 'Access request', description: 'Review the status of your C-Job Sparks access request.' },
  '/profile': { title: 'Profile Settings', description: 'Manage your profile, language, notifications and sessions.' },
  '/sparks': { title: 'My Sparks', description: 'Review your immutable Spark recognition history and balances.' },
  '/recognition': { title: 'Peer recognition', description: 'Recognize a colleague for work that moves C-Job forward.' },
  '/performance': { title: 'My performance', description: 'Review validated KPI and personal cards results.' },
  '/achievements': { title: 'Achievements', description: 'Explore your permanent recognition achievements.' },
  '/company-achievements': { title: 'Company achievements', description: 'Review achievements earned by Engineers and Coordinators across C-Job.' },
  '/shop': { title: 'Reward Shop', description: 'Spend White, Yellow and Blue Sparks on employee rewards.' },
  '/inventory': { title: 'My Purchases', description: 'Manage purchased rewards and review Reward Shop transactions.' },
  '/convert': { title: 'Convert Sparks', description: 'Convert eligible Sparks according to the published rules.' },
  '/disenchant': { title: 'Disenchant Sparks', description: 'Create an accounting request from eligible Sparks.' },
  '/team': { title: 'Team workspace', description: 'Review people, recognition and department activity.' },
  '/award': { title: 'Award a Spark', description: 'Create a role-authorized Spark award.' },
  '/approvals': { title: 'Approval center', description: 'Review recognition and award requests in your scope.' },
  '/admin': { title: 'Administration', description: 'Manage access, Spark rules, imports and the Reward Shop.' },
  '/rules': { title: 'Spark rules', description: 'Read the current C-Job Spark recognition rules.' },
  '/forbidden': { title: 'Access restricted', description: 'This workspace is not available for the active role.' },
};

const routeTitles: Record<InterfaceLanguage, Record<string, string>> = {
  en: {},
  uk: {
    '/': 'Головна', '/login': 'Вхід', '/register': 'Запит доступу', '/registration-status': 'Запит доступу',
    '/profile': 'Налаштування профілю', '/sparks': 'Мої Sparks', '/recognition': 'Визнання колег',
    '/performance': 'Мої результати', '/achievements': 'Досягнення', '/company-achievements': 'Досягнення компанії', '/shop': 'Магазин нагород',
    '/inventory': 'Мої предмети', '/convert': 'Конвертація Sparks', '/disenchant': 'Розпилення Sparks',
    '/team': 'Командний простір', '/award': 'Нагородити Spark', '/approvals': 'Центр погоджень',
    '/admin': 'Адміністрування', '/rules': 'Правила Sparks', '/forbidden': 'Доступ обмежено',
  },
  ru: {
    '/': 'Главная', '/login': 'Вход', '/register': 'Запрос доступа', '/registration-status': 'Запрос доступа',
    '/profile': 'Настройки профиля', '/sparks': 'Мои Sparks', '/recognition': 'Признание коллег',
    '/performance': 'Мои результаты', '/achievements': 'Достижения', '/company-achievements': 'Достижения компании', '/shop': 'Магазин наград',
    '/inventory': 'Мои предметы', '/convert': 'Конвертация Sparks', '/disenchant': 'Распыление Sparks',
    '/team': 'Командное пространство', '/award': 'Наградить Spark', '/approvals': 'Центр согласований',
    '/admin': 'Администрирование', '/rules': 'Правила Sparks', '/forbidden': 'Доступ ограничен',
  },
};

const setMeta = (selector: string, attribute: 'name' | 'property', key: string, value: string) => {
  let node = document.head.querySelector<HTMLMetaElement>(selector);
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute(attribute, key);
    document.head.append(node);
  }
  node.content = value;
};

export function RouteMetadata() {
  const { pathname } = useLocation();
  const { language } = useUserPreferences();

  useEffect(() => {
    const base = en[pathname] ?? { title: 'Page not found', description: 'The requested C-Job Sparks page was not found.' };
    const title = routeTitles[language][pathname] ?? base.title;
    const fullTitle = `${title} · C-Job Sparks`;
    const canonicalUrl = `${SITE_ORIGIN}${pathname === '/' ? '/' : pathname}`;
    document.title = fullTitle;
    setMeta('meta[name="description"]', 'name', 'description', base.description);
    setMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
    setMeta('meta[property="og:description"]', 'property', 'og:description', base.description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', base.description);
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = canonicalUrl;
  }, [language, pathname]);

  return null;
}
