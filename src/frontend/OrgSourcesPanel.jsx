// UI Kit panel for organisation-specific law sources (registered Confluence pages).
// No ForgeReconciler.render here: the app embeds this component in its admin page.
// All logic lives in orgSourcesModel.js (pure, tested); this file only binds it to invocations.
import React, { useCallback, useEffect, useState } from 'react';
import {
  Button, DynamicTable, Heading, Inline, Link, SectionMessage, Spinner, Stack, Text, TextInput,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { formErrors, toOrgSourcesViewModel } from './orgSourcesModel.js';

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
    const firstError = Object.values(formErrors({ pageId, sourceKey }))[0];
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

  return (
    <Stack space="medium">
      <Heading size="small">Organisation sources</Heading>

      {vm.error ? (
        <SectionMessage title="Something went wrong" appearance="error">
          <Text>{vm.error}</Text>
        </SectionMessage>
      ) : null}

      {vm.notice ? (
        <SectionMessage title={vm.notice} appearance="success" />
      ) : null}

      <Inline>
        <TextInput label="Confluence page ID" name="pageId" value={pageId} onChange={(e) => setPageId(e.target.value)} />
        <TextInput label="Source key" name="sourceKey" value={sourceKey} onChange={(e) => setSourceKey(e.target.value)} />
        <Button text="Register page" appearance="primary" onClick={register} isDisabled={busy} />
      </Inline>

      {vm.rows.length > 0 ? (
        <DynamicTable
          head={HEAD}
          rows={vm.rows.map((r) => [
            r.sourceKey,
            r.title || '—',
            String(r.clauses),
            r.registeredAt || '—',
            r.pageUrl ? <Link href={r.pageUrl}>open page</Link> : '—',
            <Inline>
              <Button text="Refresh" onClick={() => refresh(r.sourceKey)} />
              <Button text="Remove" appearance="danger" onClick={() => remove(r.sourceKey)} />
            </Inline>,
          ])}
        />
      ) : (
        <Text>No organisation sources registered yet. Register a Confluence page above.</Text>
      )}
    </Stack>
  );
}
