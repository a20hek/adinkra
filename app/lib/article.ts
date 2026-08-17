export type ArticleSource = 'substack' | 'paulgraham' | 'web';

export type Article = {
	canonicalUrl: string;
	source: ArticleSource;
	publication: string;
	publicationLogo?: string;
	author?: string;
	authorImage?: string;
	title: string;
	subtitle?: string;
	/** Already formatted for display, e.g. "July 2023" or "August 14, 2026". */
	published?: string;
	heroImage?: string;
	bodyHtml: string;
	wordCount: number;
};

export const SOURCE_LABELS = {
	substack: 'Substack',
	paulgraham: 'paulgraham.com',
	web: 'Web',
} satisfies Record<ArticleSource, string>;

export function readingTime(wordCount: number): string {
	return `${Math.max(1, Math.round(wordCount / 230))} min read`;
}
