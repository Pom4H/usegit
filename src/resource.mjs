function cleanName(value) {
  if (typeof value !== 'string') throw new Error('resource name must be a string');
  let name = value.trim().replace(/^\.+|\.+$/g, '').replace(/\.{2,}/g, '.');
  if (!name) throw new Error('resource name must not be empty');
  if (name === '*') return name;
  const star = name.indexOf('*');
  if (star !== -1 && !(name.endsWith('.*') && star === name.length - 1)) {
    throw new Error('semantic resources support only exact names, namespace.* and *');
  }
  return name;
}

function normalizeAccess(value) {
  const access = value ?? 'write';
  if (access !== 'read' && access !== 'write') throw new Error('resource access must be read or write');
  return access;
}

function parseClaim(value) {
  if (typeof value === 'string') {
    const match = value.match(/^(.*?)(?:=(read|write))?$/);
    return { name: cleanName(match[1]), access: normalizeAccess(match[2]) };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('resource claim must be a string or object');
  }
  return { name: cleanName(value.name), access: normalizeAccess(value.access) };
}

export function normalizeResources(resources = []) {
  if (!Array.isArray(resources)) throw new Error('resources must be an array');
  const merged = new Map();
  for (const claim of resources.map(parseClaim)) {
    const previous = merged.get(claim.name);
    merged.set(claim.name, previous === 'write' || claim.access === 'write' ? 'write' : 'read');
  }
  return [...merged.entries()]
    .map(([name, access]) => ({ name, access }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.access.localeCompare(b.access));
}

function shape(value) {
  const name = cleanName(value);
  if (name === '*') return { root: '', tree: true };
  if (name.endsWith('.*')) return { root: name.slice(0, -2), tree: true };
  return { root: name, tree: false };
}

export function resourceNamesOverlap(left, right) {
  const a = shape(left);
  const b = shape(right);
  if (!a.root || !b.root || a.root === b.root) return true;
  return (a.tree && b.root.startsWith(a.root + '.')) ||
    (b.tree && a.root.startsWith(b.root + '.'));
}

export function resourcesConflict(left = [], right = []) {
  const a = normalizeResources(left);
  const b = normalizeResources(right);
  const overlaps = [];

  for (const l of a) {
    for (const r of b) {
      if (!resourceNamesOverlap(l.name, r.name)) continue;
      if (l.access === 'read' && r.access === 'read') continue;
      overlaps.push({
        resource: [l.name, r.name],
        access: [l.access, r.access],
      });
    }
  }

  return overlaps;
}

export function workResourceConflicts(rows) {
  const live = rows
    .filter((x) => ['active', 'awaiting', 'escalated', 'stale'].includes(x.status))
    .sort((a, b) => a.id.localeCompare(b.id));
  const conflicts = [];

  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const overlaps = resourcesConflict(live[i].resources ?? [], live[j].resources ?? []);
      if (overlaps.length) {
        conflicts.push({
          work: [live[i].id, live[j].id],
          reason: 'semantic-resource-overlap',
          overlaps,
        });
      }
    }
  }

  return conflicts;
}
