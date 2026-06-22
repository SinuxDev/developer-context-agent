import path from 'node:path';
import fs from 'node:fs/promises';
import { Project, SyntaxKind } from 'ts-morph';

export interface SymbolEntry {
  name: string;
  kind: string;
  file: string;
  line?: number;
  exported: boolean;
  imports: string[];
}

export interface SymbolIndex {
  repoPath: string;
  symbols: SymbolEntry[];
  fileIndex: Map<string, SymbolEntry[]>;
  importGraph: Map<string, Set<string>>;
  indexedAt: Date;
}

export async function buildSymbolIndex(repoPath: string, filePaths?: string[]): Promise<SymbolIndex> {
  const absPath = path.resolve(repoPath);
  const project = new Project({
    compilerOptions: { allowJs: true },
    skipAddingFilesFromTsConfig: true,
  });

  const tsFiles = filePaths ?? await findTsFiles(absPath);
  for (const file of tsFiles) {
    const full = path.join(absPath, file);
    try {
      project.addSourceFileAtPath(full);
    } catch {
      // skip unparseable files
    }
  }

  const symbols: SymbolEntry[] = [];
  const fileIndex = new Map<string, SymbolEntry[]>();
  const importGraph = new Map<string, Set<string>>();

  for (const sourceFile of project.getSourceFiles()) {
    const rel = path.relative(absPath, sourceFile.getFilePath()).replace(/\\/g, '/');
    const fileSymbols: SymbolEntry[] = [];
    const imports = new Set<string>();

    for (const imp of sourceFile.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue();
      imports.add(spec);
    }
    importGraph.set(rel, imports);

    for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
      for (const decl of declarations) {
        const kind = SyntaxKind[decl.getKind()];
        const entry: SymbolEntry = {
          name,
          kind,
          file: rel,
          line: decl.getStartLineNumber(),
          exported: true,
          imports: [...imports],
        };
        symbols.push(entry);
        fileSymbols.push(entry);
      }
    }

    sourceFile.forEachChild((node) => {
      if (node.getKind() === SyntaxKind.FunctionDeclaration ||
          node.getKind() === SyntaxKind.ClassDeclaration) {
        const named = node as { getName?: () => string | undefined; getStartLineNumber: () => number };
        const name = named.getName?.();
        if (name) {
          const kind = SyntaxKind[node.getKind()];
          const entry: SymbolEntry = {
            name,
            kind,
            file: rel,
            line: named.getStartLineNumber(),
            exported: false,
            imports: [...imports],
          };
          symbols.push(entry);
          fileSymbols.push(entry);
        }
      }
    });

    fileIndex.set(rel, fileSymbols);
  }

  return {
    repoPath: absPath,
    symbols,
    fileIndex,
    importGraph,
    indexedAt: new Date(),
  };
}

export function searchSymbols(index: SymbolIndex, query: string, maxResults = 20): SymbolEntry[] {
  const q = query.toLowerCase();
  const scored = index.symbols
    .map((s) => {
      let score = 0;
      const nameLower = s.name.toLowerCase();
      if (nameLower === q) score += 100;
      else if (nameLower.includes(q)) score += 50;
      if (s.file.toLowerCase().includes(q)) score += 20;
      if (s.exported) score += 10;
      return { symbol: s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map((x) => x.symbol);
}

async function findTsFiles(repoPath: string): Promise<string[]> {
  const results: string[] = [];
  const ignore = new Set(['node_modules', '.git', 'dist']);

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignore.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        results.push(path.relative(repoPath, full).replace(/\\/g, '/'));
      }
    }
  }

  await walk(repoPath);
  return results;
}
