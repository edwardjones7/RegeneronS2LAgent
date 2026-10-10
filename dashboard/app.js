// Coordinator dashboard. Reads the backend's read API (session cookie auth) and refreshes live.
(() => {
  const POLL_MS = 4000;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, cls = 'i sm') => `<svg class="${cls}" aria-hidden="true"><use href="#${name}"/></svg>`;

  const STATUS = {
    booked:      { label: 'Booked',        cls: 'b-ok',   icon: 'check', color: 'var(--ok)' },
    calling:     { label: 'On call',       cls: 'b-live', icon: null,    color: 'var(--brand)' },
    needs_human: { label: 'Needs a human', cls: 'b-warn', icon: 'hand',  color: 'var(--warn)' },
    emergency:   { label: 'Emergency',     cls: 'b-risk', icon: 'alert', color: 'var(--risk)' },
    no_answer:   { label: 'No answer',     cls: 'b-info', icon: 'clock', color: 'var(--info)' },
    queued:      { label: 'Queued',        cls: 'b-info', icon: 'clock', color: 'var(--info)' },
    not_a_fit:   { label: 'Not a fit',     cls: 'b-mute', icon: null,    color: 'var(--mute)' },
    opted_out:   { label: 'Opted out',     cls: 'b-mute', icon: 'ban',   color: 'var(--text-3)' },
    closed:      { label: 'Closed',        cls: 'b-mute', icon: null,    color: 'var(--border)' },
    new:         { label: 'New',           cls: 'b-mute', icon: null,    color: 'var(--border)' },
  };
  const BAR_ORDER = ['booked', 'needs_human', 'emergency', 'calling', 'no_answer', 'queued', 'not_a_fit', 'opted_out', 'closed'];
  const FILTERS = [
    { id: 'all', label: 'All', match: () => true },
    { id: 'booked', label: 'Booked', match: (s) => s === 'booked' },
    { id: 'attention', label: 'Needs attention', match: (s) => s === 'needs_human' || s === 'emergency' },
    { id: 'calling', label: 'On call', match: (s) => s === 'calling' },
    { id: 'retry', label: 'Retrying', match: (s) => s === 'no_answer' || s === 'queued' },
    { id: 'not_a_fit', label: 'Not a fit', match: (s) => s === 'not_a_fit' },
    { id: 'opted_out', label: 'Opted out', match: (s) => s === 'opted_out' },
    { id: 'closed', label: 'Closed', match: (s) => s === 'closed' },
  ];

  const state = { campaigns: [], campaignId: null, overview: null, leads: [], filter: 'all', search: '', leadId: null, detailKey: '', callTab: null, lastOk: 0 };

  // ------------------------------------------------------------ formatting
  const parseT = (iso) => (iso ? new Date(iso) : null);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  function fmtTime(iso, withSecs = false) {
    const d = parseT(iso); if (!d) return '—';
    const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', ...(withSecs ? { second: '2-digit' } : {}) });
    return sameDay(d, new Date()) ? t : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${t}`;
  }
  function ago(iso) {
    const d = parseT(iso); if (!d) return '';
    const m = Math.round((Date.now() - d) / 60000);
    if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60); return h < 24 ? `${h} hr ago` : `${Math.round(h / 24)} d ago`;
  }
  function fmtSecs(s) {
    if (s == null) return '—';
    if (s < 1) return '<1s';
    if (s < 90) return `${Math.round(s)}s`;
    if (s < 5400) return `${Math.round(s / 60)} min`;
    return `${(s / 3600).toFixed(1)} hr`;
  }
  const fmtDur = (s) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
  const initials = (l) => ((l.first_name || '?')[0] + ((l.last_name || '')[0] || '')).toUpperCase();
  const fullName = (l) => `${l.first_name}${l.last_name ? ' ' + l.last_name[0] + '.' : ''}`;
  const sourceLabel = (s) => ({ demo_form: 'Demo opt-in form', web_form: 'Web form', mock: 'Mock call', text_test: 'Text test', browser_test: 'Browser test', simulation: 'Simulation' }[s] || s);
  function phoneFmt(p) {
    const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p || '');
    return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (p || '');
  }

  function badge(lead) {
    const st = STATUS[lead.status] || STATUS.new;
    let text = st.label;
    if (lead.status === 'no_answer' && lead.next_attempt_at) text += ` · retry ${fmtTime(lead.next_attempt_at)}`;
    if (lead.status === 'queued' && lead.next_attempt_at) text += ` · calls ${fmtTime(lead.next_attempt_at)}`;
    return `<span class="badge ${st.cls}">${st.icon ? icon(st.icon) : ''}${esc(text)}</span>`;
  }

  // ------------------------------------------------------------ data
  async function api(path) {
    const r = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (r.status === 401) { location.href = '/dashboard/login?next=' + encodeURIComponent(location.pathname); throw new Error('auth'); }
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  }

  async function loadCampaigns() {
    state.campaigns = await api('/campaigns');
    const saved = (() => { try { return localStorage.getItem('cmm.campaign'); } catch { return null; } })();
    state.campaignId = state.campaigns.find((c) => c.id === saved)?.id || state.campaigns[0]?.id;
  }

  async function refresh() {
    if (!state.campaignId) return;
    try {
      const [overview, leads] = await Promise.all([
        api(`/campaigns/${encodeURIComponent(state.campaignId)}`),
        api(`/campaigns/${encodeURIComponent(state.campaignId)}/leads`),
      ]);
      state.overview = overview; state.leads = leads; state.lastOk = Date.now();
      renderHeader(); renderKpis(); renderBar(); renderFilters(); renderRows(); renderAttention(); renderNav();
      if (state.leadId) await loadDetail(false);
    } catch (e) {
      if (e.message !== 'auth') console.warn(e);
    }
    renderLive();
  }

  // ------------------------------------------------------------ render: overview
  function renderNav() {
    const nav = $('campaignNav');
    nav.innerHTML = '<div class="nav-label">Campaigns</div>' + state.campaigns.map((c) => `
      <button class="${c.id === state.campaignId ? 'active' : ''}" data-cid="${esc(c.id)}">
        ${icon('grid', 'i')}<span>${esc(c.study[0].toUpperCase() + c.study.slice(1))}</span>
        ${c.id === state.campaignId ? `<span class="count">${state.leads.length}</span>` : ''}
      </button>`).join('');
    nav.querySelectorAll('button[data-cid]').forEach((b) => b.onclick = () => {
      state.campaignId = b.dataset.cid; state.leadId = null; closeDetail();
      try { localStorage.setItem('cmm.campaign', state.campaignId); } catch {}
      refresh();
    });
  }

  function renderHeader() {
    const c = state.overview.campaign;
    $('crumbs').textContent = `${c.team_name[0].toUpperCase()}${c.team_name.slice(1)} · Campaigns`;
    $('title').textContent = `${c.study_short_name[0].toUpperCase()}${c.study_short_name.slice(1)} study`;
    document.title = `${$('title').textContent} · Call Me Maybe`;
    $('demoFlag').hidden = !c.demo_not_irb_approved;
    $('meta').innerHTML = `
      <span class="live" id="live">Live</span>
      <a href="${esc(c.study_url)}" target="_blank" rel="noopener">${esc(c.nct_id)} ${icon('ext')}</a>
      <span>Calling hours ${esc(c.calling_hours.start)}–${esc(c.calling_hours.end)} (${esc(c.timezone.split('/').pop().replace('_', ' '))})</span>
      <span>Coordinator: ${esc(c.coordinator_name)}</span>`;
  }

  function renderLive() {
    const el = $('live'); if (!el) return;
    const stale = Date.now() - state.lastOk > POLL_MS * 3;
    el.classList.toggle('stale', stale);
    el.textContent = stale ? 'Reconnecting…' : 'Live';
  }

  function renderKpis() {
    const o = state.overview, by = o.by_status || {};
    const total = o.total_leads, booked = by.booked || 0;
    const today = state.leads.filter((l) => parseT(l.created_at) && sameDay(parseT(l.created_at), new Date())).length;
    const attn = o.needs_attention;
    const oldest = attn.map((l) => parseT(l.created_at)).sort((a, b) => a - b)[0];
    $('kpis').innerHTML = `
      <div class="kpi hero"><div class="k">${icon('bolt', 'i')}Median time to first call</div><div class="v">${fmtSecs(o.median_seconds_to_first_call)}</div><div class="d">from opt-in to the phone ringing</div></div>
      <div class="kpi"><div class="k">Leads</div><div class="v">${total}</div><div class="d">${today ? `+${today} today` : 'none today yet'}</div></div>
      <div class="kpi"><div class="k">Reached</div><div class="v">${total ? Math.round((o.reached / total) * 100) : 0}%</div><div class="d">${o.reached} of ${total} picked up</div></div>
      <div class="kpi"><div class="k">Visits booked</div><div class="v">${booked}</div><div class="d">${o.reached ? Math.round((booked / o.reached) * 100) : 0}% of people reached</div></div>
      <div class="kpi ${attn.length ? 'alert' : ''}"><div class="k">Needs a human</div><div class="v">${attn.length}</div><div class="d">${oldest ? `oldest ${ago(oldest.toISOString())}` : 'all clear'}</div></div>`;
  }

  function renderBar() {
    const by = state.overview.by_status || {}, total = state.overview.total_leads || 0;
    $('totalLeads').textContent = `${total} lead${total === 1 ? '' : 's'}`;
    const parts = BAR_ORDER.filter((s) => by[s]);
    $('funnel').innerHTML = parts.map((s) => `<span style="width:${(by[s] / total) * 100}%;background:${STATUS[s].color}" title="${esc(STATUS[s].label)}: ${by[s]}"></span>`).join('');
    $('funnel').setAttribute('aria-label', 'Lead outcomes: ' + parts.map((s) => `${by[s]} ${STATUS[s].label}`).join(', '));
    $('legend').innerHTML = parts.length ? parts.map((s) => `<span><i class="dot" style="background:${STATUS[s].color}"></i>${esc(STATUS[s].label)} <b>${by[s]}</b></span>`).join('') : '<span class="muted">No leads yet. Submit the demo form to start.</span>';
  }

  function renderFilters() {
    const el = $('filters');
    const counts = Object.fromEntries(FILTERS.map((f) => [f.id, state.leads.filter((l) => f.match(l.status)).length]));
    const keepFocus = document.activeElement?.id === 'search';
    el.innerHTML = FILTERS.filter((f) => f.id === 'all' || counts[f.id] || state.filter === f.id).map((f) =>
      `<button class="chip ${state.filter === f.id ? 'on' : ''}" data-f="${f.id}" aria-pressed="${state.filter === f.id}">${esc(f.label)} <span class="n">${counts[f.id]}</span></button>`).join('') +
      `<input class="search" id="search" type="search" placeholder="Search name or phone" aria-label="Search leads" value="${esc(state.search)}">`;
    el.querySelectorAll('.chip').forEach((b) => b.onclick = () => { state.filter = b.dataset.f; renderFilters(); renderRows(); });
    const s = $('search');
    s.oninput = () => { state.search = s.value; renderRows(); };
    if (keepFocus) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }

  function renderRows() {
    const f = FILTERS.find((x) => x.id === state.filter) || FILTERS[0];
    const q = state.search.trim().toLowerCase().replace(/[^\w+ ]/g, '');
    const rows = state.leads.filter((l) => f.match(l.status) && (!q || `${l.first_name} ${l.last_name} ${l.phone}`.toLowerCase().includes(q)));
    $('rows').innerHTML = rows.map((l) => `
      <tr class="row ${l.id === state.leadId ? 'sel' : ''}" data-id="${l.id}" tabindex="0">
        <td><div class="who"><span class="av">${esc(initials(l))}</span><div><div class="n">${esc(fullName(l))}</div><div class="p">${esc(sourceLabel(l.source))} · ${esc(phoneFmt(l.phone))}</div></div></div></td>
        <td class="mono hide-sm">${esc(fmtTime(l.created_at))}</td>
        <td class="mono ${l.seconds_to_first_call != null && l.seconds_to_first_call <= 60 ? 'fast' : ''}">${fmtSecs(l.seconds_to_first_call)}</td>
        <td>${badge(l)}</td>
        <td class="hide-sm mono">${l.attempts}</td>
      </tr>`).join('');
    $('rowsEmpty').hidden = rows.length > 0;
    $('rows').querySelectorAll('tr.row').forEach((tr) => {
      const open = () => openLead(+tr.dataset.id);
      tr.onclick = open;
      tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
  }

  function renderAttention() {
    const items = state.overview.needs_attention.slice().sort((a, b) => (a.status === 'emergency' ? -1 : 0) - (b.status === 'emergency' ? -1 : 0));
    $('attnCount').textContent = items.length;
    $('attn').innerHTML = items.length ? items.map((l) => {
      const emergency = l.status === 'emergency';
      const flag = (l.flags || []).slice(-1)[0];
      const kind = flag?.type === 'emergency' || emergency ? 'emergency' : /medical/i.test(flag?.detail || '') ? 'medical' : 'human';
      const title = kind === 'emergency' ? `${fullName(l)}: possible emergency` : kind === 'medical' ? `${fullName(l)} asked a medical question` : `${fullName(l)} needs a person`;
      const ic = kind === 'emergency' ? ['alert', 'var(--risk-soft)', 'var(--risk)'] : kind === 'medical' ? ['msg', 'var(--warn-soft)', 'var(--warn)'] : ['hand', 'var(--warn-soft)', 'var(--warn)'];
      return `<button class="attn-item" data-id="${l.id}">
        <span class="attn-ic" style="background:${ic[1]};color:${ic[2]}">${icon(ic[0], 'i')}</span>
        <span><span class="t" style="display:block">${esc(title)}</span><span class="s" style="display:block">${esc(flag?.detail || l.status_reason)}</span>
        <span class="w" style="display:block">${esc(phoneFmt(l.phone))} · ${esc(ago(flag?.at ? flag.at + 'Z' : l.created_at))}</span></span></button>`;
    }).join('') : '<div class="empty">Nothing waiting on you.</div>';
    $('attn').querySelectorAll('.attn-item').forEach((b) => b.onclick = () => openLead(+b.dataset.id));
  }

  // ------------------------------------------------------------ render: lead detail
  function openLead(id) {
    state.leadId = id; state.detailKey = ''; state.callTab = null;
    history.pushState({ id }, '', `/dashboard/leads/${id}`);
    renderRows();
    loadDetail(true);
  }

  function closeDetail() {
    state.leadId = null; $('detail').hidden = true; $('detail').innerHTML = '';
    if (location.pathname !== '/dashboard') history.pushState({}, '', '/dashboard');
    renderRows();
  }

  async function loadDetail(scroll) {
    let d;
    try { d = await api(`/leads/${state.leadId}`); } catch (e) {
      if (e.message !== 'auth') { $('detail').hidden = false; $('detail').innerHTML = '<div class="empty">Couldn\'t load this lead.</div>'; }
      return;
    }
    if (d.campaign_id !== state.campaignId && state.campaigns.some((c) => c.id === d.campaign_id)) { state.campaignId = d.campaign_id; refresh(); }
    const key = JSON.stringify(d);
    const audio = $('detail').querySelector('audio');
    if (key === state.detailKey || (audio && !audio.paused)) return; // don't interrupt playback
    state.detailKey = key;
    renderDetail(d);
    if (scroll) $('detail').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  const EVENT_TEXT = {
    lead_received: (e) => `Opted in (${sourceLabel(e.detail.source)})`,
    call_started: (e) => `Call placed${e.detail.attempt > 1 ? ` (attempt ${e.detail.attempt})` : ''}`,
    call_failed_to_start: () => 'Call could not be started',
    answer: (e) => `Answered ${e.detail.question_id.replace(/_/g, ' ')}: “${e.detail.answer}”`,
    screening_complete: (e) => `Screening: ${({ fit: 'looks like a fit', not_a_fit: 'not a fit', needs_review: 'needs review' })[e.detail.result] || e.detail.result}${e.detail.reason ? ` (${e.detail.reason})` : ''}`,
    visit_booked: (e) => `Visit booked for ${new Date(e.detail.starts_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
    sms_sent: (e) => `Text sent to ${e.detail.to}`,
    sms_failed: (e) => `Text to ${e.detail.to} failed`,
    call_ended: (e) => `Call ended${e.detail.duration_secs ? ` after ${fmtDur(e.detail.duration_secs)}` : ''}${e.detail.voicemail ? ' (voicemail left)' : ''}`,
    call_not_connected: (e) => `Call didn't connect (${e.detail.reason})`,
    call_result_missing: () => 'No call result received; handed to the team',
    retry_scheduled: (e) => `Retry scheduled for ${fmtTime(e.detail.at)}`,
    status: (e) => `Status: ${(STATUS[e.detail.status] || { label: e.detail.status }).label}${e.detail.reason && !/^visit /.test(e.detail.reason) ? ` (${e.detail.reason})` : ''}`,
  };

  function renderDetail(d) {
    const el = $('detail'); el.hidden = false;
    const latestByQ = {};
    d.screening.answers.forEach((a) => { latestByQ[a.question_id] = a; });
    const answers = Object.values(latestByQ);
    const calls = d.calls.slice().reverse();
    const call = calls.find((c) => c.id === state.callTab) || calls.find((c) => c.transcript?.length) || calls[0];
    const summary = calls.find((c) => c.summary)?.summary;
    const visit = d.visit ? new Date(d.visit.starts_at_local).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
    const verdictLabel = { fit: 'ok', disqualify: 'no', unsure: 'unsure', info: '' };
    const stateText = { in_progress: 'In progress', fit: 'Looks like a fit', not_a_fit: 'Not a fit', needs_review: 'Needs review' }[d.screening.state];

    el.innerHTML = `
      <div class="detail-h">
        <span class="av" style="width:42px;height:42px">${esc(initials(d))}</span>
        <div><div class="name">${esc(d.first_name)} ${esc(d.last_name)}</div>
          <div class="sub">${esc(phoneFmt(d.phone))} · ${esc(sourceLabel(d.source))} · opted in ${esc(fmtTime(d.created_at))}${d.seconds_to_first_call != null ? ` · called in ${fmtSecs(d.seconds_to_first_call)}` : ''}</div></div>
        <div class="right">${badge(d)}${visit ? `<span class="badge b-ok">${icon('check')}${esc(visit)}</span>` : ''}
          <button class="close" id="closeDetail" aria-label="Close lead details">${icon('x', 'i')}</button></div>
      </div>
      <div class="detail-body">
        <div class="col">
          <p class="lbl">Call summary</p>
          <div class="summary">${summary ? esc(summary) : d.status === 'calling' ? 'Call in progress. The summary appears when it ends.' : 'No summary yet.'}</div>
          ${d.flags.length ? `<p class="lbl">Flags for the team</p><div class="flags">${d.flags.map((f) => `<div class="flag ${f.type === 'emergency' ? 'risk' : ''}"><b>${esc(f.type.replace(/_/g, ' '))}:</b> ${esc(f.detail)}</div>`).join('')}</div>` : ''}
          <p class="lbl">Pre-screen · ${esc(stateText)}${d.screening.bmi ? ` · BMI ${d.screening.bmi}` : ''}</p>
          ${answers.length ? `<table class="qa">${answers.map((a) => `<tr><td class="q">${esc(a.question || a.question_id)}</td><td class="a">${esc(a.answer)}${verdictLabel[a.verdict] ? `<span class="verdict v-${a.verdict}">${verdictLabel[a.verdict]}</span>` : ''}</td></tr>`).join('')}</table>` : '<p class="muted" style="font-size:14px;margin:0 0 18px">No answers yet.</p>'}
          ${d.screening.reason ? `<p class="muted" style="font-size:13px;margin:-8px 0 18px">${esc(d.screening.reason)}</p>` : ''}
          <p class="lbl">Consent</p>
          <dl class="kv"><dt>Given</dt><dd>${d.consent.given ? 'Yes' : 'No'} · ${esc(fmtTime(d.consent.at))}</dd><dt>Wording</dt><dd style="font-weight:400;color:var(--text-2)">${esc(d.consent.text || '—')}</dd></dl>
          <p class="lbl">Activity</p>
          <ul class="timeline">${d.events.map((e) => `<li><span class="tm">${esc(fmtTime(e.at, true))}</span><span>${esc((EVENT_TEXT[e.type] || ((x) => x.type))(e))}</span></li>`).join('')}</ul>
        </div>
        <div class="col">
          <p class="lbl">Calls</p>
          ${calls.length > 1 ? `<div class="call-tabs">${calls.map((c) => `<button class="chip ${c.id === call.id ? 'on' : ''}" data-call="${c.id}">Attempt ${c.attempt_no}${c.duration_secs ? ` · ${fmtDur(c.duration_secs)}` : ''}</button>`).join('')}</div>` : ''}
          ${call ? `
            <p class="muted" style="font-size:13px;margin:0 0 10px">${esc(fmtTime(call.started_at))}${call.duration_secs ? ` · ${fmtDur(call.duration_secs)}` : ''}${call.outcome ? ` · ${esc((STATUS[call.outcome] || { label: call.outcome }).label)}` : call.ended_at ? '' : ' · in progress'}</p>
            ${call.recording_url && call.ended_at ? `<audio controls preload="none" src="${esc(call.recording_url)}"></audio>` : ''}
            <p class="lbl">Transcript</p>
            <div class="tx">${call.transcript?.length ? call.transcript.map((t) => {
              const tools = (t.tool_calls || []).filter(Boolean);
              const msg = (t.message || '').trim();
              return (msg ? `<p class="${t.role === 'agent' ? 'ag' : 'pt'}"><span class="tag">${t.role === 'agent' ? 'AVA' : esc(d.first_name.toUpperCase())}</span>${esc(msg)}</p>` : '') +
                tools.map((n) => `<p class="tool">↳ ${esc(n.replace(/_/g, ' '))}</p>`).join('');
            }).join('') : `<p class="muted" style="font-size:14px">${call.ended_at ? 'No transcript for this call.' : 'Transcript appears when the call ends.'}</p>`}</div>` : '<p class="muted" style="font-size:14px">No calls yet.</p>'}
        </div>
      </div>`;
    $('closeDetail').onclick = closeDetail;
    el.querySelectorAll('[data-call]').forEach((b) => b.onclick = () => { state.callTab = +b.dataset.call; state.detailKey = ''; loadDetail(false); });
  }

  // ------------------------------------------------------------ boot
  window.addEventListener('popstate', () => {
    const m = /\/dashboard\/leads\/(\d+)/.exec(location.pathname);
    if (m) { state.leadId = +m[1]; state.detailKey = ''; loadDetail(false); } else { state.leadId = null; $('detail').hidden = true; }
    renderRows();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.leadId) closeDetail(); });

  (async () => {
    const m = /\/dashboard\/leads\/(\d+)/.exec(location.pathname);
    if (m) state.leadId = +m[1];
    try { await loadCampaigns(); } catch (e) { return; }
    await refresh(); // also loads the lead in the URL, if any
    if (state.leadId) $('detail').scrollIntoView();
    setInterval(refresh, POLL_MS);
  })();
})();
