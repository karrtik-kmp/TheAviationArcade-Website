import { ComingSoonPage } from "@/components/ComingSoonPage";

export const metadata = { title: "FAQ" };

/** Placeholder until the FAQ is published from the Admin (docs/briefs/faq-cms-plan.md). */
export default function FaqPage() {
  return (
    <ComingSoonPage
      eyebrow="Help"
      title="Frequently Asked Questions."
      intro="We're putting together answers to the questions players and photographers ask most. Check back soon."
    />
  );
}
