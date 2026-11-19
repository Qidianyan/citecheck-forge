// UI Kit panel for organisation-specific law sources (registered Confluence pages).
// No ForgeReconciler.render here: the app embeds this component in its admin page.
// All logic lives in orgSourcesModel.js (pure, tested); this file only binds it to invocations.
import React, { useCallback, useEffect, useState } from 'react';
import {
  Button, DynamicTable, EmptyState, ErrorMessage, Heading, HelperMessage, Inline, Label, Link, SectionMessage, Spinner, Stack, Text, Textfield,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { formErrors, toOrgSourcesViewModel } from './orgSourcesModel.js';
import { validateOrgForm } from './adminModel.js';
import { toTable } from './panelModel.js';

const HEAD = ['Source key', 'Title', 'Clauses', 'Registered at', 'Page', ''];

export default function OrgSourcesPanel() {
  const [sources, setSources] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pageId, setPageId] = useState('');
  const [sourceKey, setSourceKey] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await invoke('orgList');
      setSources(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message ?? String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const register = useCallback(async () => {
    setError(null);
    setNotice(null);
    const firstError = Object.values({ ...validateOrgForm({ pageId, sourceKey }), ...formErrors({ pageId, sourceKey }) })[0];
    if (firstError) { setError(firstError); return; }
    setBusy(true);
    try {
      const res = await invoke('orgRegister', { pageId: pageId.trim(), sourceKey: sourceKey.trim() });
      setNotice(`Registered ${res?.sourceKey}: ${res?.clauses ?? 0} clauses parsed.`);
      setPageId('');
      setSourceKey('');
      await load();
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [pageId, sourceKey, load]);

  const remove = useCallback(async (key) => {
    setError(null);
    setNotice(null);
    try {
      await invoke('orgRemove', { sourceKey: key });
      setNotice(`Removed ${key}.`);
      await load();
    } catch (e) { setError(e?.message ?? String(e)); }
  }, [load]);

  const refresh = useCallback(async (key) => {
    setError(null);
    setNotice(null);
    try {
      const res = await invoke('orgRefresh', { sourceKey: key });
      setNotice(`Refreshed ${key}: ${res?.clauses ?? 0} clauses parsed.`);
      await load();
    } catch (e) { setError(e?.message ?? String(e)); }
  }, [load]);

  if (sources === null) return <Spinner />;

  const vm = toOrgSourcesViewModel(sources, { error, notice });
  const fieldErrors = validateOrgForm({ pageId, sourceKey });
  const table = toTable(HEAD, vm.rows.map((r) => [
    r.sourceKey,
    r.title || '—',
    String(r.clauses),
    r.registeredAt || '—',
    r.pageUrl ? <Link href={r.pageUrl} openNewTab>Open page</Link> : '—',
    <Inline space="space.050">
      <Button onClick={() => refresh(r.sourceKey)}>Refresh</Button>
      <Button appearance="danger" onClick={() => remove(r.sourceKey)}>Remove</Button>
    </Inline>,
  ]), (_, i) => vm.rows[i].sourceKey);

  return (
    <Stack space="medium">
      <Heading size="small">Organisation sources</Heading>

      {vm.error ? (
        <SectionMessage title="Can't complete this" appearance="error">
          <Text>{vm.error}</Text>
        </SectionMessage>
      ) : null}

      {vm.notice ? (
        <SectionMessage title={vm.notice} appearance="success" />
      ) : null}

      <Text>Register a Confluence page (a policy or clause library) as a source. Citations like "Policy POL-7 §3" are then checked against it.</Text>
      <Stack space="space.100">
        <Label labelFor="pageId">Confluence page ID</Label>
        <Textfield id="pageId" name="pageId" value={pageId} onChange={(e) => setPageId(e.target.value)} />
        {pageId && fieldErrors.pageId ? <ErrorMessage>{fieldErrors.pageId}</ErrorMessage> : <HelperMessage>The number in the page URL after /pages/.</HelperMessage>}
        <Label labelFor="sourceKey">Source key</Label>
        <Textfield id="sourceKey" name="sourceKey" value={sourceKey} onChange={(e) => setSourceKey(e.target.value)} />
        {sourceKey && fieldErrors.sourceKey ? <ErrorMessage>{fieldErrors.sourceKey}</ErrorMessage> : <HelperMessage>How documents cite it, for example POL-7.</HelperMessage>}
        <Inline><Button appearance="primary" onClick={register} isDisabled={busy}>Register page</Button></Inline>
      </Stack>

      {vm.rows.length > 0 ? (
        <DynamicTable
          head={table.head}
          rows={table.rows}
        />
      ) : (
        <EmptyState header="No organisation sources yet" description="Register a policy or clause library page above to check citations against it." />
      )}
    </Stack>
  );
}
