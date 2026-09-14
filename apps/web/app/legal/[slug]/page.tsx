import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEGAL_DOCS, LEGAL_DOC_SLUGS, UNREVIEWED_NOTICE, type LegalPart } from "@/lib/site/legal";
import { ConsentControl } from "./consent-control";
import { SiteFooter, SiteNavWithSession } from "../../site-chrome";

export function generateStaticParams() {
  return LEGAL_DOC_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = LEGAL_DOCS[slug];
  if (doc === undefined) return {};
  return {
    title: `${doc.title} · 41Prompts`,
    description: doc.summary,
    alternates: { canonical: `/legal/${slug}` },
    // **Indexable, as of EPIC-017.** These were `noindex` while they said "this page is not written
    // yet", because a placeholder must not be what a search engine has on file for "41Prompts
    // privacy". They are written now, and a privacy policy nobody can find is not much of a policy.
  };
}

function Part({ part }: { part: LegalPart }) {
  switch (part.kind) {
    case "h2":
      return <h2>{part.text}</h2>;
    case "p":
      return <p>{part.text}</p>;
    case "ul":
      return (
        <ul className="legal-list">
          {part.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "table":
      // Its own scroll container: a four-column table has no business making the whole page scroll
      // sideways on a phone.
      return (
        <div className="legal-tablewrap">
          <table className="legal-table">
            <caption>{part.caption}</caption>
            <thead>
              <tr>
                {part.head.map((cell) => (
                  <th key={cell} scope="col">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {part.rows.map((row) => (
                <tr key={row.join("|")}>
                  {row.map((cell, index) =>
                    index === 0 ? (
                      <th key={cell} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={cell}>{cell}</td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = LEGAL_DOCS[slug];
  if (doc === undefined) notFound();

  return (
    <>
      <SiteNavWithSession />
      <main className="prose-page" id="main">
        <h1>{doc.title}</h1>
        {/* Once, at the top, on the two pages that make promises — and nowhere else (decision in
            EPIC-017). A site that hedges on every page reads as one that means none of it. */}
        {doc.unreviewed && <p className="legal-unreviewed">{UNREVIEWED_NOTICE}</p>}
        {doc.parts.map((part, index) => (
          <Part part={part} key={`${part.kind}-${index}`} />
        ))}
        {/* The permanent control. Consent that cannot be withdrawn as easily as it was given is not
            consent under either Law 25 or the GDPR, and a banner you already dismissed is not a
            control. It lives on the page the banner links to. */}
        {slug === "privacy" && <ConsentControl />}
      </main>
      <SiteFooter />
    </>
  );
}
