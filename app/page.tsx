import { Suspense } from "react";
import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArticleView } from "./components/article-view";
import { TryLine } from "./components/try-line";
import { UrlForm } from "./components/url-form";
import type { Article } from "./lib/article";
import { ExtractError, extractArticle } from "./lib/extract";

const getArticle = cache(extractArticle);

const EXAMPLES = [
  { label: "How to Do Great Work", url: "https://paulgraham.com/greatwork.html" },
  { label: "1,000 True Fans", url: "https://kk.org/thetechnium/1000-true-fans/" },
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
    <main className={url ? "page page-article" : "page page-home"}>
      <header className="masthead">
        <h1 className="masthead-title">
          <Link href="/">adinkra</Link>
        </h1>
      </header>

      <UrlForm />

      {url ? (
        <Suspense
          key={url}
          fallback={
            <p className="setting" role="status">
              Setting type&hellip;
            </p>
          }
        >
          <LoadedArticle url={url} />
        </Suspense>
      ) : (
        <TryLine examples={EXAMPLES} />
      )}
    </main>
  );
}
