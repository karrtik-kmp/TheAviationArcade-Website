import { ComingSoonPage } from "@/components/ComingSoonPage";
import { FaqList } from "@/components/FaqList";
import { PublicShell } from "@/components/PublicShell";
import { faqAnswerText } from "@/lib/faq-answer";
import { visibleCategories, type FaqCategory } from "@/lib/faq";
import { getFaq } from "@/lib/faq-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "FAQ" };

/** FAQPage structured data from the published answers (plain text; `<` escaped so it can't close the script). */
function faqJsonLd(categories: FaqCategory[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: categories.flatMap((category) =>
      category.entries.map((entry) => ({
        "@type": "Question",
        name: entry.question,
        acceptedAnswer: { "@type": "Answer", text: faqAnswerText(entry.answer) },
      })),
    ),
  }).replace(/</g, "\\u003c");
}

/**
 * The FAQ staff publish from the Admin (docs/briefs/faq-cms-plan.md). Until the first publish, or when the
 * backend has never answered, it is the "coming soon" page.
 */
export default async function FaqPage() {
  const result = await getFaq();
  const categories = result.state === "published" ? visibleCategories(result.faq) : [];
  if (categories.length === 0)
    return (
      <ComingSoonPage
        eyebrow="Help"
        title="Frequently Asked Questions."
        intro="We're putting together answers to the questions players and photographers ask most. Check back soon."
      />
    );
  return (
    <PublicShell>
      <main id="main">
        <header className="wrap page-intro">
          <span className="eyebrow">Help</span>
          <h1>Frequently Asked Questions.</h1>
        </header>
        <div className="wrap prose">
          <FaqList categories={categories} />
        </div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd(categories) }} />
      </main>
    </PublicShell>
  );
}
