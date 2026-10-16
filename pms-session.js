function readPmsSession() {
  const token = localStorage.getItem('Token');
  let userId = null;

  if (token) {
    try {
      const encoded = token.replace(/^Bearer\s+/i, '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
      let sub = payload.sub;
      if (typeof sub === 'string') {
        try { sub = JSON.parse(sub); } catch (e) {}
      }
      userId = payload.UserId ?? payload.userId ?? sub?.UserId ?? sub?.userId ?? (typeof sub === 'number' || typeof sub === 'string' ? sub : null);
    } catch (e) {}
  }

  let selectedProject = {};
  try {
    selectedProject = JSON.parse(sessionStorage.getItem('selectedProject') || '{}');
  } catch (e) {}

  return {
    token,
    userId,
    projectId: selectedProject?.ProjectId ?? selectedProject?.project_id ?? selectedProject?.Id ?? selectedProject?.id ?? null,
    identifier: selectedProject?.ProjectIdentifier ?? selectedProject?.identifier ?? selectedProject?.Identifier ?? null
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'READ_PMS_SESSION') return;
  try {
    sendResponse({ ok: true, context: readPmsSession() });
  } catch (error) {
    sendResponse({ ok: false, error: error.message || 'Unable to read the PMS session.' });
  }
});