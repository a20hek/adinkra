import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import sanitizeHtml from 'sanitize-html';
import type { Article } from './article';

const FETCH_TIMEOUT_MS = 25_000;
const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 adinkra/0.1';

export class ExtractError extends Error {}

/**
 * SSRF guard: refuse URLs that target loopback, private, link-local, or
 * otherwise non-public hosts. Checked on the requested URL and on every
 * redirect hop before it is followed. (Hostname-level only — no DNS
 * resolution — which is proportionate for a locally run tool fetching
 * user-pasted links.)
 */
function assertPublicHost(url: URL): void {
	// Strip any trailing dot (FQDN form): "localhost." resolves like
	// "localhost" but would otherwise slip past the suffix checks below.
	const host = url.hostname.toLowerCase().replace(/\.$/, '');

	const v4Literal = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
	if (!v4Literal && /^([^.]+|.+\.(local|localhost|internal|home\.arpa))$/i.test(host)) {
		throw new ExtractError('Refusing to fetch a local or internal address.');
	}

	// Bracketed IPv6 literals: never needed for public articles; too many ways
	// to encode loopback/private ranges, so reject them wholesale.
	if (host.includes(':')) {
		throw new ExtractError('Refusing to fetch a raw IPv6 address.');
	}

	const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (v4) {
		const [a, b] = [Number(v4[1]), Number(v4[2])];
		const nonPublic =
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 198 && (b === 18 || b === 19)) ||
			a >= 224;
		if (nonPublic) {
			throw new ExtractError('Refusing to fetch a private or reserved address.');
		}
	}
}

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Fetch with redirects followed manually so assertPublicHost runs on every
 * hop *before* it is requested — automatic following would let a public URL
 * redirect us into a private address.
 */
async function fetchRaw(url: URL): Promise<{ response: Response; finalUrl: URL }> {
	let current = url;

	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		let response: Response;
		try {
			response = await fetch(current, {
				headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
				cache: 'no-store',
				redirect: 'manual',
			});
		} catch {
			throw new ExtractError('Could not reach that URL. Check the address and try again.');
		}

		const location = response.headers.get('location');
		if (REDIRECT_STATUSES.has(response.status) && location) {
			void response.body?.cancel();
			let next: URL;
			try {
				next = new URL(location, current);
			} catch {
				throw new ExtractError('The site sent an invalid redirect for that URL.');
			}
			assertPublicHost(next);
			current = next;
			continue;
		}

		if (!response.ok) {
			throw new ExtractError(`The site responded with ${response.status} for that URL.`);
		}

		return { response, finalUrl: current };
	}

	throw new ExtractError('Too many redirects for that URL.');
}

/** Decode a response body honoring its declared charset (old sites are often windows-1252). */
async function decodeHtml(response: Response): Promise<string> {
	const buffer = await response.arrayBuffer();
	const headerCharset = response.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1];
	const sniffed = new TextDecoder('latin1')
		.decode(buffer.slice(0, 2048))
		.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];

	const declared = headerCharset ?? sniffed;
	if (declared) {
		try {
			return new TextDecoder(declared).decode(buffer);
		} catch {}
	}

	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
	} catch {
		return new TextDecoder('windows-1252').decode(buffer);
	}
}

/**
 * Resolve an untrusted URL (remote JSON, meta tags, link elements) against a
 * base and allow only http(s) — anything else (javascript:, data:, …) becomes
 * undefined. Every URL that ends up in an href/src must pass through here.
 */
function safeUrl(value: string | null | undefined, base: string): string | undefined {
	if (!value) return undefined;
	try {
		const resolved = new URL(value, base);
		return resolved.protocol === 'http:' || resolved.protocol === 'https:'
			? resolved.toString()
			: undefined;
	} catch {
		return undefined;
	}
}

const JUNK_CLASS_PATTERN =
	/subscription-widget|button-wrapper|captioned-button|subscribe-widget|install-substack-app|digest-post-embed|poll-embed|community-chat|embedded-post-wrap|image-link-expand|paywall/;

function cleanBodyHtml(html: string, baseUrl: string): string {
	return sanitizeHtml(html, {
		allowedTags: [
			'p',
			'br',
			'hr',
			'h1',
			'h2',
			'h3',
			'h4',
			'h5',
			'h6',
			'blockquote',
			'pre',
			'code',
			'em',
			'i',
			'strong',
			'b',
			'u',
			's',
			'a',
			'img',
			'figure',
			'figcaption',
			'picture',
			'source',
			'ul',
			'ol',
			'li',
			'table',
			'thead',
			'tbody',
			'tr',
			'th',
			'td',
			'span',
			'div',
			'sup',
			'sub',
			'iframe',
			'video',
			'audio',
		],
		allowedAttributes: {
			a: ['href', 'id', 'class'],
			img: ['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading'],
			source: ['src', 'srcset', 'sizes', 'type', 'media'],
			iframe: ['src', 'width', 'height', 'allowfullscreen'],
			video: ['src', 'poster', 'controls'],
			audio: ['src', 'controls'],
			td: ['colspan', 'rowspan'],
			th: ['colspan', 'rowspan'],
			ol: ['start'],
			'*': ['id'],
			span: ['class'],
			div: ['class'],
			p: ['class'],
		},
		allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com'],
		exclusiveFilter: (frame) => JUNK_CLASS_PATTERN.test(frame.attribs.class ?? ''),
		transformTags: {
			a: (tagName, attribs) => ({
				tagName,
				// Keep in-page fragment links (footnotes) working inside our page.
				attribs: {
					...attribs,
					href: attribs.href?.startsWith('#')
						? attribs.href
						: (safeUrl(attribs.href, baseUrl) ?? ''),
				},
			}),
			img: (tagName, attribs) => {
				const src = safeUrl(attribs.src, baseUrl);
				return src
					? { tagName, attribs: { ...attribs, src, loading: 'lazy' } }
					: { tagName: 'span', attribs: {} };
			},
		},
	});
}

/** Readability wraps content in nested divs; peel them so house paragraph styles apply. */
function unwrapSingleDivs(html: string): string {
	const body = new JSDOM(`<body>${html}</body>`).window.document.body;
	while (body.children.length === 1 && body.children[0].tagName === 'DIV') {
		body.children[0].replaceWith(...body.children[0].childNodes);
	}
	return body.innerHTML;
}

function bodyImageKeys(bodyHtml: string): Set<string> {
	const dom = new JSDOM(`<body>${bodyHtml}</body>`);
	const keys = new Set<string>();
	for (const img of dom.window.document.querySelectorAll('img')) {
		const src = img.getAttribute('src');
		if (src) keys.add(imageKey(src));
	}
	return keys;
}

function countWords(bodyHtml: string): number {
	const text = new JSDOM(`<body>${bodyHtml}</body>`).window.document.body.textContent ?? '';
	return text.split(/\s+/).filter(Boolean).length;
}

function formatDisplayDate(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return undefined;
	return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(parsed);
}

/** CDN-wrapped image URLs (substackcdn) embed the original URL as the last path segment. */
function imageKey(url: string): string {
	const segment = url.split('/').pop() ?? url;
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

function faviconFor(origin: string): string {
	return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(origin)}&sz=64`;
}

function finishArticle(
	partial: Omit<Article, 'wordCount' | 'heroImage'> & { heroImage?: string }
): Article {
	const hero =
		partial.heroImage && !bodyImageKeys(partial.bodyHtml).has(imageKey(partial.heroImage))
			? partial.heroImage
			: undefined;

	return { ...partial, heroImage: hero, wordCount: countWords(partial.bodyHtml) };
}

type SubstackPublication = {
	name?: string;
	logo_url?: string;
};

type SubstackByline = {
	name?: string;
	photo_url?: string;
	publicationUsers?: { publication?: SubstackPublication & { id?: number } }[];
};

type SubstackPost = {
	title?: string;
	subtitle?: string;
	post_date?: string;
	canonical_url?: string;
	cover_image?: string;
	body_html?: string | null;
	publication_id?: number;
	publishedBylines?: SubstackByline[];
};

async function trySubstack(url: URL): Promise<Article | null> {
	const slug = url.pathname.match(/^\/p\/([^/]+)\/?$/)?.[1];
	if (!slug) return null;

	let post: SubstackPost;
	try {
		// redirect: "error" — the Substack API answers directly; a redirecting
		// response is not it, and following one blindly would skip the SSRF guard.
		const response = await fetch(`${url.origin}/api/v1/posts/${slug}`, {
			headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			cache: 'no-store',
			redirect: 'error',
		});
		if (!response.ok) return null;
		// SAFETY: every field of SubstackPost is optional, so any JSON object
		// satisfies the shape; the two load-bearing fields (title, body_html)
		// are checked below before use.
		post = (await response.json()) as SubstackPost;
	} catch {
		return null;
	}

	if (!post.title || !post.body_html) return null;

	const byline = post.publishedBylines?.[0];
	const publication =
		byline?.publicationUsers
			?.map((pu) => pu.publication)
			.find((pub) => pub && (pub.id === post.publication_id || !post.publication_id)) ??
		byline?.publicationUsers?.[0]?.publication;

	return finishArticle({
		canonicalUrl: safeUrl(post.canonical_url, url.origin) ?? url.toString(),
		source: 'substack',
		publication: publication?.name ?? url.hostname,
		publicationLogo: safeUrl(publication?.logo_url, url.origin) ?? faviconFor(url.origin),
		author: byline?.name,
		authorImage: safeUrl(byline?.photo_url, url.origin),
		title: post.title,
		subtitle: post.subtitle || undefined,
		published: formatDisplayDate(post.post_date),
		heroImage: safeUrl(post.cover_image, url.origin),
		bodyHtml: cleanBodyHtml(post.body_html, url.origin),
	});
}

const MONTH_YEAR =
	/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/;

function parsePaulGraham(html: string, url: URL): Article {
	const dom = new JSDOM(html);
	const doc = dom.window.document;

	// Essay text lives in the largest <font> block, paragraphs split by <br><br>.
	let essay: HTMLElement | null = null;
	for (const font of doc.querySelectorAll('font')) {
		if (!essay || (font.textContent?.length ?? 0) > (essay.textContent?.length ?? 0)) {
			essay = font;
		}
	}
	if (!essay || (essay.textContent?.trim().length ?? 0) < 200) {
		throw new ExtractError("Couldn't find the essay text on that page.");
	}

	const paragraphs = essay.innerHTML
		.split(/<br\s*\/?>\s*<br\s*\/?>/i)
		.map((chunk) => chunk.trim())
		.filter(Boolean);

	let published: string | undefined;
	const first = paragraphs[0]?.replace(/<[^>]+>/g, '').trim();
	if (first && MONTH_YEAR.test(first)) {
		published = first;
		paragraphs.shift();
	}

	return finishArticle({
		canonicalUrl: url.toString(),
		source: 'paulgraham',
		publication: 'Paul Graham',
		publicationLogo: faviconFor('https://ycombinator.com'),
		author: 'Paul Graham',
		title: doc.title.trim() || 'Untitled',
		published,
		bodyHtml: cleanBodyHtml(paragraphs.map((p) => `<p>${p}</p>`).join('\n'), url.toString()),
	});
}

function metaContent(doc: Document, ...selectors: string[]): string | undefined {
	for (const selector of selectors) {
		const content = doc.querySelector(selector)?.getAttribute('content')?.trim();
		if (content) return content;
	}
	return undefined;
}

function findIcon(doc: Document, base: URL): string {
	const link =
		doc.querySelector('link[rel="apple-touch-icon"]') ??
		doc.querySelector('link[rel="icon"]') ??
		doc.querySelector('link[rel="shortcut icon"]');
	return safeUrl(link?.getAttribute('href'), base.toString()) ?? faviconFor(base.origin);
}

function parseGeneric(html: string, url: URL): Article {
	const dom = new JSDOM(html, { url: url.toString() });
	const doc = dom.window.document;

	const canonical =
		safeUrl(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), url.toString()) ??
		url.toString();
	const publication =
		metaContent(doc, 'meta[property="og:site_name"]') ?? url.hostname.replace(/^www\./, '');
	const author = metaContent(
		doc,
		'meta[name="author"]',
		'meta[property="article:author"]',
		'meta[name="twitter:creator"]'
	)?.replace(/^@/, '');
	const published = formatDisplayDate(
		metaContent(doc, 'meta[property="article:published_time"]', 'meta[name="date"]')
	);
	const heroImage = safeUrl(
		metaContent(doc, 'meta[property="og:image"]', 'meta[name="twitter:image"]'),
		url.toString()
	);
	const publicationLogo = findIcon(doc, url);

	const parsed = new Readability(doc).parse();
	if (!parsed?.content) {
		throw new ExtractError("Couldn't extract a readable article from that page.");
	}

	return finishArticle({
		canonicalUrl: canonical,
		source: 'web',
		publication,
		publicationLogo,
		author: author ?? parsed.byline?.trim() ?? undefined,
		title: parsed.title?.trim() || doc.title.trim() || 'Untitled',
		published: published ?? formatDisplayDate(parsed.publishedTime ?? undefined),
		heroImage,
		bodyHtml: unwrapSingleDivs(cleanBodyHtml(parsed.content, url.toString())),
	});
}

function normalizeUrl(rawUrl: string): URL {
	const trimmed = rawUrl.trim();
	let url: URL;
	try {
		url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
	} catch {
		throw new ExtractError("That doesn't look like a valid URL.");
	}

	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new ExtractError('Only http(s) URLs are supported.');
	}

	const openMatch = url.href.match(/^https:\/\/open\.substack\.com\/pub\/([^/]+)(\/p\/[^/?#]+)/i);
	if (openMatch) {
		url = new URL(`https://${openMatch[1]}.substack.com${openMatch[2]}`);
	}

	assertPublicHost(url);
	return url;
}

export async function extractArticle(rawUrl: string): Promise<Article> {
	const url = normalizeUrl(rawUrl);

	// Substack posts (any custom domain) expose a clean JSON API at /api/v1/posts/<slug>.
	const substack = await trySubstack(url);
	if (substack) return substack;

	const { response, finalUrl } = await fetchRaw(url);
	const html = await decodeHtml(response);

	if (/(^|\.)paulgraham\.com$/i.test(finalUrl.hostname)) {
		return parsePaulGraham(html, finalUrl);
	}

	return parseGeneric(html, finalUrl);
}
