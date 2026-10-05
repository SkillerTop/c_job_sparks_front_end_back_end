import { useLayoutEffect } from 'react';
import type { InterfaceLanguage } from '@/models/profile';
import { localizeContent } from '@/services/contentLocalization';

type TranslationState = { source: string; rendered: string };
const textState = new WeakMap<Text, TranslationState>();
const attributeState = new WeakMap<Element, Map<string, TranslationState>>();
const attributes = ['aria-label', 'placeholder', 'title'] as const;

const shouldSkip = (node: Text) => Boolean(node.parentElement?.closest('script, style, code, [data-no-localize]'));

export function useDocumentLocalization(language: InterfaceLanguage) {
  useLayoutEffect(() => {
    const translateText = (node: Text) => {
      if (shouldSkip(node)) return;
      const current = node.nodeValue ?? '';
      const previous = textState.get(node);
      const source = previous && current === previous.rendered ? previous.source : current;
      const rendered = localizeContent(language, source);
      textState.set(node, { source, rendered });
      if (current !== rendered) node.nodeValue = rendered;
    };

    const translateAttributes = (element: Element) => {
      const states = attributeState.get(element) ?? new Map<string, TranslationState>();
      attributes.forEach((attribute) => {
        const current = element.getAttribute(attribute);
        if (!current) return;
        const previous = states.get(attribute);
        const source = previous && current === previous.rendered ? previous.source : current;
        const rendered = localizeContent(language, source);
        states.set(attribute, { source, rendered });
        if (current !== rendered) element.setAttribute(attribute, rendered);
      });
      attributeState.set(element, states);
    };

    const translateTree = (root: Node) => {
      if (root instanceof Text) {
        translateText(root);
        return;
      }
      if (!(root instanceof Element || root instanceof DocumentFragment || root instanceof Document)) return;
      if (root instanceof Element) translateAttributes(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        if (node instanceof Text) translateText(node);
        else if (node instanceof Element) translateAttributes(node);
        node = walker.nextNode();
      }
    };

    translateTree(document.body);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') translateText(mutation.target as Text);
        mutation.addedNodes.forEach(translateTree);
        if (mutation.type === 'attributes' && mutation.target instanceof Element) translateAttributes(mutation.target);
      });
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...attributes] });
    return () => observer.disconnect();
  }, [language]);
}
