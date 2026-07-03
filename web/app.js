/* Opsly dashboard — vanilla JS, no build step. */
(() => {
  const main = document.getElementById('main');

  // ---------------------------------------------------------------- helpers
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const age = (iso) => {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    if (h < 48) return `${h}h ${mins % 60}m`;
    return `${Math.floor(h / 24)}d`;
  };

  const toast = (msg, isError = false) => {
    const el = document.createElement('div');
    el.className = 'toast-item' + (isError ? ' error' : '');
    el.textContent = msg;
    document.getElementById('toast').appendChild(el);
    setTimeout(() => el.remove(), 4500);
  };

  const getToken = () => localStorage.getItem('opsly_token') || '';

  async function api(path, opts = {}) {
    const res = await fetch(`/api/v1${path}`, {
      ...opts,
      headers: {
        'content-type': 'application/json',
        ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}),
        ...(opts.headers || {}),
      },
    });
    if (res.status === 401) {
      const token = prompt('This Opsly instance requires an API token (API_TOKEN in .env):');
      if (token) {
        localStorage.setItem('opsly_token', token.trim());
        return api(path, opts);
      }
      throw new Error('API token required');
    }
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
    return body;
  }

  const act = async (fn, successMsg) => {
    try {
      await fn();
      if (successMsg) toast(successMsg);
      render();
    } catch (err) {
      toast(err.message, true);
    }
  };

  const statusBadge = (s) => `<span class="badge ${esc(s)}">${esc(s)}</span>`;
  const urgencyBadge = (u) => `<span class="badge ${esc(u)}">${esc(u)}</span>`;
  const assigneeNames = (i) => (i.assignees || []).map((a) => esc(a.name)).join(', ') || '<span class="muted">unassigned</span>';

  const incidentActions = (i) => {
    if (i.status === 'resolved') return '';
    const btns = [];
    if (i.status === 'triggered') btns.push(`<button class="small" data-act="ack" data-id="${i.id}">Ack</button>`);
    btns.push(`<button class="small" data-act="resolve" data-id="${i.id}">Resolve</button>`);
    btns.push(`<button class="small" data-act="escalate" data-id="${i.id}">Escalate</button>`);
    return `<div class="actions-inline">${btns.join('')}</div>`;
  };

  function bindIncidentActions(root) {
    root.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const { act: action, id } = btn.dataset;
        const path = { ack: 'acknowledge', resolve: 'resolve', escalate: 'escalate' }[action];
        act(() => api(`/incidents/${id}/${path}`, { method: 'POST', body: '{}' }), `Incident ${action === 'ack' ? 'acknowledged' : action + 'd'}`);
      });
    });
  }

  const field = (label, inner, span2 = false) =>
    `<div class="field${span2 ? ' span2' : ''}"><label>${esc(label)}</label>${inner}</div>`;

  const selectHtml = (name, options, opts = {}) => {
    const { multiple = false, allowEmpty = false, emptyLabel = '— none —' } = opts;
    return `<select name="${esc(name)}" ${multiple ? 'multiple' : ''}>
      ${allowEmpty ? `<option value="">${esc(emptyLabel)}</option>` : ''}
      ${options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}
    </select>`;
  };

  const formValues = (form) => {
    const out = {};
    for (const el of form.querySelectorAll('input, select, textarea')) {
      if (!el.name) continue;
      if (el.multiple) out[el.name] = [...el.selectedOptions].map((o) => o.value);
      else out[el.name] = el.value.trim();
    }
    return out;
  };

  // ---------------------------------------------------------------- views
  async function viewIncidents() {
    const showAll = location.hash.includes('all=1');
    const [stats, data, servicesData] = await Promise.all([
      api('/incidents/stats'),
      api(`/incidents${showAll ? '' : '?status=open'}`),
      api('/services'),
    ]);
    const services = servicesData.services;
    main.innerHTML = `
      <div class="rowline">
        <div><h1>Incidents</h1><p class="sub">Trigger, acknowledge, and resolve — here or from Slack with <span class="kbd">/incident</span>.</p></div>
        <div class="pill-toggle">
          <button class="${showAll ? '' : 'on'}" id="f-open">Open</button>
          <button class="${showAll ? 'on' : ''}" id="f-all">All</button>
        </div>
      </div>
      <div class="statbar">
        <div class="stat red"><div class="n">${stats.triggered}</div><div class="l">Triggered</div></div>
        <div class="stat yellow"><div class="n">${stats.acknowledged}</div><div class="l">Acknowledged</div></div>
        <div class="stat green"><div class="n">${stats.resolved_today}</div><div class="l">Resolved (24h)</div></div>
      </div>
      <div class="card">
        <h2 style="margin-top:0">New incident</h2>
        ${services.length ? `
        <form class="grid" id="new-incident">
          ${field('Service', selectHtml('service_id', services.map((s) => ({ value: s.id, label: s.name }))))}
          ${field('Title', '<input name="title" required placeholder="What broke?" />', true)}
          ${field('Urgency', selectHtml('urgency', [{ value: 'high', label: 'High — page on-call' }, { value: 'low', label: 'Low — notify only' }]))}
          <div class="field"><button class="primary" type="submit">Trigger</button></div>
        </form>` : '<p class="muted">Create a service first.</p>'}
      </div>
      <div class="card">
        <table>
          <thead><tr><th>#</th><th>Title</th><th>Service</th><th>Status</th><th>Urgency</th><th>Assigned</th><th>Age</th><th></th></tr></thead>
          <tbody>
            ${data.incidents.map((i) => `
              <tr class="clickable" data-open="${i.id}">
                <td>${i.number}</td>
                <td>${esc(i.title)}</td>
                <td>${esc(i.service.name)}</td>
                <td>${statusBadge(i.status)}</td>
                <td>${urgencyBadge(i.urgency)}</td>
                <td>${assigneeNames(i)}</td>
                <td class="muted">${age(i.created_at)}</td>
                <td>${incidentActions(i)}</td>
              </tr>`).join('') || '<tr><td colspan="8" class="muted">No incidents 🎉</td></tr>'}
          </tbody>
        </table>
      </div>`;

    document.getElementById('f-open')?.addEventListener('click', () => (location.hash = '#/incidents'));
    document.getElementById('f-all')?.addEventListener('click', () => (location.hash = '#/incidents?all=1'));
    bindIncidentActions(main);
    main.querySelectorAll('tr[data-open]').forEach((tr) =>
      tr.addEventListener('click', () => (location.hash = `#/incidents/${tr.dataset.open}`))
    );
    document.getElementById('new-incident')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(e.target);
      act(() => api('/incidents', { method: 'POST', body: JSON.stringify({ ...v, source: 'dashboard' }) }), 'Incident triggered');
    });
  }

  async function viewIncidentDetail(id) {
    const { incident: i, timeline } = await api(`/incidents/${id}`);
    const users = (await api('/users')).users;
    const byId = Object.fromEntries(users.map((u) => [u.id, u.name]));
    main.innerHTML = `
      <p><a href="#/incidents" class="muted">← back to incidents</a></p>
      <div class="rowline">
        <h1>#${i.number} ${esc(i.title)}</h1>
        <div>${statusBadge(i.status)} ${urgencyBadge(i.urgency)}</div>
      </div>
      <p class="sub">${esc(i.service.name)} · opened ${fmtTime(i.created_at)} · ${i.alert_count > 1 ? `${i.alert_count} alerts · ` : ''}source: ${esc(i.source || 'manual')}</p>
      ${i.description ? `<div class="card"><pre style="border:none;background:transparent;padding:0;white-space:pre-wrap">${esc(i.description)}</pre></div>` : ''}
      <div class="card">
        <div class="rowline">
          <div><b>Assigned:</b> ${assigneeNames(i)} <span class="muted">(escalation level ${i.escalation_level}${i.next_escalation_at ? `, escalates ${fmtTime(i.next_escalation_at)}` : ''})</span></div>
          <div class="actions-inline">
            ${incidentActions(i)}
            ${i.status !== 'resolved' ? `<select id="reassign-sel" style="width:auto">${['<option value="">Reassign to…</option>', ...users.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`)].join('')}</select>` : ''}
          </div>
        </div>
      </div>
      <div class="card">
        <h2 style="margin-top:0">Timeline</h2>
        <ul class="timeline">
          ${timeline.map((e) => `<li><span class="t">${fmtTime(e.created_at)}</span><span>${e.type === 'note' ? '📝 ' : ''}${esc(e.message || e.type)}${e.actor_user_id ? ` <span class="muted">— ${esc(byId[e.actor_user_id] || '')}</span>` : ''}</span></li>`).join('')}
        </ul>
        <form id="note-form" style="margin-top:12px;display:flex;gap:8px">
          <input name="content" placeholder="Add a note…" required />
          <button type="submit">Add</button>
        </form>
      </div>`;
    bindIncidentActions(main);
    document.getElementById('reassign-sel')?.addEventListener('change', (e) => {
      if (e.target.value) act(() => api(`/incidents/${i.id}/reassign`, { method: 'POST', body: JSON.stringify({ user_id: e.target.value }) }), 'Reassigned');
    });
    document.getElementById('note-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(e.target);
      act(() => api(`/incidents/${i.id}/notes`, { method: 'POST', body: JSON.stringify(v) }), 'Note added');
    });
  }

  async function viewServices() {
    const [servicesData, policiesData] = await Promise.all([api('/services'), api('/escalation-policies')]);
    const services = servicesData.services;
    const policies = policiesData.escalation_policies;
    const policyName = (id) => policies.find((p) => p.id === id)?.name;
    main.innerHTML = `
      <h1>Services</h1>
      <p class="sub">Each service gets a routing key for the Events API — point Prometheus, Grafana, Datadog, or cron scripts at it.</p>
      <div class="card">
        <h2 style="margin-top:0">New service</h2>
        <form class="grid" id="new-service">
          ${field('Name', '<input name="name" required placeholder="e.g. Checkout API" />')}
          ${field('Escalation policy', selectHtml('escalation_policy_id', policies.map((p) => ({ value: p.id, label: p.name })), { allowEmpty: true }))}
          ${field('Slack channel ID', '<input name="slack_channel_id" placeholder="C0123456789 (optional)" />')}
          ${field('Default urgency', selectHtml('default_urgency', [{ value: 'high', label: 'High' }, { value: 'low', label: 'Low' }]))}
          <div class="field"><button class="primary" type="submit">Create</button></div>
        </form>
      </div>
      ${services.map((s) => `
        <div class="card">
          <div class="rowline">
            <div>
              <b>${esc(s.name)}</b> <span class="muted">· ${s.escalation_policy_id ? `policy: ${esc(policyName(s.escalation_policy_id) || '?')}` : 'no escalation policy'} · default ${esc(s.default_urgency)}</span>
              ${s.description ? `<div class="muted">${esc(s.description)}</div>` : ''}
            </div>
            <button class="small danger" data-del="${s.id}">Delete</button>
          </div>
          <div style="margin-top:10px">
            ${s.integrations.map((ig) => `<div class="mono">🔑 ${esc(ig.name)}: <code>${esc(ig.routing_key)}</code></div>`).join('')}
          </div>
        </div>`).join('') || '<p class="muted">No services yet.</p>'}`;

    document.getElementById('new-service').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(e.target);
      if (!v.escalation_policy_id) delete v.escalation_policy_id;
      act(() => api('/services', { method: 'POST', body: JSON.stringify(v) }), 'Service created');
    });
    main.querySelectorAll('button[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        if (confirm('Delete this service and its incidents?'))
          act(() => api(`/services/${b.dataset.del}`, { method: 'DELETE' }), 'Service deleted');
      })
    );
  }

  async function viewSchedules() {
    const [schedulesData, usersData, oncalls] = await Promise.all([api('/schedules'), api('/users'), api('/oncalls')]);
    const users = usersData.users;
    const ocBySchedule = Object.fromEntries(oncalls.oncalls.map((o) => [o.schedule_id, o]));
    const tzList = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['UTC'];
    main.innerHTML = `
      <h1>Schedules</h1>
      <p class="sub">Rotations hand off at a local time in the schedule's timezone (DST-safe). Overrides let people swap shifts — also via <span class="kbd">/opsly override</span> in Slack.</p>
      <div class="card">
        <h2 style="margin-top:0">New schedule</h2>
        <form class="grid" id="new-schedule">
          ${field('Name', '<input name="name" required placeholder="e.g. Platform primary" />')}
          ${field('Timezone', `<input name="timezone" list="tzlist" value="UTC" /><datalist id="tzlist">${tzList.map((z) => `<option value="${esc(z)}">`).join('')}</datalist>`)}
          ${field('Rotation', selectHtml('rotation_type', [{ value: 'weekly', label: 'Weekly' }, { value: 'daily', label: 'Daily' }, { value: 'custom', label: 'Custom length' }]))}
          ${field('Shift length (hours, custom only)', '<input name="shift_length_hours" type="number" min="1" value="168" />')}
          ${field('Handoff time', '<input name="handoff_time" type="time" value="09:00" />')}
          ${field('First shift date', `<input name="anchor_date" type="date" value="${new Date().toISOString().slice(0, 10)}" />`)}
          ${field('Members (rotation order = selection order)', selectHtml('user_ids', users.map((u) => ({ value: u.id, label: u.name })), { multiple: true }), true)}
          <div class="field"><button class="primary" type="submit">Create</button></div>
        </form>
        <p class="muted" style="margin-bottom:0">Tip: hold Ctrl/Cmd to select multiple members.</p>
      </div>
      ${schedulesData.schedules.map((s) => {
        const oc = ocBySchedule[s.id];
        return `
        <div class="card">
          <div class="rowline">
            <div><b><a href="#/schedules/${s.id}" style="color:inherit">${esc(s.name)}</a></b>
              <span class="muted">· ${esc(s.timezone)} · ${s.layers.length} layer(s)</span></div>
            <div>${oc?.user ? `On call: <b>${esc(oc.user.name)}</b>${oc.source === 'override' ? ' <span class="badge override">override</span>' : ''}` : '<span class="muted">nobody on call</span>'}</div>
          </div>
        </div>`;
      }).join('') || '<p class="muted">No schedules yet.</p>'}`;

    document.getElementById('new-schedule').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(e.target);
      const layer = {
        rotation_type: v.rotation_type,
        handoff_time: v.handoff_time || '09:00',
        anchor_date: v.anchor_date,
        user_ids: v.user_ids,
      };
      if (v.rotation_type === 'custom') layer.shift_length_hours = parseInt(v.shift_length_hours, 10);
      act(
        () => api('/schedules', { method: 'POST', body: JSON.stringify({ name: v.name, timezone: v.timezone || 'UTC', layers: [layer] }) }),
        'Schedule created'
      );
    });
  }

  async function viewScheduleDetail(id) {
    const [{ schedule, shifts, overrides }, usersData] = await Promise.all([api(`/schedules/${id}?days=14`), api('/users')]);
    const users = usersData.users;
    const byId = Object.fromEntries(users.map((u) => [u.id, u.name]));
    main.innerHTML = `
      <p><a href="#/schedules" class="muted">← back to schedules</a></p>
      <div class="rowline">
        <h1>🗓️ ${esc(schedule.name)}</h1>
        <button class="danger small" id="del-schedule">Delete schedule</button>
      </div>
      <p class="sub">${esc(schedule.timezone)} · ${schedule.layers.map((l) => `${esc(l.name)}: ${esc(l.rotation_type)} @ ${esc(l.handoff_time)}${l.restriction_start ? ` (${esc(l.restriction_start)}–${esc(l.restriction_end)})` : ''}`).join(' · ')}</p>
      <div class="card">
        <h2 style="margin-top:0">Next 14 days</h2>
        <table>
          <thead><tr><th>Who</th><th>From</th><th>Until</th><th></th></tr></thead>
          <tbody>
            ${shifts.map((s) => `<tr><td><b>${esc(byId[s.user_id] || '?')}</b></td><td>${fmtTime(s.start)}</td><td>${fmtTime(s.end)}</td><td>${s.source === 'override' ? '<span class="badge override">override</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nobody on call in this window.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="card">
        <h2 style="margin-top:0">Overrides</h2>
        <form class="grid" id="new-override">
          ${field('Who covers', selectHtml('user_id', users.map((u) => ({ value: u.id, label: u.name }))))}
          ${field('From', '<input name="start_at" type="datetime-local" required />')}
          ${field('Until', '<input name="end_at" type="datetime-local" required />')}
          <div class="field"><button class="primary" type="submit">Add override</button></div>
        </form>
        <table style="margin-top:10px">
          <tbody>
            ${overrides.map((o) => `<tr><td><b>${esc(byId[o.user_id] || '?')}</b></td><td>${fmtTime(o.start_at)} → ${fmtTime(o.end_at)}</td><td><button class="small danger" data-del-ov="${o.id}">Remove</button></td></tr>`).join('') || '<tr><td class="muted">No upcoming overrides.</td></tr>'}
          </tbody>
        </table>
      </div>`;

    document.getElementById('del-schedule').addEventListener('click', () => {
      if (confirm('Delete this schedule?'))
        act(async () => {
          await api(`/schedules/${id}`, { method: 'DELETE' });
          location.hash = '#/schedules';
        }, 'Schedule deleted');
    });
    document.getElementById('new-override').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(e.target);
      act(
        () =>
          api(`/schedules/${id}/overrides`, {
            method: 'POST',
            body: JSON.stringify({
              user_id: v.user_id,
              start_at: new Date(v.start_at).toISOString(),
              end_at: new Date(v.end_at).toISOString(),
            }),
          }),
        'Override created'
      );
    });
    main.querySelectorAll('button[data-del-ov]').forEach((b) =>
      b.addEventListener('click', () => act(() => api(`/overrides/${b.dataset.delOv}`, { method: 'DELETE' }), 'Override removed'))
    );
  }

  async function viewPolicies() {
    const [policiesData, usersData, schedulesData] = await Promise.all([api('/escalation-policies'), api('/users'), api('/schedules')]);
    const users = usersData.users;
    const schedules = schedulesData.schedules;
    const userName = (id) => users.find((u) => u.id === id)?.name || '?';
    const scheduleName = (id) => schedules.find((s) => s.id === id)?.name || '?';

    const levelRow = (i) => `
      <div class="level-row">
        <h4>Level ${i}${i === 1 ? ' (paged immediately)' : ''}</h4>
        <div class="grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
          ${field('People', selectHtml(`l${i}_users`, users.map((u) => ({ value: u.id, label: u.name })), { multiple: true }))}
          ${field('Schedule', selectHtml(`l${i}_schedule`, schedules.map((s) => ({ value: s.id, label: s.name })), { allowEmpty: true }))}
          ${field('Escalate after (min)', `<input name="l${i}_timeout" type="number" min="1" value="15" />`)}
        </div>
      </div>`;

    main.innerHTML = `
      <h1>Escalation policies</h1>
      <p class="sub">Who gets paged, and what happens if they don't acknowledge in time.</p>
      <div class="card">
        <h2 style="margin-top:0">New policy</h2>
        <form id="new-policy">
          <div class="grid" style="margin-bottom:12px">
            ${field('Name', '<input name="name" required placeholder="e.g. Platform standard" />')}
            ${field('Repeat all levels if unacknowledged', selectHtml('repeat_count', [0, 1, 2, 3].map((n) => ({ value: String(n), label: n === 0 ? 'Never' : `${n}×` }))))}
          </div>
          ${levelRow(1)}${levelRow(2)}${levelRow(3)}
          <button class="primary" type="submit">Create policy</button>
        </form>
      </div>
      ${policiesData.escalation_policies.map((p) => `
        <div class="card">
          <div class="rowline">
            <b>${esc(p.name)}</b>
            <button class="small danger" data-del="${p.id}">Delete</button>
          </div>
          <div style="margin-top:8px">
            ${p.levels.map((l) => `
              <div>· <b>L${l.level_index}</b>:
                ${l.targets.map((t) => (t.target_type === 'user' ? esc(userName(t.target_id)) : `🗓️ ${esc(scheduleName(t.target_id))}`)).join(', ')}
                <span class="muted">— escalate after ${l.timeout_minutes}m</span>
              </div>`).join('')}
            ${p.repeat_count ? `<div class="muted">repeats ×${p.repeat_count}</div>` : ''}
          </div>
        </div>`).join('') || '<p class="muted">No policies yet.</p>'}`;

    document.getElementById('new-policy').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(e.target);
      const levels = [];
      for (const i of [1, 2, 3]) {
        const targets = [
          ...(v[`l${i}_users`] || []).map((id) => ({ target_type: 'user', target_id: id })),
          ...(v[`l${i}_schedule`] ? [{ target_type: 'schedule', target_id: v[`l${i}_schedule`] }] : []),
        ];
        if (targets.length) levels.push({ timeout_minutes: parseInt(v[`l${i}_timeout`], 10) || 15, targets });
      }
      act(
        () =>
          api('/escalation-policies', {
            method: 'POST',
            body: JSON.stringify({ name: v.name, repeat_count: parseInt(v.repeat_count, 10) || 0, levels }),
          }),
        'Policy created'
      );
    });
    main.querySelectorAll('button[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        if (confirm('Delete this policy?')) act(() => api(`/escalation-policies/${b.dataset.del}`, { method: 'DELETE' }), 'Policy deleted');
      })
    );
  }

  async function viewUsers() {
    const users = (await api('/users')).users;
    main.innerHTML = `
      <h1>Users</h1>
      <p class="sub">Anyone who touches Opsly in Slack is linked automatically. Add people here if you want to schedule them before they've used it.</p>
      <div class="card">
        <form class="grid" id="new-user">
          ${field('Name', '<input name="name" required />')}
          ${field('Email', '<input name="email" type="email" placeholder="links their Slack account" />')}
          ${field('Timezone', '<input name="timezone" value="UTC" />')}
          <div class="field"><button class="primary" type="submit">Add user</button></div>
        </form>
      </div>
      <div class="card">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Slack</th><th>Timezone</th><th></th></tr></thead>
          <tbody>
            ${users.map((u) => `
              <tr>
                <td><b>${esc(u.name)}</b></td>
                <td class="muted">${esc(u.email || '—')}</td>
                <td>${u.slack_user_id ? '✅ linked' : '<span class="muted">not linked</span>'}</td>
                <td class="muted">${esc(u.timezone)}</td>
                <td><button class="small danger" data-del="${u.id}">Remove</button></td>
              </tr>`).join('') || '<tr><td colspan="5" class="muted">Nobody yet.</td></tr>'}
          </tbody>
        </table>
      </div>`;
    document.getElementById('new-user').addEventListener('submit', (e) => {
      e.preventDefault();
      act(() => api('/users', { method: 'POST', body: JSON.stringify(formValues(e.target)) }), 'User added');
    });
    main.querySelectorAll('button[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        if (confirm('Remove this user?')) act(() => api(`/users/${b.dataset.del}`, { method: 'DELETE' }), 'User removed');
      })
    );
  }

  async function viewHelp() {
    let routingKey = 'YOUR_ROUTING_KEY';
    try {
      const services = (await api('/services')).services;
      routingKey = services[0]?.integrations?.[0]?.routing_key || routingKey;
    } catch { /* fine */ }
    main.innerHTML = `
      <h1>Setup &amp; API</h1>
      <p class="sub">Everything here can also be driven from Slack — see <span class="kbd">/incident help</span>.</p>
      <div class="card">
        <h2 style="margin-top:0">Slack commands</h2>
        <pre>/incident               open the new-incident form
/incident list          open incidents (+ service name to filter)
/incident 42            show #42 with actions
/incident ack 42        acknowledge   ·  /incident resolve 42
/incident note 42 &lt;txt&gt; add a note    ·  /incident assign 42 @user
/oncall                 who is on call right now
/opsly status           open-incident summary
/opsly service create   new service    ·  /opsly schedule create
/opsly override         cover a shift  ·  /opsly policy create</pre>
      </div>
      <div class="card">
        <h2 style="margin-top:0">Events API (PagerDuty-compatible)</h2>
        <p class="muted">Point monitoring tools at <code>POST /api/v1/events</code> with a service routing key. Repeated triggers with the same <code>dedup_key</code> fold into one incident; <code>resolve</code> closes it.</p>
        <pre>curl -X POST ${esc(location.origin)}/api/v1/events \\
  -H 'Content-Type: application/json' \\
  -d '{
    "routing_key": "${esc(routingKey)}",
    "event_action": "trigger",
    "dedup_key": "db-primary-cpu",
    "payload": {
      "summary": "DB primary CPU > 95%",
      "source": "prometheus",
      "severity": "critical"
    }
  }'</pre>
        <p class="muted">Then auto-resolve when the alert clears:</p>
        <pre>curl -X POST ${esc(location.origin)}/api/v1/events \\
  -H 'Content-Type: application/json' \\
  -d '{"routing_key": "${esc(routingKey)}", "event_action": "resolve", "dedup_key": "db-primary-cpu"}'</pre>
      </div>
      <div class="card">
        <h2 style="margin-top:0">REST API</h2>
        <p class="muted">Full CRUD under <code>/api/v1</code>: users, services, schedules (+overrides), escalation-policies, incidents (+ack/resolve/escalate/reassign/notes), oncalls. Send <code>Authorization: Bearer $API_TOKEN</code> when a token is configured.</p>
        <div class="actions-inline">
          <button id="set-token">Set API token for this browser</button>
          <button id="clear-token">Clear stored token</button>
        </div>
      </div>`;
    document.getElementById('set-token').addEventListener('click', () => {
      const t = prompt('API token:');
      if (t) { localStorage.setItem('opsly_token', t.trim()); toast('Token saved'); }
    });
    document.getElementById('clear-token').addEventListener('click', () => {
      localStorage.removeItem('opsly_token');
      toast('Token cleared');
    });
  }

  // ------------------------------------------------------------- sidebar oncall
  async function refreshMiniOncall() {
    try {
      const { oncalls } = await api('/oncalls');
      const el = document.getElementById('oncall-mini');
      el.innerHTML =
        '<div style="margin-bottom:6px;font-weight:600">On call now</div>' +
        (oncalls.slice(0, 5).map((o) => `<div class="oc-line">${esc(o.schedule_name)}: <b>${esc(o.user?.name || 'nobody')}</b></div>`).join('') ||
          '<div class="oc-line muted">no schedules</div>');
    } catch { /* token prompt already handled elsewhere */ }
  }

  // ---------------------------------------------------------------- router
  const routes = [
    [/^#\/incidents\/([\w-]+)$/, (m) => viewIncidentDetail(m[1])],
    [/^#\/incidents/, () => viewIncidents()],
    [/^#\/services/, () => viewServices()],
    [/^#\/schedules\/([\w-]+)$/, (m) => viewScheduleDetail(m[1])],
    [/^#\/schedules/, () => viewSchedules()],
    [/^#\/policies/, () => viewPolicies()],
    [/^#\/users/, () => viewUsers()],
    [/^#\/help/, () => viewHelp()],
  ];

  async function render() {
    const hash = location.hash || '#/incidents';
    document.querySelectorAll('[data-nav]').forEach((a) => {
      a.classList.toggle('active', hash.startsWith('#/' + a.dataset.nav));
    });
    for (const [re, fn] of routes) {
      const m = hash.match(re);
      if (m) {
        try {
          await fn(m);
        } catch (err) {
          main.innerHTML = `<div class="card">⚠️ ${esc(err.message)}</div>`;
        }
        refreshMiniOncall();
        return;
      }
    }
    location.hash = '#/incidents';
  }

  window.addEventListener('hashchange', render);
  render();
  setInterval(() => {
    // Live refresh for the incident list while it's visible.
    if ((location.hash || '#/incidents').startsWith('#/incidents') && !document.hidden) render();
  }, 30000);
})();
