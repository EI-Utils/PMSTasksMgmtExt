let jiraBaseUrl = '';
const JIRA_URL_STORAGE_KEY = 'jiraBaseUrl';
const PMS_API_BASE = 'https://sap-pms.einfochips.com:50000/api/v1';

// Convert date string (ISO or DD-MM-YYYY) to standard YYYY-MM-DD
function toYYYYMMDD(str) {
  if (!str) return '';
  const text = String(str).trim();
  const reversed = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T\d{2}:\d{2})/);
  if (!reversed && !iso) return '';
  const year = Number(reversed ? reversed[3] : iso[1]);
  const month = Number(reversed ? reversed[2] : iso[2]);
  const day = Number(reversed ? reversed[1] : iso[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Convert Jira original estimate to total hours (defaults to 0)
function calcHours(sec, text) {
  if (typeof sec === 'number' && sec > 0) return Number((sec / 3600).toFixed(2));
  if (text) {
    let total = 0;
    const s = String(text);
    const w = s.match(/(\d+(?:\.\d+)?)\s*w/i);
    const d = s.match(/(\d+(?:\.\d+)?)\s*d/i);
    const h = s.match(/(\d+(?:\.\d+)?)\s*h/i);
    const m = s.match(/(\d+(?:\.\d+)?)\s*m/i);
    if (w) total += parseFloat(w[1]) * 40;
    if (d) total += parseFloat(d[1]) * 8;
    if (h) total += parseFloat(h[1]);
    if (m) total += parseFloat(m[1]) / 60;
    if (total > 0) return Number(total.toFixed(2));
  }
  return 0;
}

// DOM Elements
const jiraKeyInput = document.getElementById('jiraKey');
const fetchBtn = document.getElementById('fetchBtn');
const statusDiv = document.getElementById('status');
const pmsStatusDiv = document.getElementById('pmsStatus');
const subjectInput = document.getElementById('subject');
const startDateInput = document.getElementById('startDate');
const actualStartDateInput = document.getElementById('actualStartDate');
const dueDateInput = document.getElementById('dueDate');
const hoursInput = document.getElementById('hours');
const submitBtn = document.getElementById('submitBtn');
const ownerSelect = document.getElementById('ownerSelect');
const versionSelect = document.getElementById('versionSelect');
const categorySelect = document.getElementById('categorySelect');
const projectSelect = document.getElementById('projectSelect');
const taskStatusSelect = document.getElementById('taskStatusSelect');
const accessBtn = document.getElementById('accessBtn');
const jiraUrlInput = document.getElementById('jiraUrlInput');
const accessMessage = document.getElementById('accessMessage');
const accessBar = document.getElementById('accessBar');
const accessSummaryState = document.getElementById('accessSummaryState');
const createTab = document.getElementById('createTab');
const statusTab = document.getElementById('statusTab');
const wsrTab = document.getElementById('wsrTab');
const jiraWorklogTab = document.getElementById('jiraWorklogTab');
const closeTab = document.getElementById('closeTab');
const closePanel = document.getElementById('closePanel');
const closeTicketSelect = document.getElementById('closeTicketSelect');
const closeRefreshBtn = document.getElementById('closeRefreshBtn');
const closeSourceList = document.getElementById('closeSourceList');
const closeSourceJira = document.getElementById('closeSourceJira');
const closeListSource = document.getElementById('closeListSource');
const closeJiraSource = document.getElementById('closeJiraSource');
const closeJiraKey = document.getElementById('closeJiraKey');
const closeFetchBtn = document.getElementById('closeFetchBtn');
const closeStatus = document.getElementById('closeStatus');
const closeTicket = document.getElementById('closeTicket');
const closeCurrentStatus = document.getElementById('closeCurrentStatus');
const closeDueDate = document.getElementById('closeDueDate');
const closeActualEndDate = document.getElementById('closeActualEndDate');
const closeEstimatedHours = document.getElementById('closeEstimatedHours');
const closeSpentHours = document.getElementById('closeSpentHours');
const closeDoneRatio = document.getElementById('closeDoneRatio');
const closeSubmitBtn = document.getElementById('closeSubmitBtn');
const createPanel = document.getElementById('createPanel');
const statusPanel = document.getElementById('statusPanel');
const wsrPanel = document.getElementById('wsrPanel');
const jiraWorklogPanel = document.getElementById('jiraWorklogPanel');
const assignmentMessage = document.getElementById('assignmentMessage');
const assignmentRows = document.getElementById('assignmentRows');
const statusRefreshBtn = document.getElementById('statusRefreshBtn');
const wsrStartDate = document.getElementById('wsrStartDate');
const wsrLoadBtn = document.getElementById('wsrLoadBtn');
const wsrMessage = document.getElementById('wsrMessage');
const wsrRows = document.getElementById('wsrRows');
const wsrSubjects = document.getElementById('wsrSubjects');
const wsrCopyBtn = document.getElementById('wsrCopyBtn');
const jiraWorklogStartDate = document.getElementById('jiraWorklogStartDate');
const jiraWorklogLoadBtn = document.getElementById('jiraWorklogLoadBtn');
const jiraWorklogMessage = document.getElementById('jiraWorklogMessage');
const jiraWorklogRows = document.querySelector('#jiraWorklogRows tbody');
const jiraWorklogLogBtn = document.getElementById('jiraWorklogLogBtn');
const jiraWorklogSelectAll = document.getElementById('jiraWorklogSelectAll');

const PMS_HOST_ORIGINS = [
  'https://sap-pms.einfochips.com/*',
  'https://sap-pms.einfochips.com:50000/*'
];

let pmsContext = null;
let pmsReady = false;
let pmsProjects = [];
let pmsLoadId = 0;
let jiraLoadId = 0;
let jiraLoading = false;
let jiraFailed = false;
let submitting = false;
let submissionLocked = false;
let pmsMetadata = null;
let pmsWorkflow = null;
let assignmentLoadId = 0;
let wsrLoadId = 0;
let jiraWorklogLoadId = 0;
let jiraWorklogEntries = [];
let jiraWorklogLogging = false;
let closeLoadId = 0;
let closeListLoadId = 0;
let closeListLoading = false;
let closeTickets = [];
let closeTicketData = null;
let closeSubmitting = false;
const PMS_CLOSED_STATUS_ID = 5;

function setStatusTone(element, tone) {
  element.dataset.tone = tone;
}

function activateTab(tab, moveFocus = false) {
  const tabs = [statusTab, createTab, closeTab, wsrTab, jiraWorklogTab];
  const panels = [statusPanel, createPanel, closePanel, wsrPanel, jiraWorklogPanel];
  const selectedIndex = tabs.indexOf(tab);
  tabs.forEach((item, index) => {
    const selected = index === selectedIndex;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    panels[index].hidden = !selected;
  });
  if (moveFocus) tab.focus();
}

function setTabsLocked(locked) {
  const tabs = [statusTab, createTab, closeTab, wsrTab, jiraWorklogTab];
  const panels = [statusPanel, createPanel, closePanel, wsrPanel, jiraWorklogPanel];
  tabs.forEach(tab => { tab.disabled = locked; });
  if (locked) panels.forEach(panel => { panel.hidden = true; });
  else activateTab(statusTab);
}

function normalizeJiraUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch (e) { return null; }
  if (url.protocol !== 'https:' || !url.hostname) return null;
  return url.origin;
}

function accessOrigins(jiraOrigin) {
  return [...PMS_HOST_ORIGINS, `${jiraOrigin}/*`];
}

const appTabs = [statusTab, createTab, closeTab, wsrTab, jiraWorklogTab];
for (const tab of appTabs) {
  tab.addEventListener('click', () => activateTab(tab));
  tab.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const index = appTabs.indexOf(tab);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? appTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : appTabs.length - 1)) % appTabs.length;
    const nextTab = appTabs[nextIndex];
    activateTab(nextTab, true);
  });
}

function getDefaultWsrStartDate(now = new Date()) {
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  return `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;
}

wsrStartDate.value = getDefaultWsrStartDate();

function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function fetchWeeklyTimesheetDays(startDate) {
  const res = await fetch(`${PMS_API_BASE}/Timesheet/GetWeeklyTimeEntries`, {
    method: 'POST',
    headers: {
      authorization: pmsContext.token,
      projectidentifier: pmsContext.identifier || '',
      'content-type': 'application/json',
      accept: 'application/json, text/plain, */*'
    },
    body: JSON.stringify({ UserId: pmsContext.userId, StartDate: startDate, IsClosedStatus: 'Open', IsAllUsersTasks: false })
  });
  const responseText = await res.text();
  if (!res.ok) {
    let detail = responseText;
    try {
      const error = JSON.parse(responseText);
      detail = error.Message || error.title || JSON.stringify(error.errors || error);
    } catch (e) {}
    throw new Error(`Weekly timesheet request for ${startDate} failed (HTTP ${res.status}): ${detail}`);
  }
  let data;
  try { data = JSON.parse(responseText); } catch (e) { throw new Error('PMS returned an invalid weekly-timesheet response.'); }
  assertPmsResponse(data);
  const entries = data?.Data?.WeeklyTimesheetEntries;
  if (!Array.isArray(entries)) throw new Error(`PMS did not return weekly timesheet entries for ${startDate}.`);
  return entries;
}

async function loadWeeklyTimesheet() {
  const loadId = ++wsrLoadId;
  wsrLoadBtn.disabled = true;
  wsrCopyBtn.disabled = true;
  wsrMessage.textContent = 'Loading weekly PMS timesheet...';
  wsrRows.replaceChildren();
  wsrSubjects.value = '';
  try {
    if (!pmsReady || !pmsContext?.token) throw new Error('PMS is still connecting. Wait for Create to finish loading, then try again.');
    const startDate = wsrStartDate.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Select the Sunday that starts the week.');
    const [year, month, day] = startDate.split('-').map(Number);
    const selectedDate = new Date(year, month - 1, day);
    if (selectedDate.getFullYear() !== year || selectedDate.getMonth() !== month - 1 || selectedDate.getDate() !== day) {
      throw new Error('Enter a valid week-start date.');
    }
    if (selectedDate.getDay() !== 0) throw new Error('The selected week must start on Sunday.');

    const weekEnd = new Date(year, month - 1, day + 6);
    let days = await fetchWeeklyTimesheetDays(startDate);
    if (loadId !== wsrLoadId) return;
    if (weekEnd.getMonth() !== selectedDate.getMonth() || weekEnd.getFullYear() !== selectedDate.getFullYear()) {
      const nextMonthStart = new Date(year, month, 1);
      const nextMonthEntries = await fetchWeeklyTimesheetDays(formatLocalDate(nextMonthStart));
      if (loadId !== wsrLoadId) return;
      const firstNextMonthDay = formatLocalDate(nextMonthStart);
      const lastWeekDay = formatLocalDate(weekEnd);
      const remainingDays = nextMonthEntries.filter(entry => {
        const date = String(entry?.Date || '').slice(0, 10);
        return date >= firstNextMonthDay && date <= lastWeekDay;
      });
      const existingDates = new Set(days.map(entry => String(entry?.Date || '').slice(0, 10)));
      days = [...days, ...remainingDays.filter(entry => !existingDates.has(String(entry?.Date || '').slice(0, 10)))];
    }

    const rows = days.flatMap(dayEntry => {
      if (!Array.isArray(dayEntry?.listTimesheetDetails)) return [];
      return dayEntry.listTimesheetDetails.map(detail => ({
        date: String(dayEntry.Date || '').slice(0, 10),
        project: detail.ProjectName || '',
        taskId: detail.TaskId,
        subject: detail.TaskTitle || '',
        hours: Number(detail.SpentHrs) || 0
      }));
    });
    const subjects = Array.from(new Set(rows.map(entry => entry.subject.trim()).filter(Boolean)));
    wsrSubjects.value = subjects.join('\n');
    wsrCopyBtn.disabled = !subjects.length;
    wsrRows.replaceChildren();
    if (!rows.length) {
      const row = document.createElement('tr');
      const cell = addStatusCell(row, 'No task time entries for this week.');
      cell.colSpan = 4;
      wsrRows.appendChild(row);
    } else {
      for (const entry of rows) {
        const row = document.createElement('tr');
        addStatusCell(row, entry.date);
        addStatusCell(row, entry.project);
        const taskCell = document.createElement('td');
        const taskLink = document.createElement('a');
        taskLink.className = 'ticket-link';
        taskLink.href = `https://sap-pms.einfochips.com/issues/${encodeURIComponent(entry.taskId)}`;
        taskLink.target = '_blank';
        taskLink.rel = 'noopener noreferrer';
        taskLink.textContent = entry.subject || `#${entry.taskId}`;
        taskCell.appendChild(taskLink);
        row.appendChild(taskCell);
        addStatusCell(row, `${entry.hours}h`);
        wsrRows.appendChild(row);
      }
    }
    const formattedEnd = formatLocalDate(weekEnd);
    wsrMessage.textContent = `${rows.length} task time entr${rows.length === 1 ? 'y' : 'ies'} · ${startDate} to ${formattedEnd}`;
  } catch (error) {
    if (loadId !== wsrLoadId) return;
    wsrMessage.textContent = error.message || 'Could not load the weekly timesheet.';
    wsrSubjects.value = '';
    wsrCopyBtn.disabled = true;
    const row = document.createElement('tr');
    const cell = addStatusCell(row, 'Unable to load weekly timesheet.');
    cell.colSpan = 4;
    wsrRows.replaceChildren(row);
  } finally {
    if (loadId === wsrLoadId) wsrLoadBtn.disabled = false;
  }
}

wsrLoadBtn.addEventListener('click', loadWeeklyTimesheet);

wsrCopyBtn.addEventListener('click', async () => {
  if (!wsrSubjects.value) return;
  wsrSubjects.focus();
  wsrSubjects.select();
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(wsrSubjects.value);
    wsrMessage.textContent = `Copied ${wsrSubjects.value.split('\n').length} task subjects.`;
  } catch (error) {
    const copied = document.execCommand('copy');
    wsrMessage.textContent = copied ? 'Task subjects copied.' : 'Subjects selected. Copy them with Ctrl+C.';
  }
});

jiraWorklogStartDate.value = getDefaultWsrStartDate();

async function fetchJiraCurrentUser() {
  const res = await fetch(`${jiraBaseUrl}/rest/api/3/myself`, {
    credentials: 'include',
    headers: { accept: 'application/json' }
  });
  const responseText = await res.text();
  if (!res.ok) throw new Error(jiraResponseError(res, 'your Jira account', responseText));
  let user;
  try { user = JSON.parse(responseText); } catch (error) { throw new Error('Jira returned an unexpected current-user response.'); }
  if (typeof user.accountId !== 'string' || !user.accountId) throw new Error('Jira did not return the signed-in user account ID.');
  return user;
}

async function fetchAllJiraIssueWorklogs(issueKey) {
  const worklogs = [];
  let startAt = 0;
  let total = Infinity;
  while (startAt < total) {
    const params = new URLSearchParams({ startAt: String(startAt), maxResults: '100' });
    const res = await fetch(`${jiraBaseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog?${params}`, {
      credentials: 'include',
      headers: { accept: 'application/json' }
    });
    const responseText = await res.text();
    if (!res.ok) throw new Error(jiraResponseError(res, issueKey, responseText));
    let data;
    try { data = JSON.parse(responseText); } catch (error) { throw new Error(`Jira returned invalid worklog data for ${issueKey}.`); }
    if (!Array.isArray(data.worklogs) || !Number.isSafeInteger(Number(data.total)) || Number(data.total) < 0) {
      throw new Error(`Jira returned an incomplete worklog response for ${issueKey}.`);
    }
    total = Number(data.total);
    if (!data.worklogs.length && startAt < total) throw new Error(`Jira returned incomplete worklog pagination for ${issueKey}.`);
    worklogs.push(...data.worklogs);
    startAt += data.worklogs.length;
  }
  return worklogs;
}

function jiraCommentText(comment) {
  if (typeof comment === 'string') return comment;
  if (!comment || typeof comment !== 'object') return '';
  if (comment.type === 'text') return comment.text || '';
  if (comment.type === 'hardBreak') return '\n';
  const children = Array.isArray(comment.content) ? comment.content.map(jiraCommentText).join('') : '';
  return comment.type === 'paragraph' ? `${children}\n` : children;
}

function formatJiraWorklogDuration(worklog) {
  if (typeof worklog.timeSpent === 'string' && worklog.timeSpent) return worklog.timeSpent;
  const seconds = Number(worklog.timeSpentSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', remainingSeconds ? `${remainingSeconds}s` : ''].filter(Boolean).join(' ') || '0m';
}

function showJiraWorklogMessageRow(message) {
  jiraWorklogEntries = [];
  updateJiraWorklogSelection();
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = 6;
  cell.textContent = message;
  row.appendChild(cell);
  jiraWorklogRows.replaceChildren(row);
}

function updateJiraWorklogSelection() {
  const selectable = jiraWorklogEntries.filter(entry => !entry.checkbox.disabled);
  const checked = selectable.filter(entry => entry.checkbox.checked);
  jiraWorklogSelectAll.disabled = jiraWorklogLogging || !selectable.length;
  jiraWorklogSelectAll.checked = selectable.length > 0 && checked.length === selectable.length;
  jiraWorklogSelectAll.indeterminate = checked.length > 0 && checked.length < selectable.length;
  jiraWorklogLogBtn.disabled = jiraWorklogLogging || !checked.length;
}

function setPmsLogResult(entry, tone, text) {
  setStatusTone(entry.resultCell, tone);
  entry.resultCell.textContent = text;
}

async function loadJiraWorklogs() {
  const loadId = ++jiraWorklogLoadId;
  jiraWorklogLoadBtn.disabled = true;
  setStatusTone(jiraWorklogMessage, 'muted');
  jiraWorklogMessage.textContent = 'Loading Jira worklogs...';
  showJiraWorklogMessageRow('Loading Jira worklogs...');
  try {
    const startDate = jiraWorklogStartDate.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Select the Sunday that starts the week.');
    const [year, month, day] = startDate.split('-').map(Number);
    const selectedDate = new Date(year, month - 1, day);
    if (selectedDate.getFullYear() !== year || selectedDate.getMonth() !== month - 1 || selectedDate.getDate() !== day) {
      throw new Error('Enter a valid week-start date.');
    }
    if (selectedDate.getDay() !== 0) throw new Error('The selected week must start on Sunday.');

    const weekEnd = new Date(year, month - 1, day + 6);
    const endDate = formatLocalDate(weekEnd);
    const jql = `worklogDate >= "${startDate}" AND worklogDate <= "${endDate}" ORDER BY key ASC`;
    const issues = await searchJiraIssues(jql, 'issues with work logged during the selected week');
    if (loadId !== jiraWorklogLoadId) return;
    if (!issues.length) {
      jiraWorklogMessage.textContent = `No Jira worklogs found for ${startDate} to ${endDate}.`;
      showJiraWorklogMessageRow('No worklogs found for this week.');
      return;
    }

    const user = await fetchJiraCurrentUser();
    if (loadId !== jiraWorklogLoadId) return;
    const worklogs = [];
    for (let index = 0; index < issues.length; index += 5) {
      const issueBatch = issues.slice(index, index + 5);
      const results = await Promise.all(issueBatch.map(issue => fetchAllJiraIssueWorklogs(issue.key)));
      if (loadId !== jiraWorklogLoadId) return;
      for (let issueIndex = 0; issueIndex < issueBatch.length; issueIndex++) {
        const issue = issueBatch[issueIndex];
        for (const worklog of results[issueIndex]) {
          const started = String(worklog.started || '');
          const worklogDate = started.slice(0, 10);
          if (worklog.author?.accountId !== user.accountId || worklogDate < startDate || worklogDate > endDate) continue;
          worklogs.push({ issue, worklog, started, worklogDate });
        }
      }
      jiraWorklogMessage.textContent = `Loaded worklogs for ${Math.min(index + issueBatch.length, issues.length)} of ${issues.length} Jira issues...`;
    }
    if (loadId !== jiraWorklogLoadId) return;

    worklogs.sort((left, right) => right.started.localeCompare(left.started));
    jiraWorklogRows.replaceChildren();
    if (!worklogs.length) {
      jiraWorklogMessage.textContent = `No Jira worklogs found for ${startDate} to ${endDate}.`;
      showJiraWorklogMessageRow('No worklogs found for this week.');
      return;
    }
    for (const entry of worklogs) {
      const row = document.createElement('tr');
      const selectCell = document.createElement('td');
      entry.checkbox = document.createElement('input');
      entry.checkbox.type = 'checkbox';
      entry.checkbox.setAttribute('aria-label', `Log ${entry.issue.key} ${entry.worklogDate} in PMS`);
      entry.checkbox.addEventListener('change', updateJiraWorklogSelection);
      selectCell.appendChild(entry.checkbox);
      row.appendChild(selectCell);
      const startedCell = document.createElement('td');
      startedCell.textContent = entry.started.replace('T', ' ').replace(/\.\d+/, '').replace(/(?:Z|[+-]\d{2}:?\d{2})$/, '');
      row.appendChild(startedCell);
      const issueCell = document.createElement('td');
      const issueLink = document.createElement('a');
      issueLink.className = 'ticket-link';
      issueLink.href = `${jiraBaseUrl}/browse/${encodeURIComponent(entry.issue.key)}`;
      issueLink.target = '_blank';
      issueLink.rel = 'noopener noreferrer';
      issueLink.textContent = entry.issue.key;
      issueCell.appendChild(issueLink);
      const summary = entry.issue.fields?.summary;
      if (typeof summary === 'string' && summary) {
        const summaryText = document.createElement('span');
        summaryText.className = 'jira-description';
        summaryText.textContent = summary;
        summaryText.title = summary;
        issueCell.appendChild(summaryText);
      }
      row.appendChild(issueCell);
      const durationCell = document.createElement('td');
      durationCell.textContent = formatJiraWorklogDuration(entry.worklog);
      row.appendChild(durationCell);
      const commentCell = document.createElement('td');
      commentCell.textContent = jiraCommentText(entry.worklog.comment).trim();
      row.appendChild(commentCell);
      entry.resultCell = document.createElement('td');
      entry.resultCell.className = 'pms-log-result';
      row.appendChild(entry.resultCell);
      jiraWorklogRows.appendChild(row);
    }
    jiraWorklogEntries = worklogs;
    updateJiraWorklogSelection();
    jiraWorklogMessage.textContent = `${worklogs.length} Jira worklog entr${worklogs.length === 1 ? 'y' : 'ies'} · ${startDate} to ${endDate}`;
  } catch (error) {
    if (loadId !== jiraWorklogLoadId) return;
    jiraWorklogMessage.textContent = error.message || 'Could not load Jira worklogs.';
    showJiraWorklogMessageRow('Unable to load Jira worklogs.');
  } finally {
    if (loadId === jiraWorklogLoadId) jiraWorklogLoadBtn.disabled = false;
  }
}

jiraWorklogLoadBtn.addEventListener('click', loadJiraWorklogs);

jiraWorklogSelectAll.addEventListener('change', () => {
  for (const entry of jiraWorklogEntries) {
    if (!entry.checkbox.disabled) entry.checkbox.checked = jiraWorklogSelectAll.checked;
  }
  updateJiraWorklogSelection();
});

async function findPmsTicketsByJiraKey(jiraKey, projects = pmsProjects) {
  const projectsByIdentifier = new Map(projects.map(project => [project.identifier, project]));
  const matches = new Map();
  let scanned = 0;
  for (let pageNumber = 1; ; pageNumber++) {
    const res = await fetch(`${PMS_API_BASE}/dashboard/GlobalSearch/SearchGlobal`, {
      method: 'POST',
      headers: {
        authorization: pmsContext.token,
        projectidentifier: pmsContext.identifier || '',
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        SearchText: jiraKey,
        Filter: 'Issue,Document,Project',
        UserId: pmsContext.userId,
        isProjectData: true,
        NoSearchAttachment: true,
        FileNameAndDescription: false,
        AttachmentOnly: false,
        PageNumber: pageNumber,
        PageSize: 10,
        ProjectScope: 'all',
        TitlesOnly: false,
        AllWords: false
      })
    });
    if (!res.ok) throw new Error(`PMS ticket search for ${jiraKey} failed (HTTP ${res.status}).`);
    const data = await res.json();
    assertPmsResponse(data);
    const rows = data?.Data?.searchData?.RowData;
    const total = Number(data?.Data?.searchData?.CountData?.TotalCount);
    if (!Array.isArray(rows) || !Number.isSafeInteger(total) || total < 0) {
      throw new Error(`PMS ticket search for ${jiraKey} returned an unexpected response.`);
    }
    for (const row of rows) {
      if (String(row?.Source || '').toLowerCase() !== 'issue' || typeof row.Subject !== 'string') continue;
      const project = projectsByIdentifier.get(row.Identifier);
      const taskId = Number(row.Id);
      if (!project || !Number.isSafeInteger(taskId) || taskId <= 0 || !getJiraKeys(row.Subject).includes(jiraKey)) continue;
      matches.set(taskId, { taskId, project, subject: row.Subject });
    }
    scanned += rows.length;
    if (scanned >= total) return Array.from(matches.values());
    if (!rows.length || pageNumber >= 1000) throw new Error(`PMS ticket search for ${jiraKey} returned incomplete results.`);
  }
}

async function addPmsTimeEntry(ticket, date, hours, remark) {
  const res = await fetch(`${PMS_API_BASE}/Timesheet/AddOrUpdateTimeEntries`, {
    method: 'POST',
    headers: {
      authorization: pmsContext.token,
      projectidentifier: ticket.project.identifier,
      'content-type': 'application/json',
      accept: 'application/json, text/plain, */*'
    },
    body: JSON.stringify({
      UserId: pmsContext.userId,
      TimesheetData: [{ TimesheetId: 0, ProjectId: ticket.project.id, TaskId: ticket.taskId, Date: date, Hours: hours, Remark: remark }],
      TimesheetStatus: 'New',
      WeekStartDate: date,
      SubmitterId: null,
      StatusUpdaterId: pmsContext.userId,
      Notes: ' ',
      IsRequestFromLogTime: true,
      WkTimesUpdatedAt: ''
    })
  });
  const responseText = await res.text();
  let data = null;
  try { data = JSON.parse(responseText); } catch (e) {}
  if (!res.ok) {
    const detail = data?.Message || data?.title || (data?.errors ? JSON.stringify(data.errors) : responseText);
    throw new Error(`PMS rejected the time entry (HTTP ${res.status})${detail ? `: ${detail}` : '.'}`);
  }
  if (!data) throw new Error('PMS returned an invalid timesheet response.');
  assertPmsResponse(data);
}

async function logSelectedWorklogsInPms() {
  const selected = jiraWorklogEntries.filter(entry => entry.checkbox.checked && !entry.checkbox.disabled);
  if (!selected.length || jiraWorklogLogging) return;
  if (!pmsReady || !pmsContext?.token) {
    setStatusTone(jiraWorklogMessage, 'error');
    jiraWorklogMessage.textContent = 'PMS is not connected. Wait for the Create tab to finish loading PMS, then try again.';
    return;
  }
  jiraWorklogLogging = true;
  jiraWorklogLoadBtn.disabled = true;
  for (const entry of jiraWorklogEntries) entry.checkbox.disabled = true;
  updateJiraWorklogSelection();
  const ticketLookups = new Map();
  let logged = 0;
  try {
    for (const [index, entry] of selected.entries()) {
      setStatusTone(jiraWorklogMessage, 'muted');
      jiraWorklogMessage.textContent = `Logging ${index + 1} of ${selected.length} entries in PMS...`;
      setPmsLogResult(entry, 'muted', 'Logging...');
      try {
        const seconds = Number(entry.worklog.timeSpentSeconds);
        const hours = Number((seconds / 3600).toFixed(2));
        if (!Number.isFinite(hours) || hours <= 0) throw new Error('Worklog has no time to log.');
        const key = entry.issue.key.toUpperCase();
        if (!ticketLookups.has(key)) ticketLookups.set(key, findPmsTicketsByJiraKey(key));
        const tickets = await ticketLookups.get(key);
        if (!tickets.length) throw new Error(`No PMS ticket found for ${key}.`);
        if (tickets.length > 1) throw new Error(`Multiple PMS tickets found for ${key} (${tickets.map(ticket => `#${ticket.taskId}`).join(', ')}). Log it manually.`);
        await addPmsTimeEntry(tickets[0], entry.worklogDate, hours, jiraCommentText(entry.worklog.comment).trim());
        entry.logged = true;
        entry.checkbox.checked = false;
        setPmsLogResult(entry, 'success', `✓ Logged ${hours}h to #${tickets[0].taskId}`);
        logged++;
      } catch (error) {
        setPmsLogResult(entry, 'error', error.message || 'Could not log this entry.');
      }
    }
  } finally {
    jiraWorklogLogging = false;
    jiraWorklogLoadBtn.disabled = false;
    for (const entry of jiraWorklogEntries) entry.checkbox.disabled = Boolean(entry.logged);
    updateJiraWorklogSelection();
  }
  const failed = selected.length - logged;
  setStatusTone(jiraWorklogMessage, failed ? 'error' : 'success');
  jiraWorklogMessage.textContent = failed
    ? `Logged ${logged} of ${selected.length} entries in PMS. ${failed} failed; see the PMS column.`
    : `✓ Logged ${logged} entr${logged === 1 ? 'y' : 'ies'} in PMS.`;
}

jiraWorklogLogBtn.addEventListener('click', logSelectedWorklogsInPms);

const closeEditInputs = [closeDueDate, closeActualEndDate, closeEstimatedHours, closeDoneRatio];

function setCloseMessage(tone, message, ticketId = null) {
  setStatusTone(closeStatus, tone);
  setTextWithTicketLink(closeStatus, message, ticketId);
}

function updateCloseFormState() {
  const ready = Boolean(closeTicketData) && !closeSubmitting;
  closeEditInputs.forEach(input => { input.disabled = !ready; });
  closeSpentHours.disabled = !closeTicketData;
  closeRefreshBtn.disabled = closeSubmitting || closeListLoading;
  closeTicketSelect.disabled = closeSubmitting || closeListLoading || !closeTickets.length;
  closeFetchBtn.disabled = closeSubmitting;
  closeJiraKey.disabled = closeSubmitting;
  closeSourceList.disabled = closeSubmitting;
  closeSourceJira.disabled = closeSubmitting;
  closeSubmitBtn.disabled = !ready;
  projectSelect.disabled = submitting || submissionLocked || closeSubmitting || !pmsProjects.length;
}

function isCloseListMode() {
  return closeSourceList.checked;
}

function showCloseTicket(ticket) {
  if (!ticket) {
    closeTicket.textContent = '\u2014';
    return;
  }
  const link = document.createElement('a');
  link.className = 'ticket-link';
  link.href = `https://sap-pms.einfochips.com/issues/${encodeURIComponent(ticket.taskId)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = `#${ticket.taskId}`;
  const subject = document.createElement('span');
  subject.className = 'pms-subject';
  subject.textContent = ticket.subject || '';
  subject.title = ticket.subject || '';
  closeTicket.replaceChildren(link, subject);
}

function resetCloseForm() {
  closeTicketData = null;
  for (const input of [closeDueDate, closeActualEndDate, closeEstimatedHours, closeSpentHours]) input.value = '';
  closeDoneRatio.value = '100';
  showCloseTicket(null);
  closeCurrentStatus.textContent = '\u2014';
  updateCloseFormState();
}

async function fetchPmsTicketForEdit(ticket) {
  const url = new URL(`${PMS_API_BASE}/Project/Ticket/EditTicket`);
  url.searchParams.set('UserID', String(pmsContext.userId));
  url.searchParams.set('TicketID', String(ticket.taskId));
  url.searchParams.set('isViewOnly', 'true');
  const res = await fetch(url, {
    headers: {
      authorization: pmsContext.token,
      projectidentifier: ticket.project.identifier,
      accept: 'application/json, text/plain, */*'
    }
  });
  if (!res.ok) throw new Error(`Could not load PMS ticket #${ticket.taskId} (HTTP ${res.status}).`);
  let data;
  try { data = await res.json(); } catch (e) { throw new Error(`PMS returned invalid data for ticket #${ticket.taskId}.`); }
  assertPmsResponse(data);
  const issue = data?.Data?.Issue;
  if (!issue || Number(issue.id) !== ticket.taskId) throw new Error(`PMS did not return details for ticket #${ticket.taskId}.`);
  const statusData = data.Data.IssueStatus?.Data;
  const statusMatch = (Array.isArray(statusData) ? statusData : [statusData]).find(status => status && String(status.id ?? status.Id) === String(issue.status_id));
  return { issue, hours: data.Data.HoursDetails || issue.HoursDetails || null, statusName: statusMatch?.name ?? statusMatch?.Name ?? '' };
}

function renderCloseTicketOptions(selectedId = '') {
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = closeTickets.length ? '-- Select a ticket --' : '-- No open tickets --';
  const options = closeTickets.map(ticket => {
    const option = document.createElement('option');
    option.value = String(ticket.taskId);
    const subject = ticket.subject.replace(/\s+/g, ' ').trim();
    option.textContent = `#${ticket.taskId} \u00b7 ${subject.length > 60 ? `${subject.slice(0, 60)}\u2026` : subject}`;
    option.title = `${ticket.project.name}: ${subject}`;
    return option;
  });
  closeTicketSelect.replaceChildren(placeholder, ...options);
  closeTicketSelect.value = closeTickets.some(ticket => String(ticket.taskId) === String(selectedId)) ? String(selectedId) : '';
}

async function loadCloseTickets() {
  const listLoadId = ++closeListLoadId;
  const previousId = closeTicketSelect.value;
  const listMode = isCloseListMode();
  const showListMessage = (tone, message) => { if (isCloseListMode()) setCloseMessage(tone, message); };
  closeListLoading = true;
  if (listMode) {
    closeLoadId++;
    resetCloseForm();
  } else {
    updateCloseFormState();
  }
  try {
    const project = getSelectedPmsProject();
    if (!project) throw new Error('Select a PMS project at the top to load tickets.');
    if (!pmsReady || !pmsContext?.token) throw new Error('PMS is not connected. Wait for PMS to finish loading, then refresh.');
    const tickets = [];
    showListMessage('muted', `Loading your open PMS tickets for ${project.name}...`);
    const projectIssues = await fetchAssignedPmsTickets(project, pmsContext.userId);
    if (listLoadId !== closeListLoadId) return;
    for (const issue of projectIssues) {
      const assignedId = issue.assigned_to_id?.Id ?? issue.assigned_to_id?.id ?? issue.assigned_to_id;
      const taskId = Number(issue.id);
      if ((assignedId != null && String(assignedId) !== String(pmsContext.userId)) || isPmsIssueClosed(issue) || !Number.isSafeInteger(taskId) || taskId <= 0) continue;
      tickets.push({ taskId, project, subject: String(issue.subject || ''), status: issue.status_id?.Name ?? issue.status_id?.name ?? '' });
    }
    closeTickets = Array.from(new Map(tickets.map(ticket => [ticket.taskId, ticket])).values()).sort((a, b) => b.taskId - a.taskId);
    renderCloseTicketOptions(previousId);
    showListMessage('muted', closeTickets.length ? `${closeTickets.length} open PMS ticket${closeTickets.length === 1 ? '' : 's'} assigned to you in ${project.name}. Select one to close.` : `No open PMS tickets are assigned to you in ${project.name}.`);
  } catch (error) {
    if (listLoadId !== closeListLoadId) return;
    closeTickets = [];
    renderCloseTicketOptions();
    closeTicketSelect.firstElementChild.textContent = '-- Unavailable --';
    showListMessage('error', error.message || 'Could not load PMS tickets.');
  } finally {
    if (listLoadId === closeListLoadId) {
      closeListLoading = false;
      updateCloseFormState();
    }
  }
  if (listLoadId === closeListLoadId && isCloseListMode() && closeTicketSelect.value) await loadSelectedCloseTicket();
}

async function loadCloseTicketDetails(ticket, loadId) {
  setCloseMessage('muted', `Loading PMS ticket #${ticket.taskId}...`);
  const { issue, hours, statusName } = await fetchPmsTicketForEdit(ticket);
  if (loadId !== closeLoadId) return;
  closeTicketData = { ticket, issue };
  showCloseTicket({ ...ticket, subject: issue.subject || ticket.subject });
  const metadataStatus = pmsMetadata?.IssueStatus?.Data?.find(status => String(status.Id) === String(issue.status_id));
  closeCurrentStatus.textContent = statusName || ticket.status || metadataStatus?.Name || (issue.status_id != null ? `Status ID ${issue.status_id}` : 'Unknown');
  closeDueDate.value = toYYYYMMDD(issue.due_date);
  closeActualEndDate.value = toYYYYMMDD(issue.actual_end_date) || formatLocalDate(new Date());
  const estimated = Number(issue.estimated_hours);
  closeEstimatedHours.value = Number.isFinite(estimated) ? String(estimated) : '';
  const spent = [hours?.TotalSpentTime, hours?.SpentTime, issue.spent_hours].find(value => value !== null && value !== undefined && value !== '');
  closeSpentHours.value = spent === undefined ? '\u2014' : String(spent);
  closeDoneRatio.value = '100';
  setCloseMessage('success', `\u2713 Loaded PMS ticket #${ticket.taskId}. Review the values, then close it.`);
}

async function fetchCloseTicketByJiraKey() {
  const key = closeJiraKey.value.trim().toUpperCase();
  closeJiraKey.value = key;
  const loadId = ++closeLoadId;
  resetCloseForm();
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) {
    setCloseMessage('error', 'Enter a valid Jira issue key, e.g. PROJ-1234.');
    return;
  }
  if (!pmsReady || !pmsContext?.token) {
    setCloseMessage('error', 'PMS is not connected. Wait for PMS to finish loading, then try again.');
    return;
  }
  const project = getSelectedPmsProject();
  if (!project) {
    setCloseMessage('error', 'Select a PMS project at the top before finding a ticket.');
    return;
  }
  closeFetchBtn.disabled = true;
  setCloseMessage('muted', `Finding the PMS ticket for ${key}...`);
  try {
    const tickets = await findPmsTicketsByJiraKey(key, [project]);
    if (loadId !== closeLoadId) return;
    if (!tickets.length) throw new Error(`No PMS ticket found for ${key} in ${project.name}.`);
    if (tickets.length > 1) throw new Error(`Multiple PMS tickets found for ${key} (${tickets.map(ticket => `#${ticket.taskId}`).join(', ')}). Use the PMS ticket list instead.`);
    await loadCloseTicketDetails(tickets[0], loadId);
  } catch (error) {
    if (loadId !== closeLoadId) return;
    resetCloseForm();
    setCloseMessage('error', error.message || 'Could not load the PMS ticket.');
  } finally {
    if (loadId === closeLoadId) updateCloseFormState();
  }
}

function setCloseSource() {
  const listMode = isCloseListMode();
  closeListSource.hidden = !listMode;
  closeJiraSource.hidden = listMode;
  closeLoadId++;
  resetCloseForm();
  if (!listMode) {
    setCloseMessage('muted', 'Enter a Jira key and click Fetch.');
    closeJiraKey.focus();
  } else if (closeListLoading) {
    setCloseMessage('muted', 'Loading your open PMS tickets...');
  } else if (closeTicketSelect.value) {
    loadSelectedCloseTicket();
  } else {
    setCloseMessage('muted', closeTickets.length ? 'Select a PMS ticket to close.' : 'No open PMS tickets are assigned to you. Use Refresh to reload the list.');
  }
}

async function loadSelectedCloseTicket() {
  const loadId = ++closeLoadId;
  resetCloseForm();
  const ticket = closeTickets.find(item => String(item.taskId) === closeTicketSelect.value);
  if (!ticket) {
    if (closeTickets.length) setCloseMessage('muted', 'Select a PMS ticket to close.');
    return;
  }
  setCloseMessage('muted', `Loading PMS ticket #${ticket.taskId}...`);
  try {
    await loadCloseTicketDetails(ticket, loadId);
  } catch (error) {
    if (loadId !== closeLoadId) return;
    resetCloseForm();
    setCloseMessage('error', error.message || 'Could not load the PMS ticket.');
  } finally {
    if (loadId === closeLoadId) updateCloseFormState();
  }
}

function readCloseValues() {
  const values = {};
  for (const [field, input, label, required] of [
    ['due_date', closeDueDate, 'Due date', false],
    ['actual_end_date', closeActualEndDate, 'Actual end date', true]
  ]) {
    const parsed = toYYYYMMDD(input.value);
    if (input.validity.badInput || (input.value && !parsed)) throw new Error(`${label} must be a valid date.`);
    if (required && !parsed) throw new Error(`${label} is required.`);
    values[field] = parsed || null;
  }
  const startDate = toYYYYMMDD(closeTicketData.issue.actual_start_date) || toYYYYMMDD(closeTicketData.issue.start_date);
  if (startDate && values.actual_end_date < startDate) throw new Error(`Actual end date cannot be earlier than the start date (${startDate}).`);
  const estimated = Number(closeEstimatedHours.value || '0');
  if (closeEstimatedHours.validity.badInput || !Number.isFinite(estimated) || estimated < 0) throw new Error('Estimated time must be a nonnegative number.');
  const doneRatio = Number(closeDoneRatio.value);
  if (!Number.isInteger(doneRatio) || doneRatio < 0 || doneRatio > 100 || doneRatio % 10 !== 0) throw new Error('Done % must be 0 to 100 in steps of 10.');
  values.estimated_hours = estimated;
  values.done_ratio = String(doneRatio);
  return values;
}

async function submitCloseTicket() {
  if (!closeTicketData || closeSubmitting) return;
  if (closeTicketData.ticket.project.id !== getSelectedPmsProject()?.id) {
    setCloseMessage('error', 'The loaded ticket is not in the selected project. Fetch the ticket again.');
    return;
  }
  let values;
  try {
    values = readCloseValues();
  } catch (error) {
    setCloseMessage('error', error.message);
    return;
  }
  const { ticket, issue } = closeTicketData;
  // Send back every loaded field so PMS doesn't clear values the form doesn't show.
  const payload = {
    ...issue,
    identifier: issue.identifier ?? '',
    assigned_to_name: issue.assigned_to_name ?? '',
    author_name: issue.author_name ?? '',
    product_id: issue.product_id ?? '',
    start_date: toYYYYMMDD(issue.start_date) || null,
    actual_start_date: toYYYYMMDD(issue.actual_start_date) || null,
    ...values,
    status_id: PMS_CLOSED_STATUS_ID,
    is_delete: false,
    notes: null,
    UserID: pmsContext.userId,
    attachmentID: [],
    CustomValues: Array.isArray(issue.CustomValues) ? issue.CustomValues : [],
    Watchers: Array.isArray(issue.Watchers) ? issue.Watchers : [],
    WatchersList: [],
    HoursDetails: { TotalEstimatedHours: null, TotalSpentTime: null, SpentTime: null },
    CustomFields: [],
    Products: []
  };
  closeSubmitting = true;
  updateCloseFormState();
  closeSubmitBtn.textContent = 'Closing ticket...';
  setCloseMessage('muted', `Closing PMS ticket #${ticket.taskId}...`);
  try {
    const res = await fetch(`${PMS_API_BASE}/Project/Ticket/BulkPostTicket`, {
      method: 'POST',
      headers: {
        authorization: pmsContext.token,
        projectidentifier: ticket.project.identifier,
        'content-type': 'application/json',
        accept: 'application/json, text/plain, */*'
      },
      body: JSON.stringify([payload])
    });
    const responseText = await res.text();
    let data = null;
    try { data = JSON.parse(responseText); } catch (e) {}
    if (!res.ok) {
      const detail = data?.Message || data?.title || (data?.errors ? Object.values(data.errors).flat().join(' ') : responseText);
      throw new Error(`PMS rejected the update (HTTP ${res.status})${detail ? `: ${detail}` : '.'}`);
    }
    if (!data) throw new Error('PMS returned an invalid response. Check the ticket in PMS before retrying.');
    assertPmsResponse(data);
    const result = Array.isArray(data.Data) && data.Data.length === 1 ? data.Data[0] : null;
    const resultStatus = Number(result?.Status);
    if (!result || resultStatus < 200 || resultStatus >= 300) {
      throw new Error(result?.Message || data.Message || 'PMS did not confirm the update. Check the ticket in PMS before retrying.');
    }
    const updated = Array.isArray(result.Data) ? result.Data.find(item => Number(item?.id) === ticket.taskId) : null;
    if (!updated) throw new Error('PMS did not confirm this ticket was updated. Check the ticket in PMS before retrying.');
    closeTicketData = null;
    closeTickets = closeTickets.filter(item => item.taskId !== ticket.taskId);
    renderCloseTicketOptions();
    showCloseTicket(null);
    updateCloseFormState();
    setCloseMessage('success', `\u2713 ${updated.message || result.Message || 'Ticket updated successfully.'} PMS ticket #${ticket.taskId} is closed.`, ticket.taskId);
  } catch (error) {
    setCloseMessage('error', error.message || 'Could not close the PMS ticket.');
  } finally {
    closeSubmitting = false;
    closeSubmitBtn.textContent = 'Close Ticket in PMS';
    updateCloseFormState();
  }
}

closeRefreshBtn.addEventListener('click', loadCloseTickets);
closeTicketSelect.addEventListener('change', loadSelectedCloseTicket);
closeSourceList.addEventListener('change', setCloseSource);
closeSourceJira.addEventListener('change', setCloseSource);
closeFetchBtn.addEventListener('click', fetchCloseTicketByJiraKey);
closeJiraKey.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    closeFetchBtn.click();
  }
});
closeSubmitBtn.addEventListener('click', submitCloseTicket);

function pmsFieldSelects() {
  return [ownerSelect, versionSelect, categorySelect, taskStatusSelect];
}

function updateFormState() {
  const locked = submitting || submissionLocked;
  submitBtn.disabled = locked || !pmsReady || jiraLoading || jiraFailed;
  projectSelect.disabled = locked || closeSubmitting || !pmsProjects.length;
  jiraKeyInput.disabled = locked;
  fetchBtn.disabled = locked;
  for (const input of [subjectInput, startDateInput, actualStartDateInput, dueDateInput, hoursInput]) {
    input.disabled = locked || jiraLoading;
  }
  for (const select of pmsFieldSelects()) {
    select.disabled = locked || !pmsReady;
  }
}

function setTextWithTicketLink(element, message, ticketId) {
  const ticketText = ticketId ? `#${ticketId}` : '';
  const ticketIndex = ticketText ? message.indexOf(ticketText) : -1;
  if (ticketIndex < 0) {
    element.textContent = message;
    return;
  }
  const ticketLink = document.createElement('a');
  ticketLink.className = 'ticket-link';
  ticketLink.href = `https://sap-pms.einfochips.com/issues/${encodeURIComponent(ticketId)}`;
  ticketLink.target = '_blank';
  ticketLink.rel = 'noopener noreferrer';
  ticketLink.textContent = ticketText;
  element.replaceChildren(message.slice(0, ticketIndex), ticketLink, message.slice(ticketIndex + ticketText.length));
}

function showSubmissionError(message, lock = false, ticketId = null) {
  submitting = false;
  submissionLocked = lock;
  setStatusTone(statusDiv, 'error');
  setTextWithTicketLink(statusDiv, message, ticketId);
  submitBtn.innerText = lock ? 'Check PMS Before Retrying' : 'Create Task in PMS';
  updateFormState();
}

function readTaskDates() {
  const dates = {};
  for (const [field, input, label] of [
    ['start_date', startDateInput, 'Start date'],
    ['actual_start_date', actualStartDateInput, 'Actual start date'],
    ['due_date', dueDateInput, 'Due date']
  ]) {
    const raw = input.value.trim();
    const parsed = toYYYYMMDD(raw);
    if (input.validity.badInput || (raw && (!/^\d{4}-\d{2}-\d{2}$|^\d{2}-\d{2}-\d{4}$/.test(raw) || !parsed))) {
      throw new Error(`${label} must be a valid date.`);
    }
    dates[field] = parsed || null;
  }
  dates.actual_start_date ||= dates.start_date;
  if (dates.due_date && [dates.start_date, dates.actual_start_date].some(date => date && date > dates.due_date)) {
    throw new Error('Due date cannot be earlier than the start date or actual start date.');
  }
  return dates;
}

function assertPmsResponse(data) {
  if (!data || typeof data !== 'object') return;
  const status = data.Status;
  const numericStatus = Number(status);
  const failedStatus = status === false || (status !== undefined && status !== null && status !== true && (!Number.isFinite(numericStatus) || numericStatus < 200 || numericStatus >= 300));
  if (failedStatus || (data.Type !== undefined && Number(data.Type) !== 0) || data.errors) {
    throw new Error(typeof data.Message === 'string' && data.Message ? data.Message : 'PMS reported an application-level error.');
  }
}

async function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function selectedPmsId(select, label, optional = false) {
  if (optional && !select.value) return null;
  const id = Number(select.value);
  if (!select.value || !Number.isSafeInteger(id) || id <= 0 || !Array.from(select.options).some(option => option.value === select.value && !option.disabled)) {
    throw new Error(`Select a valid ${label}.`);
  }
  return id;
}

function resolvePmsWorkflow(metadata) {
  const trackers = metadata?.Trackers?.Data;
  const statuses = metadata?.IssueStatus?.Data;
  const priorities = metadata?.IssuePriorityList?.Data;
  if (!Array.isArray(trackers) || !Array.isArray(statuses) || !Array.isArray(priorities)) {
    throw new Error('PMS did not return tracker, status, and priority metadata. Cannot safely create a ticket.');
  }
  const tracker = trackers.find(item => getPmsOptionLabel(item).toLowerCase() === 'development');
  if (!tracker) throw new Error('This project has no Development tracker. Cannot create a ticket.');
  const defaultId = tracker.default_status?.Id ?? tracker.default_status?.id ?? tracker.default_status;
  const priority = priorities.find(item => item.is_default === true || item.is_default === 1);
  const workflow = { tracker_id: Number(tracker.Id), default_status_id: Number(defaultId), priority_id: Number(priority?.id ?? priority?.Id) };
  if (!Object.values(workflow).every(id => Number.isSafeInteger(id) && id > 0) || !statuses.some(item => Number(item.Id) === workflow.default_status_id)) {
    throw new Error('This project is missing a valid Development default status or default priority. Cannot create a ticket.');
  }
  return Object.freeze(workflow);
}

function getInitialPmsStatuses(metadata, trackerId, defaultStatusId) {
  const statuses = metadata?.IssueStatus?.Data;
  if (!Array.isArray(statuses)) return [];
  const transitions = metadata?.WorkflowTransitions?.Data;
  const allowedIds = Array.isArray(transitions)
    ? transitions.filter(item => Number(item.TrackerID) === trackerId && Number(item.OldStatusID) === 0).map(item => Number(item.NewStatusID))
    : [];
  allowedIds.push(defaultStatusId);
  return statuses.filter(item => allowedIds.includes(Number(item.Id)));
}

function getRequiredDonePercentField(metadata, trackerId, statusId) {
  const workflow = metadata?.WorkflowFields?.Data;
  const fields = metadata?.FieldsData?.Data;
  if (!Array.isArray(workflow)) return null;
  for (const entry of workflow) {
    if (Number(entry.TrackerID) !== trackerId || Number(entry.StatusID) !== statusId || !Array.isArray(entry.FieldStaus?.required)) continue;
    for (const key of entry.FieldStaus.required) {
      const field = Array.isArray(fields) ? fields.find(item => item.ColumnName === String(key) || String(item.FieldsBit) === String(key)) : null;
      const names = [field?.DisplayName, field?.ColumnName, key].filter(value => value != null).map(value => String(value).toLowerCase().replace(/[^a-z0-9]/g, ''));
      if (names.some(name => name === 'done' || name.startsWith('doneratio') || name.startsWith('donepercent') || name.startsWith('donepercentage'))) {
        return { column: field?.ColumnName || 'done_ratio', label: field?.DisplayName || 'Done %' };
      }
    }
  }
  return null;
}

function validateProjectWorkflow(payload) {
  const workflow = pmsMetadata?.WorkflowFields?.Data;
  const fields = pmsMetadata?.FieldsData?.Data;
  const donePercentField = getRequiredDonePercentField(pmsMetadata, payload.tracker_id, payload.status_id);
  for (const entry of Array.isArray(workflow) ? workflow : []) {
    if (Number(entry.TrackerID) !== payload.tracker_id || Number(entry.StatusID) !== payload.status_id) continue;
    const required = entry.FieldStaus?.required;
    if (required == null) continue;
    if (!Array.isArray(required)) throw new Error('Unsupported PMS workflow requirements. Create this ticket in PMS.');
    for (const key of required) {
      const field = Array.isArray(fields) ? fields.find(item => item.ColumnName === String(key) || String(item.FieldsBit) === String(key)) : null;
      const isDonePercent = donePercentField && (field?.ColumnName === donePercentField.column || String(key) === donePercentField.label);
      const column = isDonePercent ? donePercentField.column : field?.ColumnName ?? String(key);
      if (!Object.hasOwn(payload, column)) {
        throw new Error(`Workflow requires an unsupported field: ${field?.DisplayName || column}. Create this ticket in PMS.`);
      }
      if (payload[column] === null || payload[column] === '' || (Array.isArray(payload[column]) && !payload[column].length)) {
        throw new Error(`Workflow requires ${field?.DisplayName || column}.`);
      }
    }
  }
}

// 1. Fetch Jira Ticket Details via API
function jiraResponseError(res, key, responseText) {
  const responseUrl = res.url || '';
  const isLoginUrl = /\/(?:login(?:\.jspa)?|sso|oauth)(?:\/|$|\?)/i.test(responseUrl);
  const isLoginHtml = /text\/html/i.test(res.headers.get('content-type') || '') && (
    /<input[^>]+type=["']?password/i.test(responseText) ||
    /login\.jspa|single sign-on|sign in to jira|log in to jira/i.test(responseText)
  );
  if ((res.redirected && isLoginUrl) || isLoginHtml) {
    return 'Your Jira session is not logged in or has expired. Sign in to Jira in a browser tab, then fetch the issue again.';
  }
  if (res.status === 401) return 'Jira rejected the request because you are not logged in or your session has expired. Sign in to Jira and retry.';
  if (res.status === 403) return `Your Jira account cannot access ${key}. Sign in with an account that has permission, or ask the project administrator for access.`;
  if (res.status === 404) return `Jira returned 404 for ${key}. Your session may have expired, or the issue may not exist or be visible to your account. Sign in to Jira, then check the issue key and project access.`;

  let detail = '';
  try {
    const error = JSON.parse(responseText);
    const messages = Array.isArray(error.errorMessages) ? error.errorMessages : [];
    const fieldErrors = error.errors && typeof error.errors === 'object' ? Object.values(error.errors).flat() : [];
    detail = [...messages, ...fieldErrors].filter(message => typeof message === 'string').join(' ');
  } catch (e) {}
  return `Jira API request failed (${res.status}).${detail ? ` ${detail}` : ''}`;
}

async function fetchJiraDetails(key) {
  if (!key || submitting || submissionLocked) return;
  const loadId = ++jiraLoadId;
  jiraLoading = true;
  jiraFailed = false;
  for (const input of [subjectInput, startDateInput, actualStartDateInput, dueDateInput, hoursInput]) input.value = '';
  updateFormState();
  setStatusTone(statusDiv, 'muted');
  statusDiv.innerText = `Fetching Jira ${key}...`;

  try {
    const res = await fetch(`${jiraBaseUrl}/rest/api/2/issue/${encodeURIComponent(key)}?fields=summary,created,duedate,timetracking,timeoriginalestimate,startdate,customfield_10015`, { credentials: 'include' });
    if (loadId !== jiraLoadId) return;
    const responseText = await res.text();
    const contentType = res.headers.get('content-type') || '';
    const responseUrl = res.url || '';
    if ((res.redirected && /\/(?:login(?:\.jspa)?|sso|oauth)(?:\/|$|\?)/i.test(responseUrl)) ||
        (/text\/html/i.test(contentType) && /<input[^>]+type=["']?password|login\.jspa|single sign-on|sign in to jira|log in to jira/i.test(responseText))) {
      throw new Error('Your Jira session is not logged in or has expired. Sign in to Jira in a browser tab, then fetch the issue again.');
    }
    if (!res.ok) {
      throw new Error(jiraResponseError(res, key, responseText));
    }
    let json;
    try {
      json = JSON.parse(responseText);
    } catch (e) {
      throw new Error('Jira returned an unexpected response. Your session may have expired; sign in to Jira and retry.');
    }
    if (loadId !== jiraLoadId) return;
    const f = json.fields || {};
    if (typeof f.summary !== 'string' || !f.summary.trim()) throw new Error('Jira returned no issue summary. Fetch a valid Jira issue.');

    subjectInput.value = `${key} : ${f.summary || ''}`;
    const explicitStart = toYYYYMMDD(f.startdate || f.customfield_10015);
    const createdDate = toYYYYMMDD(f.created);
    const finalStart = explicitStart || createdDate;

    startDateInput.value = finalStart;
    actualStartDateInput.value = finalStart;
    dueDateInput.value = toYYYYMMDD(f.duedate);

    const estSec = f.timetracking?.originalEstimateSeconds ?? f.timeoriginalestimate ?? null;
    const estStr = f.timetracking?.originalEstimate || null;
    hoursInput.value = calcHours(estSec, estStr);

    setStatusTone(statusDiv, 'success');
    statusDiv.innerText = `✓ Details loaded for ${key}`;
  } catch (err) {
    if (loadId !== jiraLoadId) return;
    jiraFailed = true;
    setStatusTone(statusDiv, 'error');
    statusDiv.innerText = err.message || 'Network error fetching Jira details.';
  } finally {
    if (loadId === jiraLoadId) {
      jiraLoading = false;
      updateFormState();
    }
  }
}

// 2. Read Token & Project Metadata from the PMS Tab
async function getPmsAuthContext() {
  setStatusTone(pmsStatusDiv, 'muted');
  pmsStatusDiv.innerText = 'Looking for an open PMS tab...';
  const tabs = await withTimeout(chrome.tabs.query({}), 5000, 'Timed out looking for a PMS tab. Reopen the PMS page and retry.');
  const pmsTabs = tabs.filter(tab => tab.url && tab.url.includes('sap-pms.einfochips.com'));
  if (!pmsTabs.length) {
    setStatusTone(pmsStatusDiv, 'error');
    pmsStatusDiv.innerText = 'PMS tab not open. Open PMS in any tab.';
    return null;
  }

  const candidates = pmsTabs.sort((left, right) => {
    if ((left.status === 'complete') !== (right.status === 'complete')) return left.status === 'complete' ? -1 : 1;
    if (Boolean(left.active) !== Boolean(right.active)) return left.active ? -1 : 1;
    return (right.lastAccessed || 0) - (left.lastAccessed || 0);
  }).slice(0, 4);
  let lastError = null;
  let attempted = 0;

  for (const pmsTab of candidates) {
    if (pmsTab.status === 'loading') continue;
    attempted++;
    pmsStatusDiv.innerText = `Reading login session from PMS tab ${attempted} of ${candidates.length}...`;
    try {
      const [result] = await withTimeout(chrome.scripting.executeScript({
        target: { tabId: pmsTab.id },
        func: () => {
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
      }), 2500, 'Timed out reading this PMS tab.');
      if (result?.result?.token) return result.result;
      lastError = new Error('No PMS login token was found in this tab.');
    } catch (error) {
      lastError = error;
    }
  }

  if (!attempted) throw new Error('All PMS tabs are still loading. Wait until a PMS page finishes loading, then retry.');
  throw new Error(`Could not read a PMS session from ${attempted} loaded tab(s). ${lastError?.message || 'No accessible PMS session was found.'} Check extension Site access for https://sap-pms.einfochips.com.`);
}

// Helper to populate select elements
function getPmsOptionLabel(value, depth = 0) {
  if (typeof value === 'string') {
    const label = value.trim();
    return label === '[object Object]' ? '' : label;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth >= 5) return '';

  for (const key of ['Name', 'name', 'UserDisplayName', 'DisplayName', 'displayName', 'FullName', 'fullName', 'VersionName', 'CategoryName', 'UserName', 'Label', 'label', 'Text', 'text']) {
    const label = getPmsOptionLabel(value[key], depth + 1);
    if (label) return label;
  }

  const firstName = value.FirstName ?? value.firstName ?? value.first_name ?? value.firstname;
  const lastName = value.LastName ?? value.lastName ?? value.last_name ?? value.lastname;
  const personName = [firstName, lastName].filter(part => typeof part === 'string' && part.trim()).map(part => part.trim()).join(' ');
  return personName || getPmsOptionLabel(value.User, depth + 1);
}

function populateOptions(selectEl, list, defaultSelectedId, emptyLabel = '-- Select --') {
  selectEl.innerHTML = `<option value="">${emptyLabel}</option>`;
  if (!Array.isArray(list)) return;

  list.forEach(item => {
    if (!item || typeof item !== 'object') return;
    const id = item.Id ?? item.id ?? item.UserId ?? item.UserID ?? item.user_id ?? item.VersionId ?? item.VersionID ?? item.CategoryId ?? item.CategoryID ?? item.User?.Id ?? item.User?.id ?? item.User?.UserId ?? item.User?.UserID ?? item.MemberId;
    const name = getPmsOptionLabel(item);
    if (((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isFinite(id))) && name) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      if (String(id) === String(defaultSelectedId)) {
        opt.selected = true;
      }
      selectEl.appendChild(opt);
    }
  });
}

function findPmsArray(data, keywords) {
  const pending = [{ value: data, path: '' }];
  for (let index = 0; index < pending.length; index++) {
    const { value, path } = pending[index];
    if (!value || typeof value !== 'object') continue;
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (Array.isArray(child) && keywords.some(keyword => childPath.toLowerCase().includes(keyword))) {
        return child;
      }
      if (child && typeof child === 'object') {
        pending.push({ value: child, path: childPath });
      }
    }
  }
  return [];
}

function describePmsResponse(data) {
  const summary = {
    rootType: data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data,
    topLevelKeys: data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : [],
    arrays: []
  };
  const pending = [{ value: data, path: '$', depth: 0 }];
  for (let index = 0; index < pending.length && index < 200; index++) {
    const { value, path, depth } = pending[index];
    if (!value || typeof value !== 'object' || depth > 8) continue;
    if (Array.isArray(value)) {
      const sample = value.find(item => item && typeof item === 'object' && !Array.isArray(item));
      summary.arrays.push({ path, count: value.length, itemKeys: sample ? Object.keys(sample) : [] });
      if (sample) pending.push({ value: sample, path: `${path}[]`, depth: depth + 1 });
    } else {
      for (const [key, child] of Object.entries(value)) {
        if (child && typeof child === 'object') {
          pending.push({ value: child, path: `${path}.${key}`, depth: depth + 1 });
        }
      }
    }
  }
  return summary;
}

async function loadPmsProjects() {
  pmsReady = false;
  submitBtn.disabled = true;
  projectSelect.disabled = true;
  setStatusTone(pmsStatusDiv, 'muted');
  pmsStatusDiv.innerText = 'Reading PMS login session...';
  try {
    const hasPmsAccess = await chrome.permissions.contains({ origins: PMS_HOST_ORIGINS });
    if (!hasPmsAccess) {
      setStatusTone(pmsStatusDiv, 'error');
      pmsStatusDiv.innerText = 'Grant access at the top to load your PMS session and projects.';
      return;
    }
    pmsContext = await withTimeout(getPmsAuthContext(), 17000, 'Timed out connecting to PMS. Reload the PMS page and reopen the extension.');
    if (!pmsContext?.token) throw new Error('Open PMS and log in before loading projects.');
    const userId = Number(pmsContext.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new Error('Could not read your PMS user ID from the login token.');
    }
    pmsContext.userId = userId;
    setStatusTone(pmsStatusDiv, 'muted');
    pmsStatusDiv.innerText = 'Loading PMS projects...';

    const projects = [];
    for (let pageNumber = 1; ; pageNumber++) {
      const res = await fetch(`${PMS_API_BASE}/Project/GetProjectsByStatusAndUser`, {
        method: 'POST',
        headers: { authorization: pmsContext.token, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ Status: 1, Userid: userId, Division: '', BU: '', Search: '', PageNumber: pageNumber, PageSize: 10 })
      });
      if (!res.ok) throw new Error(`Failed to load projects (HTTP ${res.status}).`);
      const data = await res.json();
      assertPmsResponse(data);
      const page = data?.Data?.ProjectData;
      const totalCount = Number(data?.Data?.TotalCount);
      if (!Array.isArray(page) || !Number.isSafeInteger(totalCount) || totalCount < 0) {
        throw new Error('Unexpected GetProjectsByStatusAndUser response.');
      }
      projects.push(...page);
      if (projects.length >= totalCount) break;
      if (!page.length || pageNumber >= 1000) throw new Error('PMS returned an incomplete project list.');
    }

    const unique = new Map();
    for (const project of projects) {
      const id = Number(project?.Id);
      const name = getPmsOptionLabel(project);
      const identifier = project?.Identifier;
      if (!Number.isSafeInteger(id) || id <= 0 || !name || typeof identifier !== 'string' || !identifier.trim()) {
        throw new Error('A PMS project is missing its ID, name, or identifier.');
      }
      unique.set(String(id), { id, name, identifier });
    }
    pmsProjects = Array.from(unique.values());
    if (!pmsProjects.length) throw new Error('No active PMS projects are assigned to your user.');
    const storageKey = `pmsLastProject:${userId}`;
    const saved = await chrome.storage.local.get([storageKey]);
    const preferred = [saved[storageKey], pmsContext.projectId].find(id => unique.has(String(id)));
    populateOptions(projectSelect, pmsProjects, preferred ?? (pmsProjects.length === 1 ? pmsProjects[0].id : ''));
    projectSelect.disabled = false;
    await selectPmsProject();
  } catch (err) {
    populateOptions(projectSelect, [], '', '-- Unavailable --');
    setStatusTone(pmsStatusDiv, 'error');
    pmsStatusDiv.innerText = err.message || 'Error loading PMS projects.';
  }
}

async function requestAccess() {
  const jiraOrigin = normalizeJiraUrl(jiraUrlInput.value);
  if (!jiraOrigin) {
    setStatusTone(accessMessage, 'error');
    accessMessage.textContent = 'Enter a valid https Jira URL, for example https://your-company.atlassian.net.';
    return;
  }
  accessBtn.disabled = true;
  try {
    // Request before any other await so the browser keeps the user gesture.
    const granted = await chrome.permissions.request({ origins: accessOrigins(jiraOrigin) });
    if (!granted) {
      setStatusTone(accessMessage, 'error');
      accessMessage.textContent = 'Access was not granted. Allow Jira and PMS access to continue.';
      return;
    }
    await chrome.storage.local.set({ [JIRA_URL_STORAGE_KEY]: jiraOrigin });
    await startApp(jiraOrigin);
  } catch (err) {
    setStatusTone(accessMessage, 'error');
    accessMessage.textContent = `Could not request access: ${err.message}`;
  } finally {
    accessBtn.disabled = false;
  }
}

async function startApp(jiraOrigin) {
  jiraBaseUrl = jiraOrigin;
  jiraUrlInput.value = jiraOrigin;
  setStatusTone(accessMessage, 'success');
  accessMessage.textContent = `✓ Access granted for ${new URL(jiraOrigin).hostname} and PMS.`;
  accessSummaryState.textContent = `✓ ${new URL(jiraOrigin).hostname}`;
  accessBar.open = false;
  setTabsLocked(false);

  try {
    const tabs = await chrome.tabs.query({});
    const jiraTab = tabs.find(t => t.url && t.url.startsWith(jiraBaseUrl) && /browse\/[A-Z][A-Z0-9_]*-\d+/.test(t.url)) ||
                    tabs.find(t => /^\[[A-Z][A-Z0-9_]*-\d+\]/.test(t.title || ''));
    const match = jiraTab?.url?.match(/browse\/([A-Z][A-Z0-9_]*-\d+)/) || jiraTab?.title?.match(/\[([A-Z][A-Z0-9_]*-\d+)\]/);
    if (match) {
      jiraKeyInput.value = match[1];
      fetchJiraDetails(match[1]);
    }
  } catch (e) {
    console.warn(e);
  }

  await loadPmsProjects();
}

function getSelectedPmsProject() {
  return pmsProjects.find(project => project.id === pmsContext?.projectId && project.identifier === pmsContext?.identifier);
}

async function selectPmsProject() {
  const project = pmsProjects.find(item => String(item.id) === projectSelect.value);
  pmsContext = { ...pmsContext, projectId: project?.id ?? null, identifier: project?.identifier ?? null };
  assignmentLoadId++;
  assignmentRows.replaceChildren();
  statusRefreshBtn.disabled = true;
  assignmentMessage.textContent = project ? `Loading project ${project.name}...` : 'Select a PMS project at the top.';
  closeListLoadId++;
  closeLoadId++;
  closeListLoading = false;
  closeTickets = [];
  renderCloseTicketOptions();
  resetCloseForm();
  setCloseMessage('muted', project ? `Loading project ${project.name}...` : 'Select a PMS project at the top.');
  const loading = loadPmsDropdowns();
  const loadId = pmsLoadId;
  await loading;
  if (loadId !== pmsLoadId) return;
  statusRefreshBtn.disabled = false;
  if (project && pmsReady) {
    await chrome.storage.local.set({ [`pmsLastProject:${pmsContext.userId}`]: project.id });
    if (loadId !== pmsLoadId) return;
    await Promise.all([loadAssignedWorkStatus(), loadCloseTickets()]);
  } else if (project) {
    assignmentMessage.textContent = 'Could not load the selected project. See the PMS message above.';
    setCloseMessage('error', 'Could not load the selected project. See the PMS message above.');
  }
}

function pmsSelectionsKey(context) {
  return `pmsSelections:${context.userId}:${context.projectId}`;
}

async function searchJiraIssues(jql, description) {
  const issues = [];
  let nextPageToken = null;
  const pageTokens = new Set();
  const pageSize = 100;
  while (true) {
    if (issues.length >= 5000) throw new Error(`Jira returned more than 5,000 ${description}. Narrow the query before retrying.`);
    const body = {
      jql,
      fields: ['summary', 'status'],
      maxResults: pageSize
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await fetch(`${jiraBaseUrl}/rest/api/3/search/jql`, {
      method: 'POST',
      credentials: 'include',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    if (!res.ok) throw new Error(jiraResponseError(res, description, text));
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('Jira returned an unexpected issue-search response.'); }
    if (!Array.isArray(data.issues) || typeof data.isLast !== 'boolean') {
      throw new Error('Jira issue search did not return a valid issue list.');
    }
    issues.push(...data.issues);
    if (data.isLast) break;
    if (typeof data.nextPageToken !== 'string' || !data.nextPageToken || pageTokens.has(data.nextPageToken)) {
      throw new Error('Jira issue search returned incomplete pagination data.');
    }
    pageTokens.add(data.nextPageToken);
    nextPageToken = data.nextPageToken;
  }
  return issues;
}

async function fetchAssignedJiraIssues() {
  return searchJiraIssues('assignee = currentUser() ORDER BY key ASC', 'your assigned issues');
}

async function fetchJiraIssuesByKeys(keys) {
  const issues = [];
  for (let index = 0; index < keys.length; index += 50) {
    const batch = keys.slice(index, index + 50);
    issues.push(...await searchJiraIssues(`key in (${batch.join(',')}) ORDER BY key ASC`, 'PMS-linked Jira issues'));
  }
  return issues;
}

async function fetchAssignedPmsTickets(project, userId, closed = false) {
  const trackerId = pmsWorkflow?.tracker_id;
  const statuses = pmsMetadata?.IssueStatus?.Data;
  const statusIds = Array.isArray(statuses)
    ? statuses.filter(status => (status.IsClosed === true || status.IsClosed === 1 || String(status.IsClosed).toLowerCase() === 'true') === closed).map(status => status.Id).filter(id => id != null).map(String)
    : [];
  if (closed && Array.isArray(statuses) && !statusIds.length) return [];
  if (!Number.isSafeInteger(trackerId) || !statusIds.length) {
    throw new Error(`PMS did not provide tracker/status filters for ${project.name}. Reload Status after project fields finish loading.`);
  }
  const pageSize = 5000;
  const filters = [
    { ColumnName: 'tracker_id', Condition: '=', ConditionValue: [String(trackerId)], IsCustomField: false, IsMultiple: false, filterTag: 'tracker' },
    { ColumnName: 'project_id', Condition: '=', ConditionValue: [String(project.id)], IsCustomField: false, IsMultiple: false, filterTag: 'project' },
    { ColumnName: 'status_id', Condition: '=', ConditionValue: statusIds, IsCustomField: false, IsMultiple: false, filterTag: 'status', isClosed_for_status_id: closed ? 1 : 0 },
    { ColumnName: 'assigned_to_id', Condition: '=', ConditionValue: [String(userId)], IsCustomField: false, IsMultiple: false, filterTag: 'user' }
  ];
  const res = await fetch(`${PMS_API_BASE}/Project/Issue/IssuesByFilterData`, {
    method: 'POST',
    headers: {
      authorization: pmsContext.token,
      projectidentifier: project.identifier,
      'content-type': 'application/json',
      accept: 'application/json, text/plain, */*'
    },
    body: JSON.stringify({ request: filters, PageNumber: 1, PageSize: pageSize })
  });
  const responseText = await res.text();
  if (!res.ok) {
    let detail = responseText;
    try {
      const error = JSON.parse(responseText);
      if (error.errors && typeof error.errors === 'object') {
        detail = Object.entries(error.errors).map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join('; ') : String(messages)}`).join(' ');
      } else {
        detail = error.Message || error.title || responseText;
      }
    } catch (e) {}
    throw new Error(`PMS assigned-ticket search failed for ${project.name} (HTTP ${res.status}): ${detail}`);
  }
  let data;
  try { data = JSON.parse(responseText); } catch (e) { throw new Error(`PMS returned invalid JSON for assigned tickets in ${project.name}.`); }
  assertPmsResponse(data);
  const issues = data?.Data?.Issues;
  const total = Number(data?.Data?.TotalCount);
  if (!Array.isArray(issues) || !Number.isSafeInteger(total) || total < 0) {
    throw new Error(`PMS returned an unexpected assigned-ticket response for ${project.name}.`);
  }
  if (issues.length < total) {
    throw new Error(`PMS returned ${issues.length} of ${total} assigned tickets for ${project.name} in one request. No additional page requests were sent.`);
  }
  return issues;
}

function getJiraKeys(text) {
  return Array.from(new Set((String(text || '').match(/\b[A-Z][A-Z0-9_]*-\d+\b/gi) || []).map(key => key.toUpperCase())));
}

function isJiraIssueClosed(issue) {
  const status = issue.fields?.status;
  const category = String(status?.statusCategory?.key || status?.statusCategory?.name || '').toLowerCase();
  if (category) return category === 'done';
  return /^(closed|done|resolved|cancelled|canceled)$/i.test(String(status?.name || '').trim());
}

function isPmsIssueClosed(issue) {
  if (typeof issue.isClosed === 'boolean') return issue.isClosed;
  const status = issue.status_id ?? issue.statusId;
  const statusId = status?.Id ?? status?.id ?? status;
  const metadataStatus = pmsMetadata?.IssueStatus?.Data?.find(item => String(item.Id) === String(statusId));
  if (metadataStatus?.IsClosed !== undefined && metadataStatus?.IsClosed !== null) {
    return metadataStatus.IsClosed === true || metadataStatus.IsClosed === 1 || String(metadataStatus.IsClosed).toLowerCase() === 'true';
  }
  const statusName = status?.Name ?? status?.name ?? issue.status ?? status;
  return /^(closed|done|resolved|cancelled|canceled)$/i.test(String(statusName || '').trim());
}

function addStatusCell(row, text) {
  const cell = document.createElement('td');
  cell.textContent = text || '—';
  row.appendChild(cell);
  return cell;
}

function renderAssignedWorkRows(jiraIssues, pmsIssues) {
  const pmsByJiraKey = new Map();
  for (const ticket of pmsIssues) {
    for (const key of getJiraKeys(ticket.subject)) {
      if (!pmsByJiraKey.has(key)) pmsByJiraKey.set(key, []);
      pmsByJiraKey.get(key).push(ticket);
    }
  }

  assignmentRows.replaceChildren();
  let matched = 0;
  let visible = 0;
  for (const jiraIssue of jiraIssues) {
    const key = String(jiraIssue.key || '').toUpperCase();
    const matches = jiraIssue._pmsOnlyTickets || pmsByJiraKey.get(key) || [];
    if (isJiraIssueClosed(jiraIssue) && !matches.some(ticket => !isPmsIssueClosed(ticket))) continue;
    visible++;
    const row = document.createElement('tr');
    const jiraCell = document.createElement('td');
    if (jiraIssue._pmsOnlyTickets) {
      const mark = document.createElement('span');
      mark.className = 'missing-mark';
      mark.setAttribute('role', 'img');
      mark.setAttribute('aria-label', 'No Jira ID in PMS subject');
      mark.title = 'No Jira ID in PMS subject';
      mark.textContent = '\u2718';
      jiraCell.appendChild(mark);
    } else if (jiraIssue._jiraUnavailable) {
      jiraCell.textContent = jiraIssue.key;
    } else {
      const jiraLink = document.createElement('a');
      jiraLink.className = 'ticket-link';
      jiraLink.href = `${jiraBaseUrl}/browse/${encodeURIComponent(jiraIssue.key)}`;
      jiraLink.target = '_blank';
      jiraLink.rel = 'noopener noreferrer';
      jiraLink.textContent = jiraIssue.key;
      jiraCell.appendChild(jiraLink);
      const summary = String(jiraIssue.fields?.summary || '').replace(/\s+/g, ' ').trim();
      if (summary) {
        const preview = document.createElement('span');
        preview.className = 'jira-description';
        preview.textContent = summary.length > 48 ? `${summary.slice(0, 48)}…` : summary;
        preview.title = summary;
        jiraCell.appendChild(preview);
      }
    }
    row.appendChild(jiraCell);

    if (matches.length) {
      matched++;
      const ticketCell = document.createElement('td');
      for (const [index, ticket] of matches.entries()) {
        if (index) ticketCell.appendChild(document.createElement('br'));
        const ticketLink = document.createElement('a');
        ticketLink.className = 'ticket-link';
        ticketLink.href = `https://sap-pms.einfochips.com/issues/${encodeURIComponent(ticket.id)}`;
        ticketLink.target = '_blank';
        ticketLink.rel = 'noopener noreferrer';
        ticketLink.textContent = `#${ticket.id}`;
        ticketCell.appendChild(ticketLink);
        const subject = String(ticket.subject || '').replace(/\s+/g, ' ').trim();
        if (subject) {
          const subjectPreview = document.createElement('span');
          subjectPreview.className = 'pms-subject';
          subjectPreview.textContent = subject.length > 48 ? `${subject.slice(0, 48)}…` : subject;
          subjectPreview.title = subject;
          ticketCell.appendChild(subjectPreview);
        }
      }
      row.appendChild(ticketCell);
      addStatusCell(row, jiraIssue._pmsOnlyTickets ? 'No Jira ID in PMS subject' : jiraIssue._jiraUnavailable ? 'Not found / no access' : jiraIssue.fields?.status?.name);
      addStatusCell(row, matches.map(ticket => ticket.status).filter(Boolean).join(', '));
    } else {
      const missingCell = document.createElement('td');
      const mark = document.createElement('span');
      mark.className = 'missing-mark';
      mark.setAttribute('role', 'img');
      mark.setAttribute('aria-label', 'No matching PMS ticket');
      mark.title = 'No matching PMS ticket found';
      mark.textContent = '\u2718';
      missingCell.appendChild(mark);
      row.appendChild(missingCell);
      addStatusCell(row, jiraIssue.fields?.status?.name);
      const createCell = document.createElement('td');
      const createBtn = document.createElement('button');
      createBtn.type = 'button';
      createBtn.className = 'btn-secondary create-from-status';
      createBtn.textContent = 'Create';
      createBtn.setAttribute('aria-label', `Create PMS task for ${key}`);
      createBtn.addEventListener('click', () => {
        activateTab(createTab);
        jiraKeyInput.value = key;
        fetchJiraDetails(key);
      });
      createCell.appendChild(createBtn);
      row.appendChild(createCell);
    }
    assignmentRows.appendChild(row);
  }
  if (!visible) {
    const row = document.createElement('tr');
    const cell = addStatusCell(row, 'No open or PMS-matched assigned Jira issues.');
    cell.colSpan = 4;
    assignmentRows.appendChild(row);
  }
  return { matched, visible };
}

async function loadAssignedWorkStatus() {
  const loadId = ++assignmentLoadId;
  statusRefreshBtn.disabled = true;
  assignmentMessage.textContent = 'Loading assigned Jira issues...';
  assignmentRows.replaceChildren();
  try {
    const project = getSelectedPmsProject();
    if (!project) throw new Error('Select a PMS project at the top to load assigned tickets.');
    if (!pmsReady || !pmsContext?.token) {
      throw new Error('PMS is still connecting. Wait for the selected project to load, then refresh Status.');
    }
    assignmentMessage.textContent = 'Loading Jira issues assigned to you...';
    const assignedJiraIssues = await fetchAssignedJiraIssues();
    if (loadId !== assignmentLoadId) return;

    const pmsIssuesById = new Map();
    assignmentMessage.textContent = `Loading assigned PMS tickets for ${project.name}...`;
    const projectIssues = await fetchAssignedPmsTickets(project, pmsContext.userId);
    if (loadId !== assignmentLoadId) return;
    projectIssues.push(...await fetchAssignedPmsTickets(project, pmsContext.userId, true));
    if (loadId !== assignmentLoadId) return;
    for (const issue of projectIssues) {
      const assignedId = issue.assigned_to_id?.Id ?? issue.assigned_to_id?.id ?? issue.assigned_to_id;
      if (assignedId != null && String(assignedId) !== String(pmsContext.userId)) continue;
      pmsIssuesById.set(String(issue.id), {
        id: issue.id,
        subject: issue.subject || '',
        statusId: issue.status_id?.Id ?? issue.status_id?.id ?? issue.status_id,
        status: issue.status_id?.Name ?? issue.status_id?.name ?? String(issue.status_id || ''),
        isClosed: isPmsIssueClosed(issue)
      });
    }

    const pmsIssues = Array.from(pmsIssuesById.values());
    const jiraByKey = new Map(assignedJiraIssues.map(issue => [String(issue.key).toUpperCase(), issue]));
    const openPmsKeys = Array.from(new Set(pmsIssues.filter(issue => !isPmsIssueClosed(issue)).flatMap(issue => getJiraKeys(issue.subject))));
    const missingJiraKeys = openPmsKeys.filter(key => !jiraByKey.has(key));
    const linkedJiraIssues = await fetchJiraIssuesByKeys(missingJiraKeys);
    if (loadId !== assignmentLoadId) return;
    for (const issue of linkedJiraIssues) {
      jiraByKey.set(String(issue.key).toUpperCase(), issue);
    }
    const jiraIssues = Array.from(jiraByKey.values());
    for (const key of missingJiraKeys) {
      if (!jiraByKey.has(key)) jiraByKey.set(key, { key, fields: { status: { name: 'Not found / no access' } }, _jiraUnavailable: true });
    }
    jiraIssues.push(...Array.from(jiraByKey.values()).filter(issue => issue._jiraUnavailable));
    for (const issue of pmsIssues.filter(ticket => !isPmsIssueClosed(ticket) && getJiraKeys(ticket.subject).length === 0)) {
      jiraIssues.push({ key: '', fields: { status: { name: 'No Jira ID in PMS subject' } }, _pmsOnlyTickets: [issue] });
    }

    const { matched, visible } = renderAssignedWorkRows(jiraIssues, pmsIssues);
    assignmentMessage.textContent = `Showing ${visible} active assigned Jira/PMS items; ${matched} have a matching PMS ticket.`;
  } catch (err) {
    if (loadId !== assignmentLoadId) return;
    assignmentMessage.textContent = err.message || 'Could not load assigned tickets.';
    assignmentRows.replaceChildren();
    const row = document.createElement('tr');
    const cell = addStatusCell(row, 'Unable to load the assigned-ticket list.');
    cell.colSpan = 4;
    assignmentRows.appendChild(row);
  } finally {
    if (loadId === assignmentLoadId) statusRefreshBtn.disabled = false;
  }
}

// 3. Fetch Dropdown Options from PMS API
async function loadPmsDropdowns() {
  const loadId = ++pmsLoadId;
  const context = { ...pmsContext };
  pmsMetadata = null;
  pmsWorkflow = null;
  pmsReady = false;
  submitBtn.disabled = true;
  for (const select of pmsFieldSelects()) {
    populateOptions(select, [], '', '-- Loading --');
    select.disabled = true;
  }
  if (!context.projectId || !context.identifier) {
    for (const select of pmsFieldSelects()) {
      populateOptions(select, []);
    }
    setStatusTone(pmsStatusDiv, 'muted');
    pmsStatusDiv.innerText = 'Select a PMS project.';
    return;
  }
  try {
    if (!context.token) {
      throw new Error('Could not read PMS Token. Ensure you are logged in and PMS is open.');
    }

    setStatusTone(pmsStatusDiv, 'muted');
    pmsStatusDiv.innerText = `Connecting to project ${context.identifier}...`;

    const url = new URL(`${PMS_API_BASE}/Project/Ticket/TicketInitialData`);
    url.search = new URLSearchParams({ UserID: context.userId, ProjectID: context.projectId, Identifier: context.identifier, IsViewOnly: false }).toString();
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'authorization': context.token,
        'projectidentifier': context.identifier,
        'accept': 'application/json, text/plain, */*'
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to load dropdowns (HTTP ${res.status}).`);
    }

    const data = await res.json();
    if (loadId !== pmsLoadId) return;
    assertPmsResponse(data);

    const initialData = data?.Data ?? data;
    const userList = initialData?.ProjectMembersList?.Data ?? findPmsArray(data, ['user', 'member', 'assignee', 'owner', 'assigned_to']);
    const versionList = initialData?.ProjectVersionList?.Data ?? findPmsArray(data, ['version']);
    const categoryList = initialData?.IssueCategory?.Data ?? findPmsArray(data, ['category', 'categories']);

    // Restore last used selections from storage if available
    const selectionsKey = pmsSelectionsKey(context);
    const saved = await chrome.storage.local.get([selectionsKey]);
    if (loadId !== pmsLoadId) return;
    const last = saved[selectionsKey] || {};
    populateOptions(ownerSelect, userList, last.owner || context.userId);
    populateOptions(versionSelect, versionList, last.version || '');
    populateOptions(categorySelect, categoryList, last.category || '');
    pmsWorkflow = resolvePmsWorkflow(initialData);
    const initialStatuses = getInitialPmsStatuses(initialData, pmsWorkflow.tracker_id, pmsWorkflow.default_status_id);
    if (!initialStatuses.some(item => Number(item.Id) === pmsWorkflow.default_status_id)) {
      throw new Error('PMS did not provide an available initial status for Development. Cannot safely create a ticket.');
    }
    populateOptions(taskStatusSelect, initialStatuses, last.status || pmsWorkflow.default_status_id);
    pmsMetadata = initialData;

    if (ownerSelect.options.length <= 1) {
      console.warn('PMS TicketInitialData structure (field names only):', JSON.stringify(describePmsResponse(data)));
      throw new Error(`TicketInitialData: ${userList.length} candidate owner records, but no usable options. Open the popup DevTools console for the response structure.`);
    }

    pmsReady = true;
    updateFormState();
    setStatusTone(pmsStatusDiv, 'muted');
    pmsStatusDiv.innerText = '';
  } catch (err) {
    if (loadId !== pmsLoadId) return;
    updateFormState();
    setStatusTone(pmsStatusDiv, 'error');
    pmsStatusDiv.innerText = err.message || 'Error calling TicketInitialData API.';
    console.error(err);
  }
}

// 4. Initial Load
setTabsLocked(true);

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const saved = await chrome.storage.local.get([JIRA_URL_STORAGE_KEY]);
    const jiraOrigin = normalizeJiraUrl(saved[JIRA_URL_STORAGE_KEY]);
    if (!jiraOrigin) return;
    jiraUrlInput.value = jiraOrigin;
    if (await chrome.permissions.contains({ origins: accessOrigins(jiraOrigin) })) {
      await startApp(jiraOrigin);
    } else {
      accessMessage.textContent = 'Grant access to continue.';
    }
  } catch (e) {
    console.warn(e);
  }
});

projectSelect.addEventListener('change', () => {
  selectPmsProject().catch(err => {
    setStatusTone(pmsStatusDiv, 'error');
    pmsStatusDiv.innerText = err.message || 'Error selecting PMS project.';
  });
});
statusRefreshBtn.addEventListener('click', loadAssignedWorkStatus);
fetchBtn.addEventListener('click', () => {
  const key = jiraKeyInput.value.trim().toUpperCase();
  jiraKeyInput.value = key;
  fetchJiraDetails(key);
});

jiraKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    fetchBtn.click();
  }
});

function getCreatedTaskId(value, payload, context) {
  if (value?.Status === 200 && value?.Type === 0 && Array.isArray(value.Data) && value.Data.length === 1) {
    const result = value.Data[0];
    if (result && typeof result === 'object' && Object.hasOwn(result, 'Status')) {
      assertPmsResponse(result);
      if (result.Status === 200 && result.Type === 0 && Array.isArray(result.Data) && result.Data.length === 1) {
        const issue = result.Data[0];
        const id = issue?.id;
        if ((typeof id === 'number' || typeof id === 'string') && /^\d+$/.test(String(id)) && Number.isSafeInteger(Number(id)) && Number(id) > 0) {
          return Number(id);
        }
      }
    }
  }
  const records = value?.Data ?? value?.data ?? value;
  const record = Array.isArray(records) ? (records.length === 1 ? records[0] : null) : records;
  if (!record || typeof record !== 'object') return null;
  const subject = record.Subject ?? record.subject;
  const projectId = record.ProjectId ?? record.project_id;
  const identifier = record.Identifier;
  if (typeof subject !== 'string' || subject.trim().toLowerCase() !== payload.subject.trim().toLowerCase()) return null;
  if (projectId == null && identifier == null) return null;
  if (projectId != null && Number(projectId) !== context.projectId) return null;
  if (identifier != null && identifier !== context.identifier) return null;
  const id = record.IssueId ?? record.IssueID ?? record.issue_id ?? record.Id ?? record.id;
  return /^\d+$/.test(String(id)) && Number.isSafeInteger(Number(id)) && Number(id) > 0 ? Number(id) : null;
}

async function findDuplicatePmsTicket(subject, context, requireUnique = false) {
  const normalizedSubject = subject.trim().toLowerCase();
  const jiraKey = subject.trim().match(/^([A-Z][A-Z0-9_]*-\d+)\s*:/i)?.[1];
  const searchText = jiraKey || subject;
  let scanned = 0;
  const matches = new Map();
  for (let pageNumber = 1; ; pageNumber++) {
    const res = await fetch(`${PMS_API_BASE}/dashboard/GlobalSearch/SearchGlobal`, {
      method: 'POST',
      headers: {
        authorization: context.token,
        projectidentifier: context.identifier,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        SearchText: searchText,
        Filter: 'Issue,Document,Project',
        UserId: context.userId,
        isProjectData: true,
        NoSearchAttachment: true,
        FileNameAndDescription: false,
        AttachmentOnly: false,
        PageNumber: pageNumber,
        PageSize: 10,
        ProjectScope: 'all',
        TitlesOnly: false,
        AllWords: false
      })
    });
    if (!res.ok) throw new Error(`Duplicate check failed (HTTP ${res.status}). No ticket was created.`);
    const data = await res.json();
    assertPmsResponse(data);
    const search = data?.Data?.searchData;
    const rows = search?.RowData;
    const total = Number(search?.CountData?.TotalCount);
    if (!Array.isArray(rows) || search?.CountData?.TotalCount == null || !Number.isSafeInteger(total) || total < 0) {
      throw new Error('Duplicate check returned an unexpected response. No ticket was created.');
    }
    for (const row of rows) {
      if (!row || typeof row.Source !== 'string') {
        throw new Error('Duplicate check returned an invalid search result. No ticket was created.');
      }
      if (row.Source.toLowerCase() !== 'issue') continue;
      if (typeof row.Identifier !== 'string' || typeof row.Subject !== 'string') {
        throw new Error('Duplicate check returned an issue without its project or subject. No ticket was created.');
      }
      const sameSubject = row.Subject.trim().toLowerCase() === normalizedSubject;
      const sameJiraKey = jiraKey && (row.Subject.match(/\b[A-Z][A-Z0-9_]*-\d+\b/gi) || []).some(key => key.toLowerCase() === jiraKey.toLowerCase());
      const isMatch = !requireUnique && jiraKey ? sameJiraKey : sameSubject;
      if (row.Identifier === context.identifier && isMatch) {
        if (!requireUnique) return row;
        const id = Number(row.Id);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('PMS search returned an invalid issue ID.');
        matches.set(id, row);
        if (matches.size > 1) throw new Error('Multiple matching tickets exist. Open PMS to verify the created task.');
      }
    }
    scanned += rows.length;
    if (scanned >= total) return matches.size === 1 ? Array.from(matches.values())[0] : null;
    if (!rows.length || pageNumber >= 1000) {
      throw new Error('Duplicate check returned incomplete search results. No ticket was created.');
    }
  }
}

// 5. Submit: Create Task via PMS REST API
submitBtn.addEventListener('click', async () => {
  if (submitBtn.disabled) return;
  if (!pmsReady || !pmsContext || !pmsContext.token) {
    alert('PMS fields are not ready. Check the PMS status and login session.');
    return;
  }

  const subject = subjectInput.value.trim();
  if (!subject) {
    alert('Subject is required.');
    return;
  }

  const context = { ...pmsContext };
  let dates;
  let workflowIds;
  let donePercentField;
  const hours = Number(hoursInput.value || '0');
  try {
    dates = readTaskDates();
    if (hoursInput.validity.badInput || !Number.isFinite(hours) || hours < 0) {
      throw new Error('Estimated hours must be a finite, nonnegative number.');
    }
    workflowIds = {
      ...resolvePmsWorkflow(pmsMetadata),
      status_id: selectedPmsId(taskStatusSelect, 'status'),
      assigned_to_id: selectedPmsId(ownerSelect, 'owner'),
      category_id: selectedPmsId(categorySelect, 'category'),
      target_version_id: selectedPmsId(versionSelect, 'target version')
    };
    donePercentField = getRequiredDonePercentField(pmsMetadata, workflowIds.tracker_id, workflowIds.status_id);
  } catch (err) {
    showSubmissionError(err.message);
    return;
  }

  const payload = {
    project_id: Number(context.projectId),
    ...workflowIds,
    author_id: Number(context.userId),
    UserID: Number(context.userId),
    lock_version: 0,
    subject,
    ...dates,
    estimated_hours: String(hours),
    impact_on_layout: null,
    CustomValues: []
  };
  if (donePercentField) payload[donePercentField.column] = 0;
  try {
    validateProjectWorkflow(payload);
  } catch (err) {
    showSubmissionError(err.message);
    return;
  }

  // Save selected defaults for the next ticket
  chrome.storage.local.set({
    [pmsSelectionsKey(pmsContext)]: {
      owner: ownerSelect.value,
      version: versionSelect.value,
      category: categorySelect.value,
      status: taskStatusSelect.value
    }
  });

  submitting = true;
  updateFormState();
  submitBtn.innerText = 'Checking duplicates...';

  try {
    const duplicate = await findDuplicatePmsTicket(subject, context);
    if (duplicate) {
      const ticketId = /^\d+$/.test(String(duplicate.Id)) ? String(duplicate.Id) : null;
      const jiraKey = subject.match(/^([A-Z][A-Z0-9_]*-\d+)\s*:/i)?.[1];
      const reason = jiraKey ? `Jira ID ${jiraKey} already exists` : 'this subject already exists';
      showSubmissionError(`Duplicate ticket${ticketId ? ` #${ticketId}` : ''}: ${reason} in project ${context.identifier}. No ticket was created.`, false, ticketId);
      return;
    }
  } catch (err) {
    showSubmissionError(err.message || 'Duplicate check failed. No ticket was created.');
    return;
  }
  submitBtn.innerText = 'Creating Task...';

  try {
    const res = await fetch(`${PMS_API_BASE}/Project/Ticket/BulkPostTicket`, {
      method: 'POST',
      headers: {
        'authorization': context.token,
        'projectidentifier': context.identifier,
        'content-type': 'application/json',
        'accept': 'application/json, text/plain, */*'
      },
      body: JSON.stringify([payload])
    });

    if (res.ok) {
      try {
        const responseText = await res.text();
        const created = JSON.parse(responseText);
        assertPmsResponse(created);
        let taskId = getCreatedTaskId(created, payload, context);
        if (!taskId) {
          const match = await findDuplicatePmsTicket(payload.subject, context, true);
          taskId = match ? Number(match.Id) : null;
        }
        if (!taskId) throw new Error('No matching task could be confirmed in PMS search.');
        submissionLocked = true;
        submitting = false;
        updateFormState();
        setStatusTone(statusDiv, 'success');
        statusDiv.innerText = 'Task confirmed in PMS. Opening task...';
        submitBtn.innerText = 'Success!';
        await chrome.tabs.create({ url: `https://sap-pms.einfochips.com/issues/${taskId}`, active: true });
      } catch (err) {
        showSubmissionError(`${err.message || 'Could not confirm the creation response.'} Check PMS before retrying; do not submit again yet.`, true);
      }
    } else {
      const errText = await res.text();
      let errorMessage = errText;
      try {
        const error = JSON.parse(errText);
        if (error.errors && typeof error.errors === 'object') {
          errorMessage = Object.entries(error.errors).map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join('; ') : String(messages)}`).join('\n');
        } else {
          errorMessage = error.Message || error.title || errText;
        }
      } catch (e) {}
      setStatusTone(statusDiv, 'error');
      statusDiv.innerText = `API error (${res.status}): ${errorMessage}`;
      showSubmissionError(`API error (${res.status}): ${errorMessage}${res.status >= 500 ? ' The creation outcome may be uncertain. Check PMS before retrying.' : ''}`, res.status >= 500);
    }
  } catch (err) {
    showSubmissionError('The creation outcome is unknown because the request failed. Check PMS before retrying; do not submit this ticket again yet.', true);
    console.error(err);
  }
});

accessBtn.addEventListener('click', requestAccess);
jiraUrlInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    accessBtn.click();
  }
});