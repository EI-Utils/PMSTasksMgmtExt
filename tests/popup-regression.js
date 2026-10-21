async function runPopupRegressionTests() {
  const results = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    results.push(message);
  };
  const settle = async predicate => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    throw new Error('Mock submission did not settle.');
  };
  const original = { fetch: window.fetch, chrome: window.chrome, close: window.close };
  const saved = { 'pmsSelections:53:751': { tracker: '12', status: '15', priority: '99' } };
  const requests = [];
  let mode = 'validation';
  let posted;
  let opened;
  let closed = false;
  let releaseSearch;
  let releaseProject;
  let releaseCloseDetails;
  const releaseTicketSearches = [];
  let pmsAccessGranted = true;
  let requestedPmsOrigins;
  const timesheetPosts = [];
  let worklogPmsTicketMissing = false;
  let timesheetFailure = false;
  const closePosts = [];
  const metadata = projectId => ({
    Trackers: { Data: [{ Id: 9, Name: 'Development', default_status: { Id: 11 } }, { Id: 12, Name: 'Bug', default_status: 15 }] },
    IssueStatus: { Data: [{ Id: 11, Name: 'New', IsClosed: false }, { Id: 12, Name: 'In Progress', IsClosed: false }, { Id: 15, Name: 'Triage', IsClosed: false }, { Id: 99, Name: 'Closed', IsClosed: true }] },
    IssuePriorityList: { Data: [{ id: 7, name: 'Normal', is_default: true }] },
    ProjectMembersList: { Data: [{ MemberId: null, User: { Id: 53, Name: `Owner ${projectId}` } }] },
    ProjectVersionList: { Data: [{ Id: projectId + 100, Name: 'Release' }] },
    IssueCategory: { Data: [{ Id: projectId + 200, Name: 'Category' }] },
    IssueCustomFields: { Data: [] },
    FieldsData: { Data: [{ ColumnName: 'subject', FieldsBit: 1, DisplayName: 'Subject' }, { ColumnName: 'done_ratio', FieldsBit: 2, DisplayName: 'Done %' }] },
    WorkflowFields: { Data: [{ TrackerID: 9, StatusID: 11, FieldStaus: { required: [1] } }, { TrackerID: 9, StatusID: 12, FieldStaus: { required: [2] } }] },
    WorkflowTransitions: { Data: [{ TrackerID: 9, OldStatusID: 0, NewStatusID: 12 }, { TrackerID: 9, OldStatusID: 11, NewStatusID: 15 }] }
  });
  const reset = async () => {
    mode = 'validation';
    submittedReset();
    await loadPmsProjects();
    subjectInput.value = 'TEST-1 : Task';
    startDateInput.value = '2026-10-01';
    actualStartDateInput.value = '2026-10-01';
    dueDateInput.value = '2026-10-15';
    hoursInput.value = '1.25';
    versionSelect.value = versionSelect.options[1].value;
    categorySelect.value = categorySelect.options[1].value;
    taskStatusSelect.value = pmsWorkflow.default_status_id;
    taskStatusSelect.dispatchEvent(new Event('change'));
  };
  function submittedReset() {
    submitting = false;
    submissionLocked = false;
    jiraLoading = false;
    jiraFailed = false;
    posted = null;
    opened = null;
    closed = false;
  }
  try {
    jiraBaseUrl = 'https://jira.example.com';
    setTabsLocked(false);
    window.chrome = {
      tabs: {
        query: async () => [{ id: 1, url: 'https://sap-pms.einfochips.com', active: true }],
        create: async options => {
          if (mode === 'navigationFailure') throw new Error('Mock navigation failed.');
          opened = options;
        }
      },
      scripting: { executeScript: async () => [{ result: { token: 'test-token', userId: 53, projectId: 751 } }] },
      permissions: {
        contains: async () => pmsAccessGranted,
        request: async permissions => {
          requestedPmsOrigins = permissions.origins;
          pmsAccessGranted = true;
          return true;
        }
      },
      storage: { local: {
        get: async keys => Object.fromEntries(keys.map(key => [key, saved[key]])),
        set: async values => Object.assign(saved, values)
      } }
    };
    window.close = () => { closed = true; };
    window.fetch = async (input, options = {}) => {
      const url = String(input);
      requests.push({ url, options });
      const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
      if (url.includes('GetProjectsByStatusAndUser')) {
        const body = JSON.parse(options.body);
        const projects = Array.from({ length: 12 }, (_, index) => ({ Id: 751 + index, Name: `Project ${index + 1}`, Identifier: `PROJECT_${751 + index}` }));
        return json({ Status: 200, Type: 0, Data: { TotalCount: 12, ProjectData: projects.slice((body.PageNumber - 1) * 10, body.PageNumber * 10) } });
      }
      if (url.includes('TicketInitialData')) {
        const projectId = Number(new URL(url).searchParams.get('ProjectID'));
        if (mode === 'projectRace' && projectId === 752) await new Promise(resolve => { releaseProject = resolve; });
        if (mode === 'projectFieldsFailure' && projectId === 752) return json({ Message: 'Project fields unavailable.' }, 500);
        return json({ Status: 200, Type: 0, Data: metadata(projectId) });
      }
      if (url.includes('/Timesheet/GetWeeklyTimeEntries')) {
        const body = JSON.parse(options.body);
        check(body.UserId === 53 && body.IsClosedStatus === 'Open' && body.IsAllUsersTasks === false, 'WSR sends logged-in user and own open entries to weekly timesheet API');
        if (mode === 'wsrMonthBoundary') {
          if (body.StartDate === '2026-03-29') return json({ Status: 200, Type: 0, Data: { WeeklyTimesheetEntries: ['29', '30', '31'].map(day => ({ Date: `2026-03-${day}T00:00:00`, listTimesheetDetails: [{ TaskId: Number(day), TaskTitle: `MARCH-${day}: task`, ProjectName: 'Project', SpentHrs: 1 }] })) } });
          if (body.StartDate === '2026-04-01') return json({ Status: 200, Type: 0, Data: { WeeklyTimesheetEntries: ['01', '02', '03', '04', '05', '06', '07'].map(day => ({ Date: `2026-04-${day}T00:00:00`, listTimesheetDetails: [{ TaskId: Number(day) + 100, TaskTitle: `APRIL-${day}: task`, ProjectName: 'Project', SpentHrs: 1 }] })) } });
          throw new Error(`Unexpected month-boundary StartDate: ${body.StartDate}`);
        }
        check(body.StartDate === '2026-10-04', 'WSR sends the selected week-start date');
        return json({ Status: 200, Type: 0, Data: { WeeklyTimesheetEntries: [
          { Date: '2026-10-04T00:00:00', listTimesheetDetails: [], IsWeekOff: true },
          { Date: '2026-10-05T00:00:00', listTimesheetDetails: [{ TaskId: 332971, TaskTitle: 'LAMARR-6382: Broadcast update', ProjectName: 'Audio Sustenance - Offshore', SpentHrs: 8 }] },
          { Date: '2026-10-06T00:00:00', listTimesheetDetails: [{ TaskId: 332971, TaskTitle: 'LAMARR-6382: Broadcast update', ProjectName: 'Audio Sustenance - Offshore', SpentHrs: 1 }] },
          { Date: '2026-10-06T00:00:00', listTimesheetDetails: [{ TaskId: 333001, TaskTitle: 'LAMARR-6700: Test task', ProjectName: 'Audio Sustenance - Offshore', SpentHrs: 2.5 }] }
        ] } });
      }
      if (url.includes('/rest/api/3/search/jql')) {
        const body = JSON.parse(options.body);
        check(options.method === 'POST' && body.fields.includes('status') && body.fields.includes('summary') && !body.fields.includes('description'), 'Status tab requests Jira status and summary only');
        if (mode === 'jiraWorklogs') {
          check(body.jql === 'worklogDate >= "2026-10-04" AND worklogDate <= "2026-10-10" ORDER BY key ASC', 'Jira worklog search uses the supported selected-week date field');
          return json({ isLast: true, issues: [{ key: 'JIRA-1001', fields: { summary: 'Worklog test issue', status: { name: 'In Progress' } } }] });
        }
        if (body.jql === 'key in (JIRA-1005) ORDER BY key ASC') {
          check(true, 'Linked PMS Jira key is looked up even when not assigned to the Jira user');
          return json({ isLast: true, issues: [{ key: 'JIRA-1005', fields: { summary: 'PMS-linked Jira title for another assignee.', status: { name: 'Selected for Development' } } }] });
        }
        check(body.jql === 'assignee = currentUser() ORDER BY key ASC', 'Jira assignment query is scoped to the logged-in user');
        if (mode === 'jiraPagination') {
          if (!body.nextPageToken) return json({ isLast: false, nextPageToken: 'jira-page-2', issues: [{ key: 'JIRA-2001', fields: { status: { name: 'In Progress' } } }] });
          check(body.nextPageToken === 'jira-page-2', 'Jira enhanced search passes nextPageToken on continuation');
          return json({ isLast: true, issues: [{ key: 'JIRA-2002', fields: { status: { name: 'Done' } } }] });
        }
        return json({ isLast: true, issues: [
          { key: 'JIRA-1001', fields: { summary: 'Assigned Jira issue title for the status table.', status: { name: 'In Progress' } } },
          { key: 'JIRA-1002', fields: { status: { name: 'To Do' } } },
          { key: 'JIRA-1003', fields: { status: { name: 'Closed', statusCategory: { key: 'done', name: 'Done' } } } },
          { key: 'JIRA-1004', fields: { status: { name: 'Closed', statusCategory: { key: 'done', name: 'Done' } } } },
          { key: 'JIRA-1006', fields: { status: { name: 'In Progress' } } }
        ] });
      }
      if (url.endsWith('/rest/api/3/myself')) {
        check(options.credentials === 'include', 'Jira current-user request includes the browser session');
        return json({ accountId: 'current-account', displayName: 'Current Jira User' });
      }
      if (url.includes('/rest/api/3/issue/') && url.includes('/worklog?')) {
        const requestUrl = new URL(url);
        check(options.credentials === 'include', 'Jira worklog request includes the browser session');
        if (requestUrl.searchParams.get('startAt') === '0') {
          return json({ startAt: 0, maxResults: 100, total: 4, worklogs: [
            { id: '1', started: '2026-10-04T09:00:00.000+0000', author: { accountId: 'current-account', displayName: 'Current Jira User' }, timeSpent: '1h', timeSpentSeconds: 3600, comment: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sunday work' }] }] } },
            { id: '2', started: '2026-10-06T10:00:00.000+0000', author: { accountId: 'another-account', displayName: 'Another User' }, timeSpent: '30m', timeSpentSeconds: 1800, comment: 'Other user work' }
          ] });
        }
        check(requestUrl.searchParams.get('startAt') === '2', 'Jira worklog request paginates through all entries');
        return json({ startAt: 2, maxResults: 100, total: 4, worklogs: [
          { id: '3', started: '2026-10-10T16:00:00.000+0000', author: { accountId: 'current-account', displayName: 'Current Jira User' }, timeSpentSeconds: 5400, comment: 'Saturday work' },
          { id: '4', started: '2026-10-11T09:00:00.000+0000', author: { accountId: 'current-account', displayName: 'Current Jira User' }, timeSpent: '15m', timeSpentSeconds: 900, comment: 'Outside selected week' }
        ] });
      }
      if (url.includes('/Project/Issue/IssuesByFilterData')) {
        const requestBody = JSON.parse(options.body);
        const filters = requestBody.request;
        const requestedProject = filters.find(filter => filter.ColumnName === 'project_id')?.ConditionValue?.[0];
        if (mode === 'pmsProjectScopeRace' && requestedProject === '751') await new Promise(resolve => { releaseTicketSearches.push(resolve); });
        check(Array.isArray(filters), 'PMS assigned-ticket request uses the required object with request array');
        check(requestBody.PageSize === 5000 && requestBody.PageNumber === 1, 'PMS assigned-ticket search requests one large page');
        const trackerFilter = filters.find(filter => filter.ColumnName === 'tracker_id');
        const assignedFilter = filters.find(filter => filter.ColumnName === 'assigned_to_id');
        const statusFilter = filters.find(filter => filter.ColumnName === 'status_id');
        const closedSearch = statusFilter?.isClosed_for_status_id === 1;
        check(trackerFilter?.ConditionValue?.join(',') === '9' && statusFilter?.ConditionValue?.join(',') === (closedSearch ? '99' : '11,12,15') && statusFilter.isClosed_for_status_id === (closedSearch ? 1 : 0), 'PMS query sends matching tracker, status IDs, and open/closed flag');
        check(assignedFilter?.ConditionValue?.[0] === '53', 'PMS status query filters to the current assigned user');
        if (mode === 'pmsClosedStatusFailure' && closedSearch) return json({ Message: 'Closed-ticket search unavailable.' }, 500);
        if (mode === 'pmsStatusFailure') return json({ title: 'One or more validation errors occurred.', errors: { tracker_id: ['Invalid tracker filter'] } }, 400);
        if (mode.startsWith('closeTicket')) {
          check(!closedSearch, 'Close tab requests only open PMS tickets');
          const closeIssues = mode === 'closeTicketMissing' || filters.find(filter => filter.ColumnName === 'project_id')?.ConditionValue?.[0] !== '751' ? [] : [
            { id: 333889, subject: 'JIRA-3001 : Close me', assigned_to_id: { Id: 53 }, status_id: { Id: 12, Name: 'In Progress' } },
            { id: 333890, subject: 'Teammate ticket', assigned_to_id: { Id: 77 }, status_id: { Id: 12, Name: 'In Progress' } },
            { id: 333891, subject: 'Already closed', assigned_to_id: { Id: 53 }, status_id: { Id: 99, Name: 'Closed' } },
            { id: 333892, subject: 'JIRA-3002 : Second open ticket', assigned_to_id: { Id: 53 }, status_id: { Id: 11, Name: 'New' } }
          ];
          return json({ Status: 200, Type: 0, Data: { Issues: closeIssues, TotalCount: closeIssues.length } });
        }
        const projectFilter = filters.find(filter => filter.ColumnName === 'project_id');
        if (mode === 'pmsTicketsSinglePage' || mode === 'pmsTicketsTruncated') {
          const issueCount = mode === 'pmsTicketsSinglePage' ? 12 : 10;
          return json({ Status: 200, Type: 0, Data: { Issues: Array.from({ length: issueCount }, (_, index) => ({ id: 334000 + index, subject: `JIRA-${334000 + index}`, assigned_to_id: { Id: 53 }, status_id: { Id: 1, Name: 'New' } })), TotalCount: 12 } });
        }
        const issues = projectFilter?.ConditionValue?.[0] === '751' ? [
          { id: 333521, subject: 'JIRA-1001 : Main ticket', assigned_to_id: { Id: 53, Name: 'Owner' }, status_id: { Id: 2, Name: 'In Progress' } },
          { id: 333522, subject: 'Follow-up for jira-1001', assigned_to_id: { Id: 53, Name: 'Owner' }, status_id: { Id: 1, Name: 'New' } },
          { id: 333523, subject: 'JIRA-1003 : Other work', assigned_to_id: { Id: 53, Name: 'Owner' }, status_id: { Id: 4, Name: 'Review' } },
          { id: 333524, subject: 'JIRA-1004 : Closed PMS work', assigned_to_id: { Id: 53, Name: 'Owner' }, status_id: { Id: 99, Name: 'Closed' } },
          { id: 333525, subject: 'JIRA-1005 : Jira is assigned to a teammate', assigned_to_id: { Id: 53, Name: 'Owner' }, status_id: { Id: 2, Name: 'In Progress' } },
          { id: 333526, subject: 'PMS-only ticket without a Jira key', assigned_to_id: { Id: 53, Name: 'Owner' }, status_id: { Id: 1, Name: 'New' } },
          { id: 333527, subject: 'JIRA-1001 : Earlier closed work', assigned_to_id: { Id: 53, Name: 'Owner' }, status_id: { Id: 99, Name: 'Closed' } },
          { id: 333528, subject: 'JIRA-1006 : Closed PMS work for active Jira', assigned_to_id: { Id: 53, Name: 'Owner' }, status_id: { Id: 99, Name: 'Closed' } }
        ] : [];
        const filteredIssues = mode === 'pmsOverlappingStatusResults'
          ? [...issues, ...issues.map(issue => ({ ...issue, id: String(issue.id) }))]
          : issues.filter(issue => (issue.status_id.Id === 99) === closedSearch);
        return json({ Status: 200, Type: 0, Data: { Issues: filteredIssues, TotalCount: filteredIssues.length } });
      }
      if (url.includes('/Timesheet/AddOrUpdateTimeEntries')) {
        check(options.method === 'POST' && options.headers.authorization === 'test-token' && options.headers.projectidentifier === 'PROJECT_751', 'PMS timesheet request uses the PMS token and ticket project');
        timesheetPosts.push(JSON.parse(options.body));
        if (timesheetFailure) return json({ Message: 'Timesheet is locked for this week.', Data: null, Status: 500, Type: 1 });
        return json({ Message: 'Timesheet saved successfully.', Data: null, Status: 200, Type: 0 });
      }
      if (url.includes('SearchGlobal') && mode === 'jiraWorklogs') {
        const body = JSON.parse(options.body);
        check(body.SearchText === 'JIRA-1001' && body.ProjectScope === 'all', 'PMS ticket lookup searches all projects by Jira key');
        const rows = worklogPmsTicketMissing ? [] : [
          { Id: 333521, Source: 'Issue', Identifier: 'PROJECT_751', Subject: 'JIRA-1001 : Main ticket' },
          { Id: 333999, Source: 'Issue', Identifier: 'PROJECT_751', Subject: 'JIRA-10010 : Different ticket' },
          { Id: 334000, Source: 'Issue', Identifier: 'NOT_MY_PROJECT', Subject: 'JIRA-1001 : Other project' }
        ];
        return json({ Status: 200, Type: 0, Data: { searchData: { RowData: rows, CountData: { TotalCount: rows.length } } } });
      }
      if (url.includes('SearchGlobal') && mode.startsWith('closeTicket')) {
        const body = JSON.parse(options.body);
        check(body.SearchText === 'JIRA-3001', 'Close by Jira ID searches PMS by the Jira key');
        const rows = mode === 'closeTicketMissing' ? [] : [
          ...(mode === 'closeTicketOtherProject' ? [] : [{ Id: 333889, Source: 'Issue', Identifier: 'PROJECT_751', Subject: 'JIRA-3001 : Close me' }]),
          { Id: 333990, Source: 'Issue', Identifier: 'PROJECT_752', Subject: 'JIRA-3001 : Other project' }
        ];
        return json({ Status: 200, Type: 0, Data: { searchData: { RowData: rows, CountData: { TotalCount: rows.length } } } });
      }
      if (url.includes('/Project/Ticket/EditTicket')) {
        if (mode === 'closeTicketEditRace') await new Promise(resolve => { releaseCloseDetails = resolve; });
        const params = new URL(url).searchParams;
        check(params.get('TicketID') === '333889' && params.get('UserID') === '53' && options.headers.projectidentifier === 'PROJECT_751', 'Close tab loads the matched PMS ticket details');
        return json({ Message: null, Status: 200, Type: 0, Data: {
          HoursDetails: { TotalEstimatedHours: 8, TotalSpentTime: 4.5, SpentTime: 4.5 },
          IssueStatus: { Message: null, Data: { id: 2, name: 'Dev In Progress', is_closed: 0 }, Status: 200, Type: 0 },
          Issue: { id: 333889, tracker_id: 2, project_id: 751, identifier: null, subject: 'JIRA-3001 : Close me', description: null, due_date: '2026-10-20T00:00:00', category_id: 9, status_id: 2, assigned_to_id: 53, assigned_to_name: null, priority_id: 2, author_id: 53, author_name: null, lock_version: 3, created_on: '2026-10-15T19:04:51.1833333', updated_on: '2026-10-15T20:41:03.7133333', start_date: '2025-10-01T00:00:00', done_ratio: 40, estimated_hours: 8, parent_id: null, root_id: 333889, lft: 1, rgt: 2, is_private: 0, product_id: null, actual_start_date: '2025-10-01T00:00:00', actual_end_date: null, target_version_id: 851, is_delete: false, notes: null, UserID: 0, attachmentID: [], CustomValues: [], Watchers: [53], WatchersList: [], HoursDetails: { TotalEstimatedHours: 8, TotalSpentTime: null, SpentTime: null }, CustomFields: [], Products: [] }
        } });
      }
      if (url.includes('BulkPostTicket') && mode.startsWith('closeTicket')) {
        check(options.headers.projectidentifier === 'PROJECT_751', 'Close update uses the ticket project header');
        closePosts.push(JSON.parse(options.body));
        if (mode === 'closeTicketReject') return json({ Message: 'Ticket was modified by another user.', Data: null, Status: 409, Type: 1 });
        return json({ Message: 'Ticket updated successfully.', Data: [{ Message: 'Ticket updated successfully.', Data: [{ id: 333889, message: 'Ticket updated successfully.', updated_on: '2026-10-15T20:49:29.2059865+05:30' }], Status: 200, Type: 2 }], Status: 200, Type: 0 });
      }
      if (url.includes('SearchGlobal')) {
        if (mode === 'snapshot') await new Promise(resolve => { releaseSearch = resolve; });
        if (mode === 'searchFailure') return json({}, 401);
        const body = JSON.parse(options.body);
        const match = { Id: 333458, Source: 'Issue', Identifier: pmsContext.identifier, Subject: ' test-1 : TASK ', StatusName: 'Closed' };
        if (mode === 'punctuatedSubject') {
          const subject = 'LAMARR-6672 : CSMBS-854 | [BT] Official BTD binary release [V1.0.69]';
          const rows = body.SearchText === 'LAMARR-6672' ? [{ ...match, Subject: subject }, { ...match, Id: 333459, Subject: 'LAMARR-6672 : Different task' }] : [];
          return json({ Status: 200, Type: 0, Data: { searchData: { RowData: rows, CountData: { TotalCount: rows.length } } } });
        }
        let rows = [];
        if (mode === 'duplicate') rows = [match];
        if (mode === 'duplicatePage') rows = body.PageNumber === 1 ? [{ ...match, Subject: 'OTHER-2 : Another task' }] : [match];
        if (mode === 'keyVariants') rows = [
          { ...match, Subject: 'LAMARR-66720 : Different issue' },
          { ...match, Subject: 'LAMARR-6672 : Other project', Identifier: 'OTHER_PROJECT' },
          { ...match, Subject: 'LAMARR-6672 : Document', Source: 'Document' },
          { ...match, Id: 333460, Subject: 'Follow-up for lamarr-6672 with a changed title' }
        ];
        if (posted && mode === 'fallback') rows = [match];
        if (posted && mode === 'ambiguous') rows = [match, { ...match, Id: 333459 }];
        return json({ Status: 200, Type: 0, Data: { searchData: { RowData: rows, CountData: { TotalCount: mode === 'duplicatePage' ? 2 : rows.length } } } });
      }
      if (url.includes('BulkPostTicket')) {
        const body = JSON.parse(options.body);
        if (!Array.isArray(body) || body.length !== 1) throw new Error('Invalid bulk body.');
        posted = body[0];
        if (mode === 'networkFailure') throw new Error('Mock connection lost after POST.');
        if (mode === 'serverFailure') return json({ Message: 'Internal error' }, 500);
        if (mode === 'businessFailure') return json({ Status: 500, Type: 1, Message: 'Creation rejected', Data: null });
        if (mode === 'nestedSuccess') return json({ Message: 'Issue #333474 created.', Data: [{ Message: 'Issue #333474 created.', Data: [{ id: 333474, message: null, updated_on: '0001-01-01T00:00:00' }], Status: 200, Type: 0 }], Status: 200, Type: 0 });
        if (['fallback', 'ambiguous', 'missingId'].includes(mode)) return json({ Status: 200, Type: 0, Data: { Id: 751, Name: 'Unrelated project' } });
        if (['success', 'navigationFailure'].includes(mode)) return json({ Status: 200, Type: 0, Data: [{ Id: 333458, Subject: posted.subject, ProjectId: posted.project_id }] });
        return json({ errors: { subject: ['Mock validation error longer than sixty characters; this ending must remain visible.'] } }, 422);
      }
      throw new Error(`Unexpected test request: ${url}`);
    };
    await reset();
    check(statusTab.getAttribute('role') === 'tab' && statusTab.getAttribute('aria-selected') === 'true' && !statusPanel.hidden && createPanel.hidden, 'Status tab is selected by default');
    check(statusTab.parentElement.firstElementChild === statusTab && appTabs[0] === statusTab, 'Status is the first tab');
    check(document.querySelectorAll('#projectSelect').length === 1 && !projectSelect.closest('[role="tabpanel"]') && Boolean(projectSelect.compareDocumentPosition(statusTab.parentElement) & Node.DOCUMENT_POSITION_FOLLOWING), 'One shared Project selector is outside all panels and above the tabs');
    check(!pmsStatusDiv.closest('[role="tabpanel"]') && pmsStatusDiv.getAttribute('role') === 'status', 'Shared PMS loading and connection status is accessible outside the tabs');
    for (const tab of appTabs) {
      tab.click();
      check(projectSelect.getClientRects().length > 0 && !projectSelect.disabled, `Shared Project selector stays visible and enabled on ${tab.textContent}`);
    }
    statusTab.click();
    check(requests.filter(request => request.url.includes('/Project/Issue/IssuesByFilterData')).every(request => JSON.parse(request.options.body).request.find(filter => filter.ColumnName === 'project_id')?.ConditionValue?.join(',') === '751' && request.options.headers.projectidentifier === 'PROJECT_751'), 'Startup Status and Close query only the selected project with its identifier');
    check(/^\d{4}-\d{2}-\d{2}$/.test(wsrStartDate.value) && new Date(`${wsrStartDate.value}T00:00:00`).getDay() === 0, 'WSR defaults to the current week start Sunday');
    const wsrRequestCount = requests.length;
    wsrTab.click();
    check(requests.length === wsrRequestCount, 'Opening WSR does not fetch until Load week is pressed');
    wsrStartDate.value = '2026-10-05';
    wsrLoadBtn.click();
    await settle(() => !wsrLoadBtn.disabled);
    check(!requests.some(request => request.url.includes('/Timesheet/GetWeeklyTimeEntries')), 'Non-Sunday week start is rejected without a PMS request');
    check(wsrMessage.textContent.includes('must start on Sunday'), 'WSR explains required Sunday week start');
    wsrStartDate.value = '2026-10-04';
    wsrLoadBtn.click();
    await settle(() => !wsrLoadBtn.disabled && wsrMessage.textContent.includes('3 task time entries'));
    check(wsrRows.rows.length === 3 && wsrRows.rows[0].textContent.includes('LAMARR-6382: Broadcast update') && wsrRows.rows[0].textContent.includes('8h'), 'WSR lists task subjects, dates, projects, and hours from response');
    check(wsrRows.rows[2].textContent.includes('LAMARR-6700: Test task') && wsrRows.rows[2].textContent.includes('2.5h'), 'WSR lists all task entries across the selected week');
    check(wsrSubjects.value === 'LAMARR-6382: Broadcast update\nLAMARR-6700: Test task' && !wsrCopyBtn.disabled, 'WSR provides unique plain-text subjects ready to copy');
    mode = 'wsrMonthBoundary';
    wsrStartDate.value = '2026-03-29';
    const boundaryRequestStart = requests.filter(request => request.url.includes('/Timesheet/GetWeeklyTimeEntries')).length;
    wsrLoadBtn.click();
    await settle(() => !wsrLoadBtn.disabled && wsrMessage.textContent.includes('7 task time entries'));
    const boundaryRequests = requests.filter(request => request.url.includes('/Timesheet/GetWeeklyTimeEntries')).slice(boundaryRequestStart);
    check(boundaryRequests.length === 2 && JSON.parse(boundaryRequests[0].options.body).StartDate === '2026-03-29' && JSON.parse(boundaryRequests[1].options.body).StartDate === '2026-04-01', 'Week crossing a month boundary requests the first day of the next month once');
    check(wsrRows.rows.length === 7 && wsrRows.rows[wsrRows.rows.length - 1].textContent.includes('2026-04-04') && !wsrSubjects.value.includes('APRIL-05'), 'WSR merges remaining in-week days and excludes dates after the selected week');
    const jiraWorklogRequestCount = requests.filter(request => request.url.includes('/rest/api/3/search/jql')).length;
    jiraWorklogTab.click();
    check(jiraWorklogTab.getAttribute('aria-selected') === 'true' && !jiraWorklogPanel.hidden, 'Jira work log tab opens its panel');
    check(requests.filter(request => request.url.includes('/rest/api/3/search/jql')).length === jiraWorklogRequestCount, 'Opening Jira work log does not fetch until Load week is pressed');
    jiraWorklogStartDate.value = '2026-10-05';
    jiraWorklogLoadBtn.click();
    await settle(() => !jiraWorklogLoadBtn.disabled);
    check(requests.filter(request => request.url.includes('/rest/api/3/search/jql')).length === jiraWorklogRequestCount && jiraWorklogMessage.textContent.includes('must start on Sunday'), 'Jira work log rejects a non-Sunday week without a Jira request');
    mode = 'jiraWorklogs';
    jiraWorklogStartDate.value = '2026-10-04';
    jiraWorklogLoadBtn.click();
    await settle(() => !jiraWorklogLoadBtn.disabled && jiraWorklogMessage.textContent.includes('2 Jira worklog entries'));
    check(jiraWorklogRows.rows.length === 2 && jiraWorklogRows.rows[0].textContent.includes('2026-10-10') && jiraWorklogRows.rows[1].textContent.includes('2026-10-04'), 'Jira work log includes selected-week entries and sorts newest first');
    check(jiraWorklogRows.textContent.includes('Sunday work') && jiraWorklogRows.textContent.includes('Saturday work') && !jiraWorklogRows.textContent.includes('Other user work') && !jiraWorklogRows.textContent.includes('Outside selected week'), 'Jira work log filters by signed-in author and selected dates');
    check(jiraWorklogRows.rows[0].textContent.includes('1h 30m') && jiraWorklogRows.rows[1].textContent.includes('JIRA-1001') && jiraWorklogRows.rows[1].querySelector('a')?.href.includes('/browse/JIRA-1001'), 'Jira work log renders duration and a link to the issue');
    check(jiraWorklogLogBtn.disabled && !jiraWorklogSelectAll.disabled, 'Log hours button stays disabled until an entry is checked');
    jiraWorklogSelectAll.click();
    check(jiraWorklogEntries.every(entry => entry.checkbox.checked) && !jiraWorklogLogBtn.disabled, 'Select all checks every worklog entry');
    jiraWorklogLogBtn.click();
    await settle(() => !jiraWorklogLogging && jiraWorklogMessage.textContent.includes('Logged 2 entries'));
    check(timesheetPosts.length === 2, 'Each checked worklog is posted to PMS once');
    const saturdayPost = timesheetPosts.find(post => post.TimesheetData[0].Date === '2026-10-10');
    const sundayPost = timesheetPosts.find(post => post.TimesheetData[0].Date === '2026-10-04');
    check(saturdayPost?.UserId === 53 && saturdayPost.StatusUpdaterId === 53 && saturdayPost.TimesheetStatus === 'New' && saturdayPost.IsRequestFromLogTime === true && saturdayPost.WeekStartDate === '2026-10-10' && saturdayPost.SubmitterId === null, 'PMS timesheet request matches the required envelope');
    check(saturdayPost.TimesheetData[0].TimesheetId === 0 && saturdayPost.TimesheetData[0].ProjectId === 751 && saturdayPost.TimesheetData[0].TaskId === 333521 && saturdayPost.TimesheetData[0].Hours === 1.5 && saturdayPost.TimesheetData[0].Remark === 'Saturday work', 'Worklog is logged to the exact-key PMS ticket in an assigned project with hours and comment');
    check(sundayPost?.TimesheetData[0].Hours === 1 && sundayPost.TimesheetData[0].Remark === 'Sunday work', 'Worklog hours are converted from Jira seconds');
    check(jiraWorklogEntries.every(entry => entry.checkbox.disabled && !entry.checkbox.checked) && jiraWorklogRows.rows[0].textContent.includes('Logged 1.5h to #333521') && jiraWorklogLogBtn.disabled, 'Logged entries are marked and cannot be logged twice');
    timesheetPosts.length = 0;
    worklogPmsTicketMissing = true;
    jiraWorklogLoadBtn.click();
    await settle(() => !jiraWorklogLoadBtn.disabled && jiraWorklogMessage.textContent.includes('2 Jira worklog entries'));
    jiraWorklogEntries[1].checkbox.click();
    jiraWorklogLogBtn.click();
    await settle(() => !jiraWorklogLogging && jiraWorklogMessage.textContent.includes('failed'));
    check(!timesheetPosts.length && jiraWorklogRows.rows[1].textContent.includes('No PMS ticket found for JIRA-1001') && jiraWorklogMessage.dataset.tone === 'error', 'Missing PMS ticket is reported without posting time');
    check(!jiraWorklogEntries[1].checkbox.disabled && jiraWorklogEntries[1].checkbox.checked, 'Failed entry stays selected for retry');
    worklogPmsTicketMissing = false;
    timesheetFailure = true;
    jiraWorklogLogBtn.click();
    await settle(() => !jiraWorklogLogging && jiraWorklogMessage.textContent.includes('failed'));
    check(timesheetPosts.length === 1 && jiraWorklogRows.rows[1].textContent.includes('Timesheet is locked for this week.'), 'PMS error message is shown on the failed entry');
    timesheetFailure = false;
    closeTab.click();
    check(closeTab.getAttribute('aria-selected') === 'true' && !closePanel.hidden && closeSubmitBtn.disabled && closeDueDate.disabled && closeSourceList.checked && !closeListSource.hidden && closeJiraSource.hidden, 'Close tab defaults to the PMS ticket list with fields disabled until a ticket is loaded');
    mode = 'closeTicketMissing';
    closeRefreshBtn.click();
    await settle(() => !closeListLoading);
    check(closeTicketSelect.disabled && closeTicketSelect.options.length === 1 && closeStatus.textContent.includes('No open PMS tickets'), 'Close dropdown reports when no open tickets are assigned');
    mode = 'closeTicket';
    closeRefreshBtn.click();
    await settle(() => !closeListLoading);
    const closeOptionIds = Array.from(closeTicketSelect.options).map(option => option.value);
    check(closeOptionIds.join(',') === ',333892,333889' && closeTicketSelect.options[2].textContent.includes('JIRA-3001 : Close me') && !closeTicketSelect.disabled, 'Refresh lists only open PMS tickets assigned to the user in the selected project');
    check(closeSubmitBtn.disabled && closeTicketSelect.value === '', 'No ticket is preselected after the list loads');
    closeTicketSelect.value = '333889';
    closeTicketSelect.dispatchEvent(new Event('change'));
    await settle(() => closeStatus.textContent.includes('Loaded PMS ticket #333889'));
    const today = formatLocalDate(new Date());
    check(closeDueDate.value === '2026-10-20' && closeActualEndDate.value === today && closeEstimatedHours.value === '8' && closeSpentHours.value === '4.5' && closeDoneRatio.value === '100', 'Selecting a ticket prefills due date, actual end (today when empty), estimate, spent time, and Done % 100');
    check(closeCurrentStatus.textContent === 'Dev In Progress', 'Selecting a ticket shows its current PMS status');
    check(!closeDueDate.disabled && !closeEstimatedHours.disabled && closeSpentHours.readOnly && !closeSubmitBtn.disabled && closeTicket.textContent.includes('#333889'), 'Close fields are editable while spent time stays read-only');
    closeActualEndDate.value = '2025-09-01';
    closeSubmitBtn.click();
    check(!closePosts.length && closeStatus.textContent.includes('cannot be earlier than the start date'), 'Actual end date before the start date is rejected without posting');
    closeActualEndDate.value = '2026-10-16';
    closeDueDate.value = '2026-10-18';
    closeEstimatedHours.value = '6';
    closeSubmitBtn.click();
    check(projectSelect.disabled, 'Shared Project cannot change while a Close update is being submitted');
    await settle(() => !closeSubmitting && closeStatus.dataset.tone === 'success');
    check(!projectSelect.disabled, 'Shared Project unlocks after the Close update');
    const closePayload = closePosts[0]?.[0];
    check(closePosts.length === 1 && closePosts[0].length === 1 && closePayload.id === 333889 && closePayload.status_id === 5 && closePayload.done_ratio === '100' && closePayload.UserID === 53, 'Close submits the ticket with status 5, Done % 100, and the user ID');
    check(closePayload.due_date === '2026-10-18' && closePayload.actual_end_date === '2026-10-16' && closePayload.estimated_hours === 6 && !('spent_hours' in closePayload) && closePayload.HoursDetails.SpentTime === null, 'Close submits edited dates and estimate without spent time');
    check(closePayload.lock_version === 3 && closePayload.category_id === 9 && closePayload.target_version_id === 851 && closePayload.created_on === '2026-10-15T19:04:51.1833333' && closePayload.start_date === '2025-10-01' && closePayload.Watchers[0] === 53 && closePayload.identifier === '', 'Close preserves loaded ticket fields in the update');
    check(closeStatus.textContent.includes('#333889 is closed') && closeSubmitBtn.disabled, 'Close confirms success and prevents resubmitting');
    const closedLink = closeStatus.querySelector('a.ticket-link');
    check(closedLink?.textContent === '#333889' && closedLink.href === 'https://sap-pms.einfochips.com/issues/333889' && closedLink.target === '_blank', 'Closed ticket number in the success message links to the PMS ticket');
    check(!Array.from(closeTicketSelect.options).some(option => option.value === '333889') && closeTicketSelect.value === '', 'Closed ticket is removed from the dropdown');
    mode = 'closeTicketReject';
    closeRefreshBtn.click();
    await settle(() => !closeListLoading);
    closeTicketSelect.value = '333889';
    closeTicketSelect.dispatchEvent(new Event('change'));
    await settle(() => closeStatus.textContent.includes('Loaded PMS ticket #333889'));
    closeSubmitBtn.click();
    await settle(() => !closeSubmitting && closeStatus.dataset.tone === 'error');
    check(closeStatus.textContent.includes('Ticket was modified by another user.') && !closeSubmitBtn.disabled, 'PMS update error is shown and the user can retry');
    closeRefreshBtn.click();
    await settle(() => !closeListLoading && closeStatus.textContent.includes('Loaded PMS ticket #333889'));
    check(closeTicketSelect.value === '333889', 'Refresh keeps the selected ticket when it is still open');
    closeSourceJira.click();
    check(closeListSource.hidden && !closeJiraSource.hidden && !closeTicketData && closeSubmitBtn.disabled && closeCurrentStatus.textContent === '\u2014', 'Choosing Jira ID shows the Jira field and clears the loaded ticket');
    mode = 'closeTicketMissing';
    closeJiraKey.value = 'jira-3001';
    closeFetchBtn.click();
    await settle(() => closeStatus.dataset.tone === 'error');
    check(closeStatus.textContent.includes('No PMS ticket found for JIRA-3001') && closeSubmitBtn.disabled, 'Close by Jira ID reports a missing PMS ticket');
    mode = 'closeTicketOtherProject';
    closeFetchBtn.click();
    await settle(() => closeStatus.dataset.tone === 'error');
    check(closeStatus.textContent.includes('No PMS ticket found for JIRA-3001 in Project 1') && !closeTicketData, 'Close by Jira ID rejects a match that exists only in another project');
    mode = 'closeTicket';
    closeFetchBtn.click();
    await settle(() => closeStatus.textContent.includes('Loaded PMS ticket #333889'));
    check(closeJiraKey.value === 'JIRA-3001' && closeDueDate.value === '2026-10-20' && !closeSubmitBtn.disabled && closeCurrentStatus.textContent === 'Dev In Progress', 'Close by Jira ID loads the matching PMS ticket and its current status');
    check(closeTicketData.ticket.project.id === 751, 'Close by Jira ID ignores another project with the same Jira key');
    await loadCloseTickets();
    check(closeTicketData?.ticket.taskId === 333889 && closeStatus.textContent.includes('Loaded PMS ticket #333889'), 'Refreshing the list does not clear a ticket loaded by Jira ID');
    const closePostsBeforeJira = closePosts.length;
    closeSubmitBtn.click();
    await settle(() => !closeSubmitting && closeStatus.dataset.tone === 'success');
    check(closePosts.length === closePostsBeforeJira + 1 && closePosts.at(-1)[0].id === 333889 && closePosts.at(-1)[0].status_id === 5 && closeStatus.textContent.includes('#333889 is closed'), 'Close by Jira ID submits the same close update');
    closeSourceList.click();
    check(!closeListSource.hidden && closeJiraSource.hidden, 'Choosing PMS ticket list shows the dropdown again');
    mode = 'validation';
    activateTab(createTab);
    await loadAssignedWorkStatus();
    const requestsBeforeTabSwitch = requests.length;
    statusTab.click();
    check(statusTab.getAttribute('aria-selected') === 'true' && createPanel.hidden && !statusPanel.hidden, 'Status tab opens the assigned-work panel');
    check(requests.length === requestsBeforeTabSwitch, 'Switching to Status does not issue another network request');
    check(assignmentRows.rows.length === 6 && assignmentRows.rows[0].textContent.includes('#333521') && assignmentRows.rows[0].textContent.includes('#333522') && assignmentRows.rows[0].textContent.includes('#333527'), 'Jira key maps all matching open and closed PMS tickets, including keys in longer subjects');
    check(assignmentRows.rows[0].textContent.includes('In Progress') && assignmentRows.rows[0].textContent.includes('New'), 'Matched row shows current Jira and PMS statuses');
    const pmsSubject = assignmentRows.rows[0].querySelector('.pms-subject');
    check(pmsSubject?.textContent === 'JIRA-1001 : Main ticket' && pmsSubject.title === 'JIRA-1001 : Main ticket', 'PMS ticket subject appears below its ID with full text on hover');
    const summaryPreview = assignmentRows.rows[0].querySelector('.jira-description');
    check(summaryPreview?.textContent === 'Assigned Jira issue title for the status table.' && summaryPreview.title === summaryPreview.textContent, 'Jira summary/title is shown with its full value available on hover');
    check(assignmentRows.rows[1].querySelector('.missing-mark')?.textContent === '\u2718' && assignmentRows.rows[1].textContent.includes('To Do'), 'Jira issue without a PMS match shows a red cross and Jira status');
    const statusCreateBtn = assignmentRows.rows[1].querySelector('.create-from-status');
    check(statusCreateBtn?.textContent === 'Create' && assignmentRows.rows[1].cells[3].contains(statusCreateBtn) && !assignmentRows.rows[1].cells[1].querySelector('button') && !assignmentRows.rows[0].querySelector('.create-from-status'), 'Create button appears in the PMS status column only for Jira issues without a PMS ticket');
    const createFetchStart = requests.length;
    const savedCreateFields = [jiraKeyInput, subjectInput, startDateInput, actualStartDateInput, dueDateInput, hoursInput].map(input => input.value);
    statusCreateBtn.click();
    check(createTab.getAttribute('aria-selected') === 'true' && !createPanel.hidden && jiraKeyInput.value === 'JIRA-1002', 'Create button opens the Create tab with the Jira key');
    await settle(() => !jiraLoading);
    check(requests.slice(createFetchStart).some(request => request.url.includes('/rest/api/2/issue/JIRA-1002')), 'Create button fetches details for that Jira issue');
    jiraFailed = false;
    [jiraKeyInput, subjectInput, startDateInput, actualStartDateInput, dueDateInput, hoursInput].forEach((input, index) => { input.value = savedCreateFields[index]; });
    statusDiv.innerText = '';
    updateFormState();
    statusTab.click();
    check(assignmentRows.rows[2].textContent.includes('#333523') && assignmentRows.rows[2].textContent.includes('Review'), 'PMS ticket assigned to the user is associated by Jira key');
    check(assignmentRows.rows[3].textContent.includes('JIRA-1006') && assignmentRows.rows[3].textContent.includes('#333528') && assignmentRows.rows[3].cells[3].textContent === 'Closed' && !assignmentRows.rows[3].querySelector('.missing-mark, .create-from-status'), 'Active Jira with only a closed PMS ticket shows its ticket and Closed status, without a missing mark or Create button');
    check(assignmentRows.rows[4].textContent.includes('JIRA-1005') && assignmentRows.rows[4].textContent.includes('#333525') && assignmentRows.rows[4].textContent.includes('Selected for Development'), 'Open PMS ticket includes current Jira status even when Jira is assigned to another user');
    check(assignmentRows.rows[4].querySelector('.jira-description')?.title === 'PMS-linked Jira title for another assignee.', 'Jira summary is also shown for PMS-linked Jira issues assigned to others');
    check(assignmentRows.rows[5].querySelector('.missing-mark')?.getAttribute('aria-label') === 'No Jira ID in PMS subject' && assignmentRows.rows[5].textContent.includes('#333526') && assignmentRows.rows[5].querySelector('.pms-subject')?.title === 'PMS-only ticket without a Jira key', 'Open PMS-only ticket shows Jira cross, PMS ID, and subject');
    check(!assignmentRows.textContent.includes('JIRA-1004') && !assignmentRows.textContent.includes('#333524'), 'Closed Jira issue without an open PMS ticket and its closed PMS ticket are hidden');
    check(assignmentRows.rows[2].textContent.includes('Closed') && assignmentRows.rows[2].textContent.includes('#333523'), 'Closed Jira issue remains visible when it has an open PMS counterpart');
    const requestsBeforeRefresh = requests.length;
    statusRefreshBtn.click();
    await settle(() => requests.length > requestsBeforeRefresh && !statusRefreshBtn.disabled);
    check(requests.length > requestsBeforeRefresh, 'Refresh button explicitly reloads assigned-ticket data');
    check(assignmentMessage.textContent === 'Showing 6 active assigned Jira/PMS items; 5 have a matching PMS ticket.', 'Status summary counts both open and closed PMS matches');
    mode = 'pmsOverlappingStatusResults';
    await loadAssignedWorkStatus();
    const firstPmsLinks = Array.from(assignmentRows.rows[0].cells[1].querySelectorAll('a')).map(link => link.textContent);
    check(firstPmsLinks.length === 3 && new Set(firstPmsLinks).size === 3 && firstPmsLinks.includes('#333521') && firstPmsLinks.includes('#333522') && firstPmsLinks.includes('#333527'), 'Overlapping open/closed results and repeated numeric/string IDs show each PMS ticket once while retaining distinct tickets for the same Jira');
    check(assignmentRows.rows[3].cells[1].querySelectorAll('a').length === 1 && assignmentRows.rows[3].cells[3].textContent === 'Closed', 'Repeated closed PMS ticket is displayed once with its Closed status');
    check(assignmentRows.rows.length === 6 && Array.from(assignmentRows.rows).filter(row => row.textContent.includes('#333526')).length === 1 && assignmentMessage.textContent === 'Showing 6 active assigned Jira/PMS items; 5 have a matching PMS ticket.', 'Overlapping results do not duplicate PMS-only rows or inflate Status counts');
    mode = 'pmsClosedStatusFailure';
    await loadAssignedWorkStatus();
    check(assignmentMessage.textContent.includes('Closed-ticket search unavailable.') && !assignmentRows.querySelector('.create-from-status'), 'Closed-ticket lookup failure is shown instead of treating closed tickets as missing');
    mode = 'pmsStatusFailure';
    let pmsValidationMessage = '';
    try { await fetchAssignedPmsTickets(pmsProjects[0], pmsContext.userId); } catch (error) { pmsValidationMessage = error.message; }
    check(pmsValidationMessage.includes('tracker_id: Invalid tracker filter'), 'PMS 400 field-level validation details are exposed');
    mode = 'pmsTicketsSinglePage';
    let pmsRequestsBefore = requests.filter(request => request.url.includes('/Project/Issue/IssuesByFilterData')).length;
    const assignedTickets = await fetchAssignedPmsTickets(pmsProjects[0], pmsContext.userId);
    let pmsRequestsUsed = requests.filter(request => request.url.includes('/Project/Issue/IssuesByFilterData')).length - pmsRequestsBefore;
    check(assignedTickets.length === 12 && pmsRequestsUsed === 1, 'PMS assigned tickets load in a single request when within requested page size');
    mode = 'pmsTicketsTruncated';
    pmsRequestsBefore = requests.filter(request => request.url.includes('/Project/Issue/IssuesByFilterData')).length;
    let truncatedMessage = '';
    try { await fetchAssignedPmsTickets(pmsProjects[0], pmsContext.userId); } catch (error) { truncatedMessage = error.message; }
    pmsRequestsUsed = requests.filter(request => request.url.includes('/Project/Issue/IssuesByFilterData')).length - pmsRequestsBefore;
    check(pmsRequestsUsed === 1 && truncatedMessage.includes('No additional page requests were sent'), 'Truncated PMS response reports incomplete data without paging request loops');
    mode = 'validation';
    mode = 'jiraPagination';
    const pagedJiraIssues = await fetchAssignedJiraIssues();
    check(pagedJiraIssues.map(issue => issue.key).join(',') === 'JIRA-2001,JIRA-2002', 'Jira enhanced search collects issues across token-based pages');
    mode = 'validation';
    statusTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    check(createTab.getAttribute('aria-selected') === 'true' && !createPanel.hidden && statusPanel.hidden && subjectInput.value === 'TEST-1 : Task', 'Keyboard navigation returns to Create without losing form data');
    const originalSessionReader = chrome.scripting.executeScript;
    const originalTabQuery = chrome.tabs.query;
    const attemptedTabs = [];
    chrome.tabs.query = async () => [
      { id: 5, url: 'https://sap-pms.einfochips.com/stale', active: false, status: 'complete', lastAccessed: 20 },
      { id: 6, url: 'https://sap-pms.einfochips.com/current', active: false, status: 'complete', lastAccessed: 10 }
    ];
    chrome.scripting.executeScript = async options => {
      attemptedTabs.push(options.target.tabId);
      if (options.target.tabId === 5) throw new Error('Site access denied to this tab.');
      return [{ result: { token: 'valid-session', userId: 53, projectId: 751 } }];
    };
    const fallbackContext = await getPmsAuthContext();
    check(attemptedTabs.join(',') === '5,6' && fallbackContext.token === 'valid-session', 'Unreadable PMS tab falls back to the next recently used loaded PMS tab');
    chrome.tabs.query = originalTabQuery;
    chrome.scripting.executeScript = originalSessionReader;
    pmsAccessGranted = false;
    const requestCountBeforeGrant = requests.length;
    setTabsLocked(true);
    await loadPmsProjects();
    check(!pmsReady && requests.length === requestCountBeforeGrant, 'PMS API calls wait until site access is granted');
    check([createTab, statusTab, wsrTab, jiraWorklogTab].every(tab => tab.disabled) && createPanel.hidden, 'All tabs stay disabled until access is granted');
    jiraUrlInput.value = 'not a url';
    accessBtn.click();
    check(!requestedPmsOrigins && accessMessage.textContent.includes('valid https Jira URL'), 'Invalid Jira URL is rejected before requesting access');
    jiraUrlInput.value = 'https://jira.example.com/browse/ABC-1';
    accessBtn.click();
    await settle(() => pmsReady);
    check(requestedPmsOrigins.includes('https://sap-pms.einfochips.com/*') && requestedPmsOrigins.includes('https://sap-pms.einfochips.com:50000/*') && requestedPmsOrigins.includes('https://jira.example.com/*'), 'User grants Jira and PMS origins in one request');
    check(saved.jiraBaseUrl === 'https://jira.example.com' && jiraBaseUrl === 'https://jira.example.com', 'Jira URL is normalized to its origin and stored');
    check(!createTab.disabled && statusTab.getAttribute('aria-selected') === 'true' && !statusPanel.hidden, 'Tabs unlock after access is granted and open on Status');
    check(!accessBar.open && accessSummaryState.textContent.includes('jira.example.com'), 'Site access section collapses and shows the granted Jira host');
    const pmsUrlInput = document.getElementById('pmsUrlInput');
    check(pmsUrlInput.readOnly && pmsUrlInput.value === 'https://sap-pms.einfochips.com', 'PMS URL is shown read-only');
    await reset();
    check(projectSelect.options.length === 13, 'Loads all project pages');
    check(pmsWorkflow.tracker_id === 9 && pmsWorkflow.default_status_id === 11 && pmsWorkflow.priority_id === 7, 'Fixed Development and default priority ignore saved workflow overrides');
    check(!document.getElementById('trackerSelect') && !document.getElementById('prioritySelect') && document.getElementById('taskStatusSelect'), 'Status is selectable while tracker and priority stay fixed');
    check(taskStatusSelect.value === '11' && taskStatusSelect.options.length === 3, 'Status defaults correctly and includes only allowed initial statuses');
    check(getRequiredDonePercentField(pmsMetadata, pmsWorkflow.tracker_id, 12)?.column === 'done_ratio', 'In Progress metadata maps Done % to done_ratio');
    taskStatusSelect.value = '12';
    submitBtn.click();
    await settle(() => !submitting);
    check(posted.done_ratio === 0 && statusDiv.innerText.includes('Mock validation error'), 'In Progress posts default Done % as zero without a UI field');
    await reset();
    let invalidDefaultsBlocked = false;
    try { resolvePmsWorkflow({ ...metadata(751), IssueStatus: { Data: [] } }); } catch (error) { invalidDefaultsBlocked = true; }
    check(invalidDefaultsBlocked, 'Invalid fixed workflow defaults block creation');
    check(ownerSelect.value === '53' && ownerSelect.options[1].textContent === 'Owner 751', 'Nested user ID/name mapping retained');
    for (const [select, label] of [[ownerSelect, 'owner'], [versionSelect, 'target version'], [categorySelect, 'category']]) {
      const selected = select.value;
      const requestCount = requests.length;
      select.value = '';
      submitBtn.click();
      check(!posted && requests.length === requestCount && statusDiv.innerText.includes(`Select a valid ${label}`), `Missing ${label} blocks search and creation`);
      check(select.required && select.validity.valueMissing, `${label} has required field semantics`);
      select.value = selected;
    }
    check(getCreatedTaskId({ Data: { Id: 333458, Subject: 'TEST-1 : Task', ProjectId: 999, Identifier: 'PROJECT_751' } }, { subject: 'TEST-1 : Task' }, { projectId: 751, identifier: 'PROJECT_751' }) === null, 'Conflicting project identifiers cannot open a task');
    for (const date of ['31-02-2026', '2026-02-29', '2026-13-01', '2026-10-01garbage']) check(toYYYYMMDD(date) === '', `Rejects invalid date ${date}`);
    check(toYYYYMMDD('2024-02-29') === '2024-02-29', 'Accepts leap day');
    hoursInput.value = '-1';
    submitBtn.click();
    check(!posted && statusDiv.innerText.includes('nonnegative'), 'Invalid hours prevent POST');
    hoursInput.value = '1.25';
    dueDateInput.value = '2026-09-01';
    submitBtn.click();
    check(!posted && statusDiv.innerText.includes('earlier'), 'Invalid date ordering prevents POST');
    dueDateInput.value = '2026-10-15';
    pmsMetadata.IssueCustomFields.Data = [{ Id: 104, Name: 'Approval Type', IsRequired: true, Trackers: [9] }];
    validateProjectWorkflow({ tracker_id: 9, status_id: 11, subject: 'TEST-1 : Task', CustomValues: [] });
    check(!posted, 'Approval Type metadata does not reject an empty CustomValues payload locally');
    pmsMetadata.WorkflowFields.Data[0].FieldStaus.required = ['description'];
    submitBtn.click();
    check(!posted && statusDiv.innerText.includes('unsupported field'), 'Unsupported workflow requirements fail closed');
    pmsMetadata.WorkflowFields.Data[0].FieldStaus.required = [1];
    mode = 'punctuatedSubject';
    subjectInput.value = 'LAMARR-6672 : CSMBS-854 | [BT] Official BTD binary release [V1.0.69]';
    submitBtn.click();
    await settle(() => !submitting);
    check(!posted && statusDiv.innerText.includes('Duplicate ticket #333458'), 'Jira-key search detects duplicate punctuation-heavy subject even when full-title search misses it');
    const duplicateLink = statusDiv.querySelector('a.ticket-link');
    check(duplicateLink?.textContent === '#333458' && duplicateLink.href === 'https://sap-pms.einfochips.com/issues/333458' && duplicateLink.target === '_blank', 'Duplicate ticket number links to the existing PMS ticket');
    check(JSON.parse(requests.filter(request => request.url.includes('SearchGlobal')).at(-1).options.body).SearchText === 'LAMARR-6672', 'Search uses Jira key instead of punctuation-heavy title');
    subjectInput.value = 'LAMARR-6672 : Another unique task';
    const partialMatch = await findDuplicatePmsTicket(subjectInput.value, pmsContext);
    check(partialMatch?.Id === 333458, 'Same Jira key blocks creation despite a different complete subject');
    const confirmationMatch = await findDuplicatePmsTicket(subjectInput.value, pmsContext, true);
    check(confirmationMatch === null, 'Postcreation confirmation still requires exact subject rather than just Jira key');
    mode = 'keyVariants';
    const embeddedMatch = await findDuplicatePmsTicket(subjectInput.value, pmsContext);
    check(embeddedMatch?.Id === 333460, 'Embedded Jira key matches case-insensitively; prefix IDs, other projects, and documents are ignored');
    subjectInput.value = 'TEST-1 : Task';
    for (const duplicateMode of ['duplicate', 'duplicatePage', 'searchFailure']) {
      mode = duplicateMode;
      submitBtn.click();
      await settle(() => !submitting);
      check(!posted && !submitBtn.disabled, `${duplicateMode} blocks creation and permits correction`);
    }
    mode = 'snapshot';
    submitBtn.click();
    check(subjectInput.disabled && fetchBtn.disabled && ownerSelect.disabled && taskStatusSelect.disabled, 'Locks editing during duplicate check');
    taskStatusSelect.value = '12';
    subjectInput.value = 'Changed after submit';
    startDateInput.value = '2026-10-09';
    releaseSearch();
    await settle(() => !submitting);
    check(posted.subject === 'TEST-1 : Task' && posted.start_date === '2026-10-01' && posted.tracker_id === 9 && posted.status_id === 11 && posted.priority_id === 7, 'POST uses immutable complete payload and default selected status');
    check(statusDiv.innerText.includes('ending must remain visible'), 'Validation errors are not truncated');
    for (const failureMode of ['networkFailure', 'serverFailure', 'businessFailure', 'missingId', 'ambiguous', 'navigationFailure']) {
      await reset();
      mode = failureMode;
      submitBtn.click();
      await settle(() => submissionLocked);
      check(submitBtn.disabled && !closed && !opened, `${failureMode} never claims navigated success or permits unsafe retry`);
    }
    await reset();
    mode = 'fallback';
    submitBtn.click();
    await settle(() => opened);
    check(!closed, 'Search-confirmed creation keeps the sidebar open');
    check(opened.url === 'https://sap-pms.einfochips.com/issues/333458', 'Search confirms actual task instead of unrelated response ID');
    await reset();
    mode = 'success';
    submitBtn.click();
    await settle(() => opened);
    check(!closed && submissionLocked && submitBtn.disabled, 'Successful creation keeps the sidebar open and prevents duplicate resubmission');
    check(opened.active && opened.url.endsWith('/333458'), 'Verified issue response opens active task tab');
    await reset();
    taskStatusSelect.value = '12';
    mode = 'nestedSuccess';
    submitBtn.click();
    await settle(() => opened);
    check(!closed, 'Creation with selected status keeps the sidebar open');
    check(posted.status_id === 12, 'User-selected initial status is sent in BulkPostTicket payload');
    await reset();
    mode = 'nestedSuccess';
    const searchCountBefore = requests.filter(request => request.url.includes('SearchGlobal')).length;
    submitBtn.click();
    await settle(() => opened);
    check(!closed, 'Nested creation response keeps the sidebar open');
    check(opened.active && opened.url === 'https://sap-pms.einfochips.com/issues/333474', 'Confirmed nested BulkPostTicket response opens returned issue ID');
    check(requests.filter(request => request.url.includes('SearchGlobal')).length === searchCountBefore + 1, 'Nested success needs only the precreation duplicate search, not postcreation indexing');
    let nestedFailureRejected = false;
    try {
      getCreatedTaskId({ Status: 200, Type: 0, Data: [{ Status: 500, Type: 1, Message: 'Inner failure', Data: [{ id: 333474 }] }] }, { subject: 'TEST-1 : Task' }, { projectId: 751, identifier: 'PROJECT_751' });
    } catch (error) { nestedFailureRejected = true; }
    check(nestedFailureRejected, 'Nested business failure cannot be mistaken for created task');
    await reset();
    mode = 'closeTicket';
    closeSourceJira.click();
    closeJiraKey.value = 'JIRA-3001';
    await fetchCloseTicketByJiraKey();
    check(Boolean(closeTicketData), 'Project-change test starts with a loaded Close ticket');
    mode = 'validation';
    const projectChangeRequestStart = requests.length;
    projectSelect.value = '752';
    projectSelect.dispatchEvent(new Event('change'));
    check(!closeTicketData && closeSubmitBtn.disabled && !assignmentRows.children.length && !closeTickets.length, 'Changing the shared project immediately clears old Status rows and loaded Close data');
    await settle(() => pmsReady && !statusRefreshBtn.disabled && !closeListLoading && assignmentRows.children.length > 0);
    const projectChangeRequests = requests.slice(projectChangeRequestStart).filter(request => request.url.includes('/Project/Issue/IssuesByFilterData'));
    check(projectChangeRequests.length === 3 && projectChangeRequests.every(request => JSON.parse(request.options.body).request.find(filter => filter.ColumnName === 'project_id')?.ConditionValue?.join(',') === '752' && request.options.headers.projectidentifier === 'PROJECT_752'), 'Project change automatically refreshes Status open/closed and Close open tickets for only the new project');
    check(!assignmentRows.textContent.includes('#333521') && !closeTickets.length && ownerSelect.options[1].textContent === 'Owner 752' && saved['pmsLastProject:53'] === 752, 'New project uses its own fields, ticket lists, and saved selection');
    projectSelect.value = '';
    const noProjectRequestStart = requests.length;
    await selectPmsProject();
    check(!pmsReady && !closeTicketData && !closeTickets.length && !assignmentRows.children.length && assignmentMessage.textContent.includes('Select a PMS project') && closeStatus.textContent.includes('Select a PMS project') && requests.length === noProjectRequestStart, 'Clearing Project clears scoped data and prompts for selection without network calls');
    mode = 'projectFieldsFailure';
    projectSelect.value = '752';
    await selectPmsProject();
    check(!pmsReady && pmsStatusDiv.dataset.tone === 'error' && assignmentMessage.textContent.includes('Could not load the selected project') && closeStatus.dataset.tone === 'error' && !closeTicketData, 'Project field errors remain visible globally and prevent stale scoped results');
    mode = 'validation';
    projectSelect.value = '751';
    await selectPmsProject();
    closeSourceList.click();
    mode = 'pmsProjectScopeRace';
    const oldStatus = loadAssignedWorkStatus();
    const oldCloseList = loadCloseTickets();
    await settle(() => releaseTicketSearches.length === 2);
    projectSelect.value = '752';
    await selectPmsProject();
    const newProjectRows = assignmentRows.textContent;
    releaseTicketSearches.forEach(release => release());
    await Promise.all([oldStatus, oldCloseList]);
    check(assignmentRows.textContent === newProjectRows && !assignmentRows.textContent.includes('#333521') && !closeTickets.length && !closeListLoading && !statusRefreshBtn.disabled, 'Delayed Status and Close responses from the previous project cannot overwrite the current project');
    mode = 'closeTicket';
    projectSelect.value = '751';
    await selectPmsProject();
    mode = 'closeTicketEditRace';
    closeTicketSelect.value = '333889';
    const oldCloseDetails = loadSelectedCloseTicket();
    await settle(() => Boolean(releaseCloseDetails));
    mode = 'validation';
    projectSelect.value = '752';
    await selectPmsProject();
    releaseCloseDetails();
    await oldCloseDetails;
    check(!closeTicketData && closeSubmitBtn.disabled && closeTicket.textContent === '\u2014', 'Delayed Close details from the previous project cannot enable closing its ticket in the new project');
    await reset();
    mode = 'projectRace';
    projectSelect.value = '752';
    const older = selectPmsProject();
    projectSelect.value = '753';
    await selectPmsProject();
    releaseProject();
    await older;
    check(ownerSelect.options[1].textContent === 'Owner 753' && saved['pmsLastProject:53'] === 753, 'Stale project responses cannot overwrite fields or saved project');
    let releaseJira;
    window.fetch = async input => {
      const old = String(input).includes('OLD-1');
      if (old) await new Promise(resolve => { releaseJira = resolve; });
      return new Response(JSON.stringify({ fields: { summary: old ? 'Old' : 'New', created: '2026-10-01' } }), { status: 200 });
    };
    const oldJira = fetchJiraDetails('OLD-1');
    await fetchJiraDetails('NEW-2');
    releaseJira();
    await oldJira;
    check(subjectInput.value === 'NEW-2 : New', 'Stale Jira responses cannot overwrite newest issue');
    window.fetch = async () => new Response('{}', { status: 404 });
    await fetchJiraDetails('BAD-3');
    check(!subjectInput.value && submitBtn.disabled, 'Failed Jira fetch clears data and blocks creation');
    check(statusDiv.innerText.includes('session may have expired') && statusDiv.innerText.includes('issue key'), 'Jira 404 explains both session and issue access possibilities');
    for (const [status, key, expected] of [
      [401, 'UNAUTHENTICATED-1', 'session has expired'],
      [403, 'FORBIDDEN-1', 'cannot access FORBIDDEN-1']
    ]) {
      window.fetch = async () => new Response(JSON.stringify({}), { status, headers: { 'content-type': 'application/json' } });
      await fetchJiraDetails(key);
      check(statusDiv.innerText.includes(expected) && submitBtn.disabled, `Jira ${status} shows relevant login/access error`);
    }
    window.fetch = async () => new Response('<html><form><input type="password"></form></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    await fetchJiraDetails('LOGIN-REDIRECT-1');
    check(statusDiv.innerText.includes('session is not logged in or has expired') && submitBtn.disabled, 'HTTP 200 login page is recognized as an expired Jira session');
    return { passed: results.length, results, liveRequests: 0 };
  } finally {
    window.fetch = original.fetch;
    window.chrome = original.chrome;
    window.close = original.close;
  }
}