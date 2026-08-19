'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition, type FormEvent, type ClipboardEvent } from 'react';

export function UrlForm() {
	const router = useRouter();
	const urlParam = useSearchParams().get('url')?.trim() ?? '';
	const [value, setValue] = useState(urlParam);
	const [lastParam, setLastParam] = useState(urlParam);
	const [isPending, startTransition] = useTransition();

	// Adopt the param when navigation changes it (example links, back/forward),
	// instead of remounting with a key — Activity-cached pages keep keyed
	// remounts alive across back/forward, which duplicated the form.
	if (urlParam !== lastParam) {
		setLastParam(urlParam);
		setValue(urlParam);
	}

	function open(rawUrl: string) {
		const trimmed = rawUrl.trim();
		startTransition(() => {
			router.push(trimmed ? `/?url=${encodeURIComponent(trimmed)}` : '/');
		});
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!value.trim() && !urlParam) return;
		open(value);
	}

	function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
		const pasted = event.clipboardData.getData('text').trim();
		if (/^https?:\/\/\S+$/i.test(pasted) && !value.trim()) {
			event.preventDefault();
			event.currentTarget.blur();
			setValue(pasted);
			open(pasted);
		}
	}

	return (
		<form onSubmit={handleSubmit} className='url-form'>
			<label htmlFor='article-url' className='sr-only'>
				Article URL
			</label>
			<div className='url-row'>
				<input
					id='article-url'
					type='url'
					inputMode='url'
					autoComplete='off'
					spellCheck={false}
					className='url-input'
					placeholder='Paste a link'
					value={value}
					onChange={(event) => setValue(event.target.value)}
					onPaste={handlePaste}
					autoFocus={!urlParam}
				/>
				{/* Once an article is set, pasting (and Enter, via implicit
				    submission) already sets the type, so the slot holds Print
				    instead of a redundant Read. */}
				<button
					type={urlParam ? 'button' : 'submit'}
					className='url-submit'
					disabled={isPending}
					onClick={urlParam ? () => window.print() : undefined}
				>
					{isPending ? 'Setting type…' : urlParam ? 'Print' : 'Read'}
				</button>
			</div>
		</form>
	);
}
