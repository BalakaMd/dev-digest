/* /repos/:repoId/onboarding-tour — the Onboarding Tour page. Thin route: the
   feature lives in _components/OnboardingTourView. */
"use client";

import { useParams } from "next/navigation";
import { OnboardingTourView } from "./_components/OnboardingTourView";

export default function OnboardingTourPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <OnboardingTourView repoId={repoId} />;
}
