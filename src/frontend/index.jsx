import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Text,
  Lozenge,
  DynamicTable,
  Button,
  Inline,
  Stack,
  Link,
  SectionMessage,
  Spinner,
  Heading,
} from '@forge/react';
import { invoke, view } from '@forge/bridge';
import { toViewModel } from './viewModel.js';

const HEAD = ['#', 'Citation', 'Law', 'Verdict', 'Type', 'Why', 'Source'];

function rowCells(r) {
  return [
    String(r.n ?? ''),
    r.citation,
    r.lawLabel,
    `${r.icon ?? ''} ${r.verdictLabel}`.trim(),
    r.types || '—',
    r.reason || '—',
    r.sourceUrl ? <Link href={r.sourceUrl}>official text</Link> : '—',
  ];
}

function App() {
  const [product, setProduct] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [posted, setPosted] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctx = await view.getContext();
        const extType = String(ctx?.extension?.type ?? '');
        const p = extType.includes('confluence') ? 'confluence' : extType.includes('jira') ? 'jira' : 'unknown';
        const rep = await invoke('getStatus');
        if (cancelled) return;
        setProduct(p);
        setReport(rep ?? null);
      } catch (e) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async (fn) => {
    setError(null);
    setPosted(null);
    try {
      const out = await fn();
      setReport(out ?? null);
    } catch (e) {
      setError(e?.message ?? String(e));
    }
  }, []);

  const onVerifyNow = useCallback(() => refresh(() => invoke('verifyNow')), [refresh]);

  const onPostReport = useCallback(async () => {
    setError(null);
    setPosted(null);
    try {
      const res = await invoke('postReport');
      setPosted(res ?? { posted: true, label: null, summary: null });
    } catch (e) {
      setError(e?.message ?? String(e));
    }
  }, []);

  if (loading) return <Spinner />;

  const vm = toViewModel(report, { product });

  return (
    <Stack space="medium">
      <Heading size="small">CiteCheck citation check</Heading>

      {error ? (
        <SectionMessage title="Something went wrong" appearance="error">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}

      {posted ? (
        <SectionMessage title={`Posted: ${posted.label ?? 'report'}`} appearance="success">
          <Text>{posted.summary && typeof posted.summary === 'object'
            ? `${posted.summary.flagged ?? 0} flagged · ${posted.summary.verified ?? 0} verified · ${posted.summary.unverifiable ?? 0} unverifiable`
            : (posted.summary ?? 'The verification report has been posted.')}</Text>
        </SectionMessage>
      ) : null}

      <Inline>
        <Lozenge text={vm.chipText} appearance={vm.chipAppearance} />
      </Inline>

      {vm.rows.length > 0 ? (
        <DynamicTable
          head={HEAD}
          rows={vm.rows.map(rowCells)}
        />
      ) : (
        <Text>No citations to show yet. Run a verification to check this content.</Text>
      )}

      {vm.rows.length > 0 ? <Text>{vm.footer}</Text> : null}

      <Inline>
        <Button onClick={onVerifyNow} text="Verify now" />
        <Button onClick={onPostReport} text="Post report" />
      </Inline>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
