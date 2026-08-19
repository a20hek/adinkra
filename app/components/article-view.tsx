/* eslint-disable @next/next/no-img-element */
import { SOURCE_LABELS, readingTime, type Article } from '../lib/article';

export function ArticleView({ article }: { article: Article }) {
	return (
		<article>
			{/* Invisible on screen; in print the thead/tfoot repeat on every
          page, giving each page top and bottom padding — @page margins
          are ignored by WebKit and "Margins: None" dialogs. */}
			<table className='print-sheet' role='presentation'>
				<thead>
					<tr>
						<td className='print-spacer' />
					</tr>
				</thead>
				<tfoot>
					<tr>
						<td className='print-spacer' />
					</tr>
				</tfoot>
				<tbody>
					<tr>
						<td>
							<header className='article-header'>
								<div className='pub-line'>
									{article.publicationLogo && (
										<img
											src={article.publicationLogo}
											alt=''
											className='pub-logo'
											width={20}
											height={20}
											fetchPriority='high'
											referrerPolicy='no-referrer'
										/>
									)}
									<span className='pub-name'>{article.publication}</span>
								</div>

								<h1 className='article-title'>{article.title}</h1>
								{article.subtitle && <p className='article-subtitle'>{article.subtitle}</p>}

								<div className='byline'>
									{article.author && (
										<>
											{article.authorImage && (
												<img
													src={article.authorImage}
													alt=''
													className='byline-photo'
													width={26}
													height={26}
													fetchPriority='high'
													referrerPolicy='no-referrer'
												/>
											)}
											<span>
												by <span className='byline-name'>{article.author}</span>
											</span>
											<span className='meta-sep'>·</span>
										</>
									)}
									{article.published && (
										<>
											<span>{article.published}</span>
											<span className='meta-sep'>·</span>
										</>
									)}
									<span>{readingTime(article.wordCount)}</span>
								</div>

								<div className='fleuron' aria-hidden='true'>
									❦
								</div>
							</header>

							{article.heroImage && (
								<figure className='hero'>
									<img src={article.heroImage} alt='' referrerPolicy='no-referrer' />
								</figure>
							)}

							<div
								className='article-body'
								// Sanitized server-side with an explicit allowlist in lib/extract.ts.
								dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
							/>

							<footer className='colophon'>
								<p>
									{article.author && <>{article.author} · </>}
									{article.publication} ·{' '}
									<a href={article.canonicalUrl} target='_blank' rel='noopener noreferrer'>
										{article.canonicalUrl}
									</a>
								</p>
								<p>
									{SOURCE_LABELS[article.source]} · {article.wordCount.toLocaleString('en-US')}{' '}
									words · set by adinkra
								</p>
							</footer>
						</td>
					</tr>
				</tbody>
			</table>
		</article>
	);
}
