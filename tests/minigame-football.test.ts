import { it } from 'vitest';
import { writeFileSync } from 'fs';
import { FURNITURE } from '../src/catalog';
it('list', () => {
  const rows = FURNITURE.map((f) => `${f.id}\t${f.name}\t${f.category}\t${(f as any).group ?? ''}\t${f.size.w}x${f.size.d}x${f.size.h}`);
  writeFileSync('/tmp/claude-0/-home-user-dream-house-builder/4194fff9-ae55-5065-843d-024af58b7d9a/scratchpad/team-d/catalog.tsv', rows.join('\n'));
});
