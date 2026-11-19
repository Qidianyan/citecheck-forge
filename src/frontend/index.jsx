// CiteCheck byline popup (Confluence) and issue panel (Jira). Thin UI: decisions live in panelModel.js,
// copy in copy.js. Verdicts are shown with the UI Kit Icon + Lozenge (no emoji).
import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Button, ButtonGroup, Checkbox, CodeBlock, DynamicTable, EmptyState, ErrorMessage, Heading, HelperMessage,
  Icon, Inline, Label, Link, LoadingButton, Lozenge, Modal, ModalBody, ModalFooter, ModalHeader, ModalTitle,
  ModalTransition, RadioGroup, SectionMessage, Spinner, Stack, Text, TextArea, Textfield, UserPicker,
} from '@forge/react';
import { invoke, view } from '@forge/bridge';
import { COPY } from './copy.js';
import {
  panelState, errorMessage, summaryLozenges, relativeTime, panelRows, toTable, shareOptions, canAssign, validateForward,
} from './panelModel.js';

const M = COPY.shareModal;

/** Resolvers return { error } objects instead of throwing; treat both the same way. */
async function call(name, payload) {
  const out = await invoke(name, payload);
  if (out && typeof out === 'object' && out.error) { const e = new Error(out.message || out.error); Object.assign(e, out); throw e; }
  return out;
}

function VerdictCell({ p }) {
  return (
    <Inline space="space.050" alignBlock="center">
      <Icon glyph={p.glyph} label={p.label} size="small" />
      <Lozenge appearance={p.appearance}>{p.label}</Lozenge>
    </Inline>
  );
}

function WhyCell({ r }) {
  return (
    <Stack space="space.050">
      <Text>{r.reason_en || '—'}</Text>
      {(r.advisories ?? []).map((a, i) => <Text key={i} size="small">{COPY.note(a)}</Text>)}
      {r.suggested_article ? <Text weight="bold">{COPY.didYouMean(r.suggested_article)}</Text> : null}
    </Stack>
  );
}

function ResultsTable({ report }) {
  const rows = panelRows(report);
  const table = toTable(
    [COPY.columns.citation, COPY.columns.verdict, COPY.columns.why, COPY.columns.source],
    rows.map((r) => [
      <Stack space="space.0"><Text weight="bold">{r.citation}</Text><Text size="small">{r.law_title || r.law || '—'}</Text></Stack>,
      <VerdictCell p={r.presentation} />,
      <WhyCell r={r} />,
      r.evidence ? <Link href={r.evidence} openNewTab>{COPY.officialText}</Link> : <Text>—</Text>,
    ]),
    (_, i) => `row-${rows[i]?.n ?? i}`,
  );
  return <DynamicTable head={table.head} rows={table.rows} rowsPerPage={10} />;
}

function ShareModal({ product, onClose }) {
  const [step, setStep] = useState('choose'); // choose → confirm → done
  const [choice, setChoice] = useState('comment');
  const [user, setUser] = useState(null);
  const [note, setNote] = useState('');
  const [assign, setAssign] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const options = shareOptions(product);
  const form = validateForward({ accountId: user?.id, note, assign }, product);

  const run = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      if (choice === 'comment') setResult(await call('postReport'));
      else if (choice === 'page') setResult(await call('publishReportPage'));
      else if (choice === 'forward') setResult(await call('forwardReport', form.payload));
      else {
        const [md, link] = await Promise.all([call('exportReport'), call('getShareLink')]);
        setResult({ markdown: md.markdown, filename: md.filename, url: link.url });
      }
      setStep('done');
    } catch (e) {
      setError(errorMessage(e));
    } finally { setBusy(false); }
  }, [choice, form.payload]);

  const confirmText = choice === 'comment' ? M.confirmComment(product)
    : choice === 'page' ? M.confirmPage
      : choice === 'forward' ? M.confirmForward({ name: user?.name, product, assign: assign && canAssign(product) }) : null;

  return (
    <Modal onClose={onClose}>
      <ModalHeader><ModalTitle>{M.title}</ModalTitle></ModalHeader>
      <ModalBody>
        <Stack space="space.200">
          {error ? <SectionMessage appearance="error" title={COPY.errorHeader}><Text>{error}</Text></SectionMessage> : null}
          {step === 'choose' ? (
            <Stack space="space.150">
              <Label labelFor="share-choice">{M.choose}</Label>
              <RadioGroup name="share-choice" value={choice} onChange={(e) => setChoice(e.target.value)}
                options={options.map((o) => ({ name: 'share-choice', value: o.key, label: o.label }))} />
              <HelperMessage>{options.find((o) => o.key === choice)?.hint}</HelperMessage>
              {choice === 'forward' ? (
                <Stack space="space.100">
                  <UserPicker label={M.teammate} name="teammate" isRequired onChange={(u) => setUser(u ? { id: u.id, name: u.name } : null)} />
                  {user && form.errors.accountId ? <ErrorMessage>{form.errors.accountId}</ErrorMessage> : null}
                  <Label labelFor="note">{M.noteLabel}</Label>
                  <TextArea id="note" name="note" value={note} onChange={(e) => setNote(e.target.value)} />
                  {form.errors.note ? <ErrorMessage>{form.errors.note}</ErrorMessage> : <HelperMessage>{M.noteHelp(Array.from(note.trim()).length)}</HelperMessage>}
                  {canAssign(product) ? <Checkbox name="assign" label={M.assign} isChecked={assign} onChange={(e) => setAssign(Boolean(e.target.checked))} /> : null}
                </Stack>
              ) : null}
            </Stack>
          ) : null}
          {step === 'confirm' && confirmText ? (
            <SectionMessage appearance="information" title={M.options[choice]}><Text>{confirmText}</Text></SectionMessage>
          ) : null}
          {step === 'done' ? (
            <Stack space="space.150">
              <SectionMessage appearance="success" title={M.done[choice]}>
                {result?.url && choice === 'page' ? <Link href={result.url} openNewTab>{M.openPage}</Link> : <Text>{choice === 'forward' && result?.assigned ? 'The work item is now assigned to them.' : ' '}</Text>}
              </SectionMessage>
              {choice === 'export' ? (
                <Stack space="space.100">
                  <Textfield label={M.linkLabel} name="share-link" value={result?.url ?? ''} isReadOnly />
                  <HelperMessage>{M.linkHelp}</HelperMessage>
                  <Label labelFor="md">{M.markdownLabel}</Label>
                  <CodeBlock text={result?.markdown ?? ''} language="markdown" shouldWrapLongLines />
                </Stack>
              ) : null}
            </Stack>
          ) : null}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <ButtonGroup>
          {step === 'done' ? <Button appearance="primary" onClick={onClose}>{M.close}</Button> : null}
          {step === 'choose' ? <Button appearance="subtle" onClick={onClose}>{M.cancel}</Button> : null}
          {step === 'choose' && choice === 'export' ? <LoadingButton appearance="primary" isLoading={busy} onClick={run}>{M.confirm.export}</LoadingButton> : null}
          {step === 'choose' && choice !== 'export' ? <Button appearance="primary" isDisabled={choice === 'forward' && !form.ok} onClick={() => setStep('confirm')}>{M.next}</Button> : null}
          {step === 'confirm' ? <Button appearance="subtle" onClick={() => { setStep('choose'); setError(null); }}>{M.back}</Button> : null}
          {step === 'confirm' ? <LoadingButton appearance="primary" isLoading={busy} onClick={run}>{M.confirm[choice]}</LoadingButton> : null}
        </ButtonGroup>
      </ModalFooter>
    </Modal>
  );
}

function App() {
  const [product, setProduct] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const ctx = await view.getContext();
      const t = String(ctx?.extension?.type ?? '');
      setProduct(t.includes('jira') ? 'jira' : 'confluence');
      setReport((await call('getStatus')) ?? null);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const verify = useCallback(async () => {
    setVerifying(true); setError(null);
    try { setReport((await call('verifyNow')) ?? null); } catch (e) { setError(errorMessage(e)); } finally { setVerifying(false); }
  }, []);

  const { state, stale } = panelState({ loading, error, report });
  if (state === 'loading') return <Inline space="space.100" alignBlock="center"><Spinner label={COPY.loadingOpen} /><Text>{COPY.loadingOpen}</Text></Inline>;

  const s = report?.summary ?? {};
  return (
    <Stack space="space.200">
      <Inline spread="space-between" alignBlock="center">
        <Heading as="h3">{COPY.title}</Heading>
        <Inline space="space.050">{summaryLozenges(s).map((l) => <Lozenge key={l.text} appearance={l.appearance}>{l.text}</Lozenge>)}</Inline>
      </Inline>

      {state === 'error' ? (
        <SectionMessage appearance="error" title={COPY.errorHeader} actions={[<Button key="retry" onClick={load}>{COPY.tryAgain}</Button>]}>
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}

      {state === 'never-checked' ? (
        <EmptyState header={COPY.neverHeader} description={COPY.neverBody}
          primaryAction={<LoadingButton appearance="primary" isLoading={verifying} onClick={verify}>{COPY.neverAction}</LoadingButton>} />
      ) : null}

      {stale ? (
        <SectionMessage appearance="warning" title={COPY.staleHeader}><Text>{COPY.staleBody}</Text></SectionMessage>
      ) : null}

      {state === 'no-citations' ? <SectionMessage appearance="information" title={COPY.noneHeader}><Text>{COPY.noneBody}</Text></SectionMessage> : null}
      {state === 'flagged' ? <SectionMessage appearance="error" title={COPY.flaggedHeader(s.flagged)}><Text>{COPY.flaggedBody}</Text></SectionMessage> : null}
      {state === 'unverifiable-only' ? <SectionMessage appearance="warning" title={COPY.unverifiableHeader}><Text>{COPY.unverifiableBody}</Text></SectionMessage> : null}
      {state === 'clean' ? <SectionMessage appearance="success" title={COPY.cleanHeader}><Text>{COPY.checkedLine(relativeTime(report.verifiedAt), report.asOf ?? '—')}</Text></SectionMessage> : null}

      {report && (report.rows ?? []).length ? <ResultsTable report={report} /> : null}
      {report ? <Text size="small">{COPY.checkedLine(relativeTime(report.verifiedAt), report.asOf ?? '—')}</Text> : null}

      {report ? (
        <ButtonGroup>
          <LoadingButton appearance="primary" isLoading={verifying} onClick={verify}>{COPY.checkAgain}</LoadingButton>
          <Button iconBefore="share" onClick={() => setSharing(true)}>{COPY.share}</Button>
        </ButtonGroup>
      ) : null}

      <ModalTransition>{sharing ? <ShareModal product={product} onClose={() => setSharing(false)} /> : null}</ModalTransition>
    </Stack>
  );
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
