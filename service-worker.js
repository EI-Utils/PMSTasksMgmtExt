chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(error => {
  console.error('Unable to enable the PMSTasksMgmt side panel:', error);
});