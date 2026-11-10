// CiteCheck admin page (confluence:globalSettings — only Confluence admins can open it):
// organisation sources + audit trail with CSV export.
import React from 'react';
import ForgeReconciler, { Heading, Stack, Tab, TabList, TabPanel, Tabs, Text } from '@forge/react';
import OrgSourcesPanel from './OrgSourcesPanel.jsx';
import AuditPanel from './AuditPanel.jsx';

function Admin() {
  return (
    <Stack space="space.200">
      <Heading as="h2">CiteCheck admin</Heading>
      <Text>Register your own policies and clause libraries as sources, and review every citation check.</Text>
      <Tabs id="citecheck-admin-tabs">
        <TabList>
          <Tab>Organisation sources</Tab>
          <Tab>Audit trail</Tab>
        </TabList>
        <TabPanel>
          <OrgSourcesPanel />
        </TabPanel>
        <TabPanel>
          <AuditPanel />
        </TabPanel>
      </Tabs>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <Admin />
  </React.StrictMode>
);
