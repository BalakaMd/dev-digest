# Examples

Before/after pairs for the rules in [SKILL.md](SKILL.md). Each one is deliberately
short — the point is the shape, not the feature.

---

## 1. A page that does everything

The page fetches, filters, formats and renders. Four reasons to change in one
file.

```tsx
// ❌ app/repos/[repoId]/pulls/page.tsx — 300 lines
export default function PullsPage() {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<Severity | null>(null);
  const { data } = useQuery({ queryKey: ['pulls'], queryFn: () => fetch(...) });
  const visible = data?.filter(/* … 20 lines of rules … */);
  return (
    <div>
      {/* 40 lines of filter bar */}
      {/* 60 lines of table */}
      {/* 30 lines of empty state */}
    </div>
  );
}
```

```tsx
// ✅ page composes; the parts own themselves
export default function PullsPage() {
  const [filters, setFilters] = useState(emptyFilters);
  return (
    <PageShell>
      <PullFilters value={filters} onChange={setFilters} />
      <PullList filters={filters} />
    </PageShell>
  );
}

// _components/PullList/PullList.tsx      — fetches via the hook layer, renders rows
// _components/PullFilters/PullFilters.tsx — owns nothing but its own presentation
// _components/PullList/visiblePulls.ts    — the filtering rule, a pure function
```

The filtering rule is now testable without rendering anything.

---

## 2. The `utils` grab-bag

```
❌ src/utils/
   ├── helpers.ts      # 400 lines: dates, currency, a regex, a retry loop
   ├── misc.ts
   └── common.ts
```

```
✅ src/lib/date.ts                      # several date functions — a real subject
   src/entities/finding/model/score.ts  # a domain rule, with its entity
   src/app/…/_components/RunLog/parseLine.ts  # one consumer → beside it
```

Grouping by subject is fine (`lib/date.ts`). Grouping by leftovers is not.
A function with no obvious home is telling you a boundary has not been named yet.

---

## 3. Derived state parked in an Effect

```tsx
// ❌ state that mirrors other state, plus an extra render pass
const [fullName, setFullName] = useState('');
useEffect(() => {
  setFullName(`${firstName} ${lastName}`);
}, [firstName, lastName]);
```

```tsx
// ✅ it was never state
const fullName = `${firstName} ${lastName}`;
```

Same for filtered lists, totals and "is this valid" flags. If it is computable
from props and state, compute it. Wrap it in `useMemo` only if the computation is
genuinely expensive — that is a performance question, not a placement one.

---

## 4. Eleven props and three booleans

```tsx
// ❌ each new design adds a prop and a branch
<RunCard
  run={run} title={t('runs.title')} showHeader hideFooter isCompact
  variant="inline" onRetry={…} onCancel={…} footerNote={…} icon={…} badge={…}
/>
```

```tsx
// ✅ the caller composes; the card stays one component
<RunCard run={run}>
  <RunCard.Header>{t('runs.title')}</RunCard.Header>
  <RunCard.Actions>
    <RetryButton runId={run.id} />
  </RunCard.Actions>
</RunCard>
```

Boolean props that switch layout are configuration where composition belongs.

---

## 5. A domain rule living in JSX

```tsx
// ❌ the rule is only readable by reading the markup
{pr.state === 'open' && !pr.draft && pr.reviewers.length === 0 &&
 viewer.role !== 'guest' && <RequestReviewButton pr={pr} />}
```

```tsx
// entities/pull-request/model/permissions.ts — no React imports
export function canRequestReview(pr: PullRequest, viewer: Viewer): boolean {
  if (pr.state !== 'open' || pr.draft) return false;
  if (pr.reviewers.length > 0) return false;
  return viewer.role !== 'guest';
}

// ✅ the component asks a question instead of answering one
{canRequestReview(pr, viewer) && <RequestReviewButton pr={pr} />}
```

---

## 6. A cross-feature import

```tsx
// ❌ features/reviews reaches into features/repos
import { RepoPicker } from '../repos/components/RepoPicker';
```

Three legitimate fixes, in order of preference:

```tsx
// ✅ a) it was never feature-specific — it is a shared entity component
import { RepoPicker } from '@/entities/repo/ui/RepoPicker';

// ✅ b) compose at the level that already knows about both
<ReviewPanel picker={<RepoPicker />} />

// ✅ c) they are one feature wearing two names — merge the folders
```

What is not a fix: creating `features/shared/` to launder the dependency.

---

## 7. Abstracting too early

```tsx
// ❌ after the second usage: one component, one mode flag
function EntityTable({ mode }: { mode: 'pulls' | 'runs' }) {
  const columns = mode === 'pulls' ? pullColumns : runColumns;
  const onRowClick = mode === 'pulls' ? goToPull : goToRun;
  // …and by the third usage, six more branches
}
```

```tsx
// ✅ duplicate the markup, share the logic
// _components/PullTable/PullTable.tsx
// _components/RunTable/RunTable.tsx
// lib/useTableSort.ts   ← the part that was actually common
```

When a third case arrives and the three differ only in their inputs, *then*
extract a `<DataTable columns rows>` — the shape will be obvious by then. If the
third case needs a fourth flag, the shared version was never the right answer.

---

## 8. `'use client'` at the top of a page

```tsx
// ❌ one search box drags the whole screen into the client bundle
'use client';
export default function Layout({ children }) {
  return <nav><Logo /><Search /><UserMenu /></nav>;
}
```

```tsx
// ✅ the boundary sits at the interactive leaf
export default function Layout({ children }) {
  return <nav><Logo /><Search /><UserMenu /></nav>; // Search is the client module
}

// search.tsx
'use client';
export default function Search() { /* … */ }
```

And when a client component must wrap server-rendered content, pass it through
`children` — a Server Component passed as a prop never joins the client graph:

```tsx
<Modal>          {/* client: owns open/closed */}
  <Cart />       {/* server: still fetches on the server */}
</Modal>
```

Note: in this repo `client/` deliberately does the opposite at page level — see
the divergence note in [references/nextjs-app-router.md](references/nextjs-app-router.md).

---

## 9. A component's props type is a contract

```tsx
// ❌ invites the caller to pass everything, including fields the browser
//    should never see
'use client';
function Profile({ user }: { user: User }) {
  return <h1>{user.name}</h1>;
}
```

```tsx
// ✅ ask for what you render
'use client';
function Profile({ name }: { name: string }) {
  return <h1>{name}</h1>;
}
```

The narrow type is better architecture and, across a server/client boundary,
better security.
