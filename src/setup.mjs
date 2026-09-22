import { git, tryGit } from './git.mjs';

const NOTES_REFSPEC = '+refs/notes/usegit:refs/notes/usegit';

export function configureRepository(cwd = process.cwd()) {
  git(['config', 'notes.rewriteRef', 'refs/notes/usegit'], { cwd });
  git(['config', 'notes.rewriteMode', 'concatenate'], { cwd });

  const origin = tryGit(['remote', 'get-url', 'origin'], { cwd });
  let notesFetchConfigured = false;

  if (origin) {
    const fetches = tryGit(['config', '--get-all', 'remote.origin.fetch'], { cwd })
      .split('\n')
      .filter(Boolean);

    if (!fetches.includes(NOTES_REFSPEC)) {
      git(['config', '--add', 'remote.origin.fetch', NOTES_REFSPEC], { cwd });
    }
    notesFetchConfigured = true;
  }

  return {
    notesRewriteRef: 'refs/notes/usegit',
    notesRewriteMode: 'concatenate',
    notesFetchConfigured,
  };
}

export { NOTES_REFSPEC };
