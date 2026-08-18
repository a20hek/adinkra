'use client';

import { useEffect } from 'react';

// Streaming metadata appends the <title> of a hard-loaded /?url= page to
// <body>, and React never adopts it. After a client-side navigation React
// mounts the fresh title in <head>, but the stale body title stays in the
// DOM and the browser can keep displaying it. Whenever <head> holds a title,
// any title left in <body> is stale — remove it.
export function StaleTitleCleanup() {
	useEffect(() => {
		const purge = () => {
			if (document.head.querySelector('title')) {
				for (const el of document.querySelectorAll('body title')) el.remove();
			}
		};
		purge();
		const observer = new MutationObserver(purge);
		observer.observe(document.head, { childList: true });
		return () => observer.disconnect();
	}, []);

	return null;
}
