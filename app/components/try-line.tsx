'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

type Example = { label: string; url: string };

// The router holds param-only navigations until the full payload arrives
// (loading.tsx never re-triggers within a segment), so the pending reading
// line is rendered optimistically here, mirroring the form's pending button.
export function TryLine({ examples }: { examples: Example[] }) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	if (isPending) {
		return (
			<p className='setting' role='status'>
				Setting type&hellip;
			</p>
		);
	}

	return (
		<p className='try'>
			Try{' '}
			{examples.map((example, index) => {
				const href = `/?url=${encodeURIComponent(example.url)}`;
				return (
					<span key={example.url}>
						{index > 0 && ' or '}
						<a
							href={href}
							onClick={(event) => {
								if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
								event.preventDefault();
								startTransition(() => router.push(href));
							}}
						>
							{example.label}
						</a>
					</span>
				);
			})}
			.
		</p>
	);
}
