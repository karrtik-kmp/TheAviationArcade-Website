import { Fragment } from "react";
import { headers } from "next/headers";
import { PublicShell } from "@/components/PublicShell";
import { PolicyEmbed } from "@/components/PolicyEmbed";
import type { LegalPage as LegalPageEntry } from "@/lib/legal";
import { photoSubmissionPolicy } from "@/lib/photo-submission-policy";
import { pageOrigin, policyHtml } from "@/lib/policy-embed";

/** Turns the contact email and website address in the client's text into links. */
function Linked({ text }: { text: string }) {
  const parts = text.split(/([\w.+-]+@[\w-]+\.[\w.]+|https:\/\/[^\s]+?(?=[.,]?(?:\s|$)))/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 0 ? (
          <Fragment key={i}>{part}</Fragment>
        ) : (
          <a key={i} href={part.includes("@") ? `mailto:${part}` : part}>
            {part}
          </a>
        ),
      )}
    </>
  );
}

function PhotoSubmissionPolicy() {
  return (
    <>
      {photoSubmissionPolicy.sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.blocks.map((block, i) =>
            typeof block === "string" ? (
              <p key={i}>
                <Linked text={block} />
              </p>
            ) : (
              <ul key={i}>
                {block.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ),
          )}
        </section>
      ))}
    </>
  );
}

/**
 * A Termageddon policy, fetched on the server so it arrives with the page. If that fails the browser
 * loads it instead (`PolicyEmbed`), with the Termageddon link as the last resort.
 */
async function TermageddonPolicy({ page, policyKey }: { page: LegalPageEntry; policyKey: string }) {
  const origin = pageOrigin(await headers(), page.path);
  const html = origin ? await policyHtml(policyKey, origin) : null;
  if (html === null) return <PolicyEmbed policyKey={policyKey} label={page.label} />;
  return <div id={policyKey} className="policy_embed_div" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function LegalPage({ page }: { page: LegalPageEntry }) {
  const isPhotoPolicy = !page.termageddonKey;
  return (
    <PublicShell>
      <main id="main">
        <header className="wrap page-intro">
          <span className="eyebrow">Legal</span>
          <h1>{isPhotoPolicy ? photoSubmissionPolicy.title : page.label}</h1>
          {isPhotoPolicy && <p>Effective date: {photoSubmissionPolicy.effective}</p>}
        </header>
        <article id="legal-policy" className="wrap prose legal-prose">
          {page.termageddonKey ? (
            <TermageddonPolicy page={page} policyKey={page.termageddonKey} />
          ) : (
            <PhotoSubmissionPolicy />
          )}
        </article>
      </main>
    </PublicShell>
  );
}
