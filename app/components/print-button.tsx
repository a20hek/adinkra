'use client';

export function PrintButton() {
	return (
		<button type='button' className='print-button' onClick={() => window.print()}>
			Print
		</button>
	);
}
