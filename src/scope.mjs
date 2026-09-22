function clean(value) {
  if (typeof value !== 'string') throw new Error('work scope must be a string');
  let scope = value.trim().replaceAll('\\\\', '/').replace(/^\.\//, '').replace(/\/+/g, '/');
  if (!scope) throw new Error('work scope must not be empty');
  if (scope === '**') return scope;
  scope = scope.replace(/^\//, '').replace(/\/$/, '');
  const star = scope.indexOf('*');
  if (star !== -1 && !(scope.endsWith('/**') && star === scope.length - 2)) {
    throw new Error('work scope supports only exact paths, path/** and **');
  }
  return scope;
}

export function normalizeScopes(scopes = []) {
  return [...new Set(scopes.map(clean))].sort();
}

function shape(scope) {
  const value = clean(scope);
  if (value === '**') return { root: '', tree: true };
  if (value.endsWith('/**')) return { root: value.slice(0, -3), tree: true };
  return { root: value, tree: false };
}

export function scopesOverlap(left, right) {
  const a = shape(left);
  const b = shape(right);
  if (!a.root || !b.root || a.root === b.root) return true;
  return (a.tree && b.root.startsWith(a.root + '/')) ||
    (b.tree && a.root.startsWith(b.root + '/'));
}

export function workConflicts(rows) {
  const active = rows.filter((x) => x.status === 'active').sort((a, b) => a.id.localeCompare(b.id));
  const conflicts = [];
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i], b = active[j];
      if (!a.scopes.length || !b.scopes.length) {
        conflicts.push({ work: [a.id, b.id], reason: 'undeclared-scope', overlaps: [] });
        continue;
      }
      const overlaps = a.scopes.flatMap((left) =>
        b.scopes.filter((right) => scopesOverlap(left, right)).map((right) => [left, right]));
      if (overlaps.length) conflicts.push({ work: [a.id, b.id], reason: 'scope-overlap', overlaps });
    }
  }
  return conflicts;
}
