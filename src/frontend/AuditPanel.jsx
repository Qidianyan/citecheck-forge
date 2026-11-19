// UI Kit panel: the CiteCheck verification audit trail (DynamicTable) + CSV export.
// Component only — the app shell mounts it; no ForgeReconciler.render here.
// UI Kit cannot write files, so the export renders the CSV into a CodeBlock with copy instructions.

import React, { useCallback, useEffect, useState } from 'react';
import {
  Text, DynamicTable, Button, CodeBlock, EmptyState, Stack, Inline, Heading, SectionMessage, Spinner,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { toAuditModel } from './auditModel.js';
import { toTable } from './panelModel.js';

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
        <Button iconBefore="download" onClick={onExportCsv}>Export CSV</Button>
      </Inline>

      {rows !== null && vm.rows.length > 0 ? (
        <DynamicTable {...toTable(vm.head, vm.rows)} rowsPerPage={20} />
      ) : (
        rows === null ? <Spinner label="Loading audit trail" /> : <EmptyState header="No checks recorded yet" description="Every citation check and every share appears here, with who ran it and what was flagged." />
      )}

      <Text>{vm.footer}</Text>

      {csv !== null ? (
        <Stack space="small">
          <Text>
            CSV export ready. Select the text below and paste it into a spreadsheet or a .csv file.
          </Text>
          <CodeBlock text={csv} language="text" />
        </Stack>
      ) : null}
    </Stack>
  );
}
