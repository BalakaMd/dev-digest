/* /eval — Eval Dashboard (agents list + recent runs). Thin route: the feature
   lives in _components/EvalDashboardView. */
import { EvalDashboardView } from "./_components/EvalDashboardView";

export default function EvalDashboardPage() {
  return <EvalDashboardView />;
}
