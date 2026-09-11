import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEGAL_SLUGS, LEGAL_STUBS } from "@/lib/site/stubs";
import { SiteFooter, SiteNav } from "../../site-chrome";

export function generateStaticParams() {
  return LEGAL_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const stub = LEGAL_STUBS[slug];
  if (stub === undefined) return {};
  return {
    title: `${stub.title} · 41Prompts`,
    description: stub.summary,
    alternates: { canonical: `/legal/${slug}` },
    // A placeholder must not be what a search engine has on file for "41Prompts privacy". EPIC-017
    // removes this line along with the placeholder.
    robots: { index: false, follow: true }
  };
}

export default async function LegalStubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const stub = LEGAL_STUBS[slug];
  if (stub === undefined) notFound();

  return (
    <>
      <SiteNav />
      <main className="prose-page" id="main">
        <h1>{stub.title}</h1>
        <p>
          <strong>This page is not written yet.</strong> It will be before anything is announced.
        </p>
        <p>{stub.summary}</p>
      </main>
      <SiteFooter />
    </>
  );
}
