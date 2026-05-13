export interface Account {
  handle: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
}

export interface Post {
  postId: string;
  url: string;
  text: string;
  handle: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
  postedAt: string | null;
  isReply: boolean;
  isRetweet: boolean;
  hasMedia: boolean;
  account: Account;
  extractedAt: string;
  source: 'x-timeline';
}

export interface ExtractorOptions {
  debug?: boolean;
}

export type TimelineCandidateReason = 'intersection' | 'mutation-scan' | 'initial-scan';

export type TimelineCandidateHandler = (
  article: HTMLElement,
  reason: TimelineCandidateReason
) => boolean | void;

export interface TimelineObserverOptions {
  root?: Document | HTMLElement;
  rootMargin?: string;
  threshold?: number | number[];
  debug?: boolean;
  onCandidate: TimelineCandidateHandler;
}

export interface TimelineObserverController {
  start(): void;
  stop(): void;
  scan(root?: ParentNode): void;
}

export interface ExtractedPostMessage {
  type: 'x/post-extracted';
  payload: Post;
}
