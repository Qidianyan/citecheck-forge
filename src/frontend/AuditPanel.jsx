// UI Kit panel: the CiteCheck verification audit trail (DynamicTable) + CSV export.
// Component only — the app shell mounts it; no ForgeReconciler.render here.
// UI Kit cannot write files, so the export renders the CSV into a CodeBlock with copy instructions.

import React, { useCallback, useEffect, useState } from 'react';
import {
  Text, DynamicTable, Button, CodeBlock, Stack, Inline, Heading, SectionMessage, Spinner,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { toAuditModel } from './auditModel.js';

const LIST_LIMIT = 100;
const CSV_MAX = 5000;

export default function AuditPanel() {
  const [rows, setRows] = useState(null);
  const [csv, setCsv] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await invoke('auditList', { limit: LIST_LIMIT });
        if (!cancelled) setRows(res?.results ?? []);
      } catch (e) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setRows((r) => (r === null ? [] : r));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onExportCsv = useCallback(async () => {
    setError(null);
    try {
      const res = await invoke('auditCsv', { max: CSV_MAX });
      setCsv(res?.csv ?? '');
    } catch (e) {
      setError(e?.message ?? String(e));
    }
  }, []);

  const vm = toAuditModel(rows ?? []);

  return (
    <Stack space="medium">
      <Heading size="small">CiteCheck verification audit</Heading>

      {error ? (
        <SectionMessage title="Could not load the audit trail" appearance="error">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}

      <Inline>
        <Button text="Export CSV" onClick={onExportCsv} />
      </Inline>

      {rows !== null && vm.rows.length > 0 ? (
        <DynamicTable head={vm.head} rows={vm.rows} />
      ) : (
        <Text>{rows === null ? '' : 'No verification runs recorded yet.'}</Text>
      )}

      <Text>{vm.footer}</Text>

      {csv !== null ? (
        <Stack space="small">
          <Text>
            CSV export ready — select the text below, copy it into a .csv file, or paste it into a spreadsheet.
          </Text>
          <CodeBlock text={csv} language="csv" />
        </Stack>
      ) : null}
    </Stack>
  );
}
