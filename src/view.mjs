import fs from 'node:fs';
import path from 'node:path';
import { compactCausalHistory } from './context.mjs';
import { history } from './metadata.mjs';
import { nextExperiment } from './next.mjs';
import { buildReport } from './report.mjs';
import { workStatus } from './work.mjs';

function humanize(value, fallback = 'Untitled change') {
  if (!value) return fallback;
  const text = String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : fallback;
}

function uniqueWork(work) {
  const map = new Map();
  for (const group of Object.values(work ?? {})) {
    if (!Array.isArray(group)) continue;
    for (const row of group) {
      if (row?.id && !map.has(row.id)) map.set(row.id, row);
    }
  }
  return [...map.values()];
}

function latestChanges(commits, work) {
  const rows = [];
  const seen = new Set();
  const workRows = uniqueWork(work);

  for (const commit of commits) {
    const metadata = commit.metadata ?? {};
    if (!metadata.changeId || seen.has(metadata.changeId)) continue;
    seen.add(metadata.changeId);

    const related = workRows.filter((item) => item.experiment && item.experiment === metadata.experiment);
    rows.push({
      id: metadata.changeId,
      title: humanize(metadata.intent, commit.subject),
      subject: commit.subject,
      hypothesis: humanize(metadata.hypothesis, 'No hypothesis recorded'),
      experiment: metadata.experiment ?? null,
      decision: metadata.decision ?? 'pending',
      granularity: metadata.granularity ?? null,
      sha: commit.sha,
      shortSha: commit.sha.slice(0, 8),
      evidenceCount: related.reduce((sum, item) => sum + (item.evidenceCount ?? 0), 0),
      work: related.map((item) => ({
        id: item.id,
        goal: item.goal,
        status: item.status,
        evidenceCount: item.evidenceCount ?? 0,
        awaiting: item.awaiting ?? null,
        decision: item.decision?.outcome ?? item.decision ?? null,
      })),
    });
  }
  return rows;
}

function repoName() {
  return path.basename(process.cwd()) || 'repository';
}

export function buildViewModel({ sync = false } = {}) {
  const commits = history(80);
  const work = workStatus({ sync });
  const report = buildReport();
  const changes = latestChanges(commits, work);
  const activeWork = uniqueWork(work).filter((item) => !['accepted', 'rejected', 'falsified'].includes(item.status));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repository: repoName(),
    head: commits[0]?.sha ?? null,
    summary: {
      changes: changes.length,
      activeWork: activeWork.length,
      awaitingWork: work.awaiting?.length ?? 0,
      evidence: activeWork.reduce((sum, item) => sum + (item.evidenceCount ?? 0), 0),
      structuredCoverage: report.structuredCommitCoverage ?? 0,
      validationErrors: report.validationErrors?.length ?? 0,
    },
    changes,
    work: activeWork,
    causalHistory: compactCausalHistory(commits, 20),
    next: nextExperiment(report),
  };
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function renderView(model) {
  const data = safeJson(model);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${model.repository} · usegit</title>
<style>
:root{color-scheme:dark;--bg:#0b0d10;--panel:#11151a;--line:#252b33;--text:#f5f7fa;--muted:#929baa;--blue:#58a6ff;--cyan:#39d0d8;--green:#52d273;--amber:#e5b454;--red:#ff6b6b;--radius:16px;font:15px/1.45 Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(900px 520px at 68% -10%,#13223a 0,transparent 58%),var(--bg);color:var(--text)}button,input{font:inherit}button{color:inherit}.shell{max-width:1480px;margin:auto;padding:28px}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:10px 2px 28px}.brand{font-size:22px;font-weight:760;letter-spacing:-.03em}.brand span{color:var(--blue)}.repo{margin-top:6px;color:var(--muted);font-size:13px}.summary{display:grid;grid-template-columns:repeat(4,minmax(110px,1fr));gap:8px}.metric{min-width:120px;border-left:1px solid var(--line);padding:2px 18px}.metric b{display:block;font-size:21px;letter-spacing:-.03em}.metric span{font-size:12px;color:var(--muted)}.workspace{display:grid;grid-template-columns:minmax(320px,430px) minmax(0,1fr);min-height:680px;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:rgba(14,17,21,.88);box-shadow:0 30px 90px rgba(0,0,0,.28)}.rail{border-right:1px solid var(--line);background:#0f1216}.rail-head{padding:20px;border-bottom:1px solid var(--line)}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);font-weight:700}.search{width:100%;margin-top:12px;border:1px solid var(--line);background:#0b0e12;color:var(--text);padding:10px 12px;border-radius:9px;outline:none}.search:focus{border-color:#3d5574}.list{padding:8px}.change{width:100%;display:grid;grid-template-columns:12px 1fr auto;gap:12px;align-items:start;text-align:left;border:0;background:transparent;padding:14px 12px;border-radius:10px;cursor:pointer}.change:hover{background:#151a20}.change.active{background:#171e27}.dot{width:8px;height:8px;border-radius:99px;margin-top:7px;background:var(--amber);box-shadow:0 0 0 4px rgba(229,180,84,.09)}.dot.accepted{background:var(--green);box-shadow:0 0 0 4px rgba(82,210,115,.09)}.dot.rejected,.dot.falsified{background:var(--red);box-shadow:0 0 0 4px rgba(255,107,107,.08)}.change-title{font-weight:650;letter-spacing:-.01em}.change-sub{margin-top:4px;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tag{font-size:11px;color:var(--muted);padding-top:2px}.main{padding:34px 38px 46px;min-width:0}.hero{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid var(--line);padding-bottom:26px}.hero h1{margin:6px 0 0;font-size:38px;line-height:1.08;letter-spacing:-.045em;max-width:820px}.status{height:max-content;border:1px solid var(--line);border-radius:999px;padding:7px 11px;font-size:12px;color:var(--muted)}.status.accepted{color:var(--green);border-color:rgba(82,210,115,.25)}.status.rejected,.status.falsified{color:var(--red);border-color:rgba(255,107,107,.25)}.grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(260px,.75fr);gap:28px;margin-top:28px}.section{padding:0 0 26px}.section+.section{border-top:1px solid var(--line);padding-top:24px}.label{color:var(--muted);font-size:12px;margin-bottom:8px}.value{font-size:18px;line-height:1.5;letter-spacing:-.01em}.work-row{display:grid;grid-template-columns:90px 1fr auto;gap:12px;padding:12px 0;border-top:1px solid var(--line);font-size:13px}.work-row:first-child{border-top:0}.work-id{color:var(--blue);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.work-state{color:var(--muted)}.sidecard{border:1px solid var(--line);border-radius:12px;background:var(--panel);padding:18px}.sidecard+.sidecard{margin-top:12px}.side-title{font-size:12px;color:var(--muted);margin-bottom:8px}.big{font-size:28px;font-weight:700;letter-spacing:-.04em}.provenance{margin-top:24px;padding-top:18px;border-top:1px solid var(--line);display:flex;gap:18px;flex-wrap:wrap;color:var(--muted);font:12px ui-monospace,SFMono-Regular,Menlo,monospace}.empty{color:var(--muted);padding:16px 4px}.next{white-space:pre-wrap;word-break:break-word;font-size:13px;color:#c8d0dc}.foot{padding:16px 2px 0;color:#657080;font-size:11px}.accent{color:var(--cyan)}
@media(max-width:900px){.summary{grid-template-columns:repeat(2,1fr)}.workspace{grid-template-columns:1fr}.rail{border-right:0;border-bottom:1px solid var(--line);max-height:320px;overflow:auto}.main{padding:26px 22px}.grid{grid-template-columns:1fr}.hero{flex-direction:column}.hero h1{font-size:31px}}
</style>
</head>
<body>
<div class="shell">
  <header class="top">
    <div><div class="brand">use<span>git</span></div><div class="repo" id="repo"></div></div>
    <div class="summary" id="summary"></div>
  </header>
  <main class="workspace">
    <aside class="rail">
      <div class="rail-head"><div class="eyebrow">Changes</div><input class="search" id="search" placeholder="Filter by intent or experiment"></div>
      <div class="list" id="list"></div>
    </aside>
    <section class="main" id="detail"></section>
  </main>
  <div class="foot">Disposable human projection. Git remains the source of truth.</div>
</div>
<script id="usegit-data" type="application/json">${data}</script>
<script>
const model=JSON.parse(document.getElementById('usegit-data').textContent);
const list=document.getElementById('list');const detail=document.getElementById('detail');const search=document.getElementById('search');
let selected=0;let visible=model.changes;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const stateClass=v=>['accepted','rejected','falsified'].includes(v)?v:'';
function metrics(){const s=model.summary;document.getElementById('repo').textContent=model.repository+' · '+(model.head?model.head.slice(0,8):'no head');document.getElementById('summary').innerHTML=[['changes',s.changes],['active work',s.activeWork],['awaiting',s.awaitingWork],['coverage',Math.round((s.structuredCoverage||0)*100)+'%']].map(([k,v])=>'<div class="metric"><b>'+esc(v)+'</b><span>'+esc(k)+'</span></div>').join('')}
function renderList(){if(!visible.length){list.innerHTML='<div class="empty">No matching causal changes.</div>';detail.innerHTML='';return}selected=Math.min(selected,visible.length-1);list.innerHTML=visible.map((c,i)=>'<button class="change '+(i===selected?'active':'')+'" data-i="'+i+'"><span class="dot '+stateClass(c.decision)+'"></span><span><div class="change-title">'+esc(c.title)+'</div><div class="change-sub">'+esc(c.hypothesis)+'</div></span><span class="tag">'+esc(c.experiment||'')+'</span></button>').join('');list.querySelectorAll('.change').forEach(x=>x.onclick=()=>{selected=Number(x.dataset.i);renderList();renderDetail()});renderDetail()}
function workHtml(rows){if(!rows?.length)return '<div class="empty">No live work linked to this experiment.</div>';return rows.map(w=>'<div class="work-row"><span class="work-id">'+esc(w.id)+'</span><span>'+esc(w.goal||'Work item')+'</span><span class="work-state">'+esc(w.status)+(w.evidenceCount?' · '+w.evidenceCount+' evidence':'')+'</span></div>').join('')}
function renderDetail(){const c=visible[selected];if(!c)return;detail.innerHTML='<div class="hero"><div><div class="eyebrow">'+esc(c.id)+(c.experiment?' · '+esc(c.experiment):'')+'</div><h1>'+esc(c.title)+'</h1></div><div class="status '+stateClass(c.decision)+'">'+esc(c.decision)+'</div></div><div class="grid"><div><div class="section"><div class="label">Why this exists</div><div class="value">'+esc(c.subject)+'</div></div><div class="section"><div class="label">Hypothesis</div><div class="value">'+esc(c.hypothesis)+'</div></div><div class="section"><div class="label">Experiment & evidence</div>'+workHtml(c.work)+'</div></div><aside><div class="sidecard"><div class="side-title">Evidence linked</div><div class="big accent">'+esc(c.evidenceCount)+'</div></div><div class="sidecard"><div class="side-title">Commit boundary</div><div class="big">'+esc(c.granularity||'—')+'</div></div><div class="sidecard"><div class="side-title">Suggested next step</div><div class="next">'+esc(JSON.stringify(model.next,null,2))+'</div></div></aside></div><div class="provenance"><span>commit '+esc(c.shortSha)+'</span><span>change '+esc(c.id)+'</span><span>generated '+esc(model.generatedAt)+'</span></div>'}
search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();visible=model.changes.filter(c=>!q||[c.title,c.hypothesis,c.experiment,c.id].some(v=>String(v||'').toLowerCase().includes(q)));selected=0;renderList()});metrics();renderList();
</script>
</body>
</html>`;
}

export function writeView(output, options = {}) {
  const model = buildViewModel(options);
  const html = renderView(model);
  fs.writeFileSync(output, html);
  return { output: path.resolve(output), bytes: Buffer.byteLength(html), head: model.head };
}
