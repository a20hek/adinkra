import { Suspense } from "react";
import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArticleView } from "./components/article-view";
import { UrlForm } from "./components/url-form";
import type { Article } from "./lib/article";
import { ExtractError, extractArticle } from "./lib/extract";

const getArticle = cache(extractArticle);

const EXAMPLES = [
  { label: "How to Do Great Work", url: "https://paulgraham.com/greatwork.html" },
  { label: "an Astral Codex Ten post", url: "https://www.astralcodexten.com/p/your-book-review-the-escape-artist" },
];

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const url = firstParam((await searchParams).url);
  if (!url) return {};
  try {
    const article = await getArticle(url);
    return { title: `${article.title} — adinkra` };
  } catch {
    return {};
  }
}

async function LoadedArticle({ url }: { url: string }) {
  let article: Article | undefined;
  let message = "Something went wrong while extracting that article.";
  try {
    article = await getArticle(url);
  } catch (error) {
    if (error instanceof ExtractError) message = error.message;
  }

  if (!article) {
    return (
      <div className="notice notice-error" role="alert">
        <p className="notice-title">Couldn&rsquo;t set that one.</p>
        <p>{message}</p>
      </div>
    );
  }

  return <ArticleView article={article} />;
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const url = firstParam((await searchParams).url);

  return (
    <main className="page">
      <header className="masthead">
        <h1 className="masthead-title">adinkra</h1>
      </header>

      <UrlForm />

      {url ? (
        <Suspense
          key={url}
          fallback={
            <div className="notice" aria-live="polite">
              <p className="notice-title">Setting type&hellip;</p>
              <p>Fetching the article and laying it out in house style.</p>
            </div>
          }
        >
          <LoadedArticle url={url} />
        </Suspense>
      ) : (
        <div className="empty">
          <p>
            Paste a link to a Substack post, a Paul Graham essay, or most any blog. adinkra
            strips the feed furniture&mdash;comments, buttons, popups&mdash;and resets the piece
            in one standard layout: the author, the publication, the words, the images. Nothing
            else.
          </p>
          <p>
            Try{" "}
            {EXAMPLES.map((example, index) => (
              <span key={example.url}>
                {index > 0 && " or "}
                <Link href={`/?url=${encodeURIComponent(example.url)}`}>{example.label}</Link>
              </span>
            ))}
            .
          </p>
        </div>
      )}
    </main>
  );
}
