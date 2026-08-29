import * as fs from 'fs';
import * as path from 'path';

export class CofofoPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CofofoPathError';
  }
}

export function resolveInside(root: string, relative: string, mustExist = false): string {
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]+/).includes('..')) {
    throw new CofofoPathError(`Unsafe workspace-relative path: ${relative}`);
  }
  const realRoot = fs.realpathSync(path.resolve(root));
  const absolute = path.resolve(realRoot, relative);
  if (absolute !== realRoot && !absolute.startsWith(realRoot + path.sep)) {
    throw new CofofoPathError(`Path escapes workspace: ${relative}`);
  }

  // Lexical containment is not enough for write targets: an existing parent
  // directory may be a symlink to somewhere outside the workspace. Resolve the
  // nearest existing ancestor before any caller opens or creates the target.
  let ancestor = absolute;
  while (!fs.existsSync(ancestor) && ancestor !== realRoot) ancestor = path.dirname(ancestor);
  const realAncestor = fs.realpathSync(ancestor);
  if (realAncestor !== realRoot && !realAncestor.startsWith(realRoot + path.sep)) {
    throw new CofofoPathError(`Path resolves outside workspace through a symlink: ${relative}`);
  }
  if (!mustExist && fs.existsSync(absolute) && fs.lstatSync(absolute).isSymbolicLink()) {
    throw new CofofoPathError(`Refusing a symlink target: ${relative}`);
  }
  if (mustExist) {
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new CofofoPathError(`Expected a regular file: ${relative}`);
    }
    const real = fs.realpathSync(absolute);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
      throw new CofofoPathError(`Path resolves outside workspace: ${relative}`);
    }
  }
  return absolute;
}

export function writeAtomic(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, file);
}
