/* /repos/:repoId/conventions — the Conventions extractor (Skills Lab). Thin
   route: the feature lives in _components/ConventionsView. */
"use client";

import { useParams } from "next/navigation";
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <ConventionsView repoId={repoId} />;
}
