import type {
  TimelineCandidateReason,
  TimelineObserverController,
  TimelineObserverOptions,
} from './types';

const POST_ARTICLE_SELECTOR = [
  'article[data-testid="tweet"]',
  'article[role="article"]',
  'article[aria-labelledby]',
].join(', ');

function isHTMLElement(value: unknown): value is HTMLElement {
  return value instanceof HTMLElement;
}

function isPostArticle(element: Element): element is HTMLElement {
  return isHTMLElement(element) && element.matches(POST_ARTICLE_SELECTOR);
}

// src/lib/observer.ts の一部
function findArticles(root: ParentNode): HTMLElement[] {
  // data-testid 以外に [role="article"] も候補に含める
  return Array.from(
    root.querySelectorAll<HTMLElement>('article[data-testid="tweet"], article[role="article"]')
  );
}

export function createTimelineObserver(
  options: TimelineObserverOptions
): TimelineObserverController {
  const observedArticles = new WeakSet<HTMLElement>();
  const scanQueue = new Set<ParentNode>();
  let started = false;
  let scanScheduled = false;

  const debugLog = (...args: unknown[]) => {
    if (!options.debug) {
      return;
    }
    console.debug('[AI Post Filter][observer]', ...args);
  };

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!isHTMLElement(entry.target)) {
          continue;
        }

        if (!entry.isIntersecting && entry.intersectionRatio <= 0) {
          continue;
        }

        const shouldUnobserve =
          options.onCandidate(entry.target, 'intersection') !== false;

        if (shouldUnobserve) {
          intersectionObserver.unobserve(entry.target);
        }
      }
    },
    {
      root: null,
      rootMargin: options.rootMargin ?? '800px 0px 800px 0px',
      threshold: options.threshold ?? 0.01,
    }
  );

  const registerArticle = (
    article: HTMLElement,
    reason: TimelineCandidateReason
  ): void => {
    if (observedArticles.has(article)) {
      return;
    }

    observedArticles.add(article);
    intersectionObserver.observe(article);

    if (options.debug) {
      debugLog('observe article', reason, article);
    }
  };

  const scanRoot = (root: ParentNode, reason: TimelineCandidateReason): void => {
    if (root instanceof Element && isPostArticle(root)) {
      registerArticle(root, reason);
    }

    if (!('querySelectorAll' in root)) {
      return;
    }

    const articles = root.querySelectorAll<HTMLElement>(POST_ARTICLE_SELECTOR);
    for (const article of articles) {
      registerArticle(article, reason);
    }
  };

  const flushScans = (): void => {
    scanScheduled = false;
    const roots = Array.from(scanQueue);
    scanQueue.clear();

    for (const root of roots) {
      scanRoot(root, 'mutation-scan');
    }
  };

  const queueScan = (root: ParentNode): void => {
    scanQueue.add(root);

    if (scanScheduled) {
      return;
    }

    scanScheduled = true;
    requestAnimationFrame(flushScans);
  };

  const mutationObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type !== 'childList') {
        continue;
      }

      for (const addedNode of record.addedNodes) {
        if (isHTMLElement(addedNode)) {
          queueScan(addedNode);
        }
      }
    }
  });

  return {
    start(): void {
      if (started) {
        return;
      }

      started = true;

      const observeRoot =
        options.root instanceof Document
          ? options.root.body ?? document.body
          : options.root ?? document.body;

      if (!observeRoot) {
        debugLog('no observe root found');
        return;
      }

      scanRoot(document, 'initial-scan');
      mutationObserver.observe(observeRoot, {
        childList: true,
        subtree: true,
      });

      debugLog('timeline observer started');
    },

    stop(): void {
      mutationObserver.disconnect();
      intersectionObserver.disconnect();
      scanQueue.clear();
      scanScheduled = false;
      started = false;
      debugLog('timeline observer stopped');
    },

    scan(root: ParentNode = document): void {
      queueScan(root);
    },
  };
}
