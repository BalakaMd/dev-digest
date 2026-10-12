/* /ci-runs — CI Runs: agent reviews executed inside CI. Thin route: the feature
   lives in _components/CiRunsView. */
import { CiRunsView } from "./_components/CiRunsView";

export default function CiRunsPage() {
  return <CiRunsView />;
}
