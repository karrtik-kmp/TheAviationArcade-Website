import { ComingSoonPage } from "@/components/ComingSoonPage";

export const metadata = { title: "Aviation Marketplace" };

/** Placeholder: no products until the client sends them (website CQ-2, CQ-8). */
export default function MarketplacePage() {
  return (
    <ComingSoonPage
      eyebrow="Marketplace"
      title="Aviation Marketplace."
      intro="The Aviation Marketplace is on its way. Check back soon."
    />
  );
}
