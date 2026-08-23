/* eslint-disable @typescript-eslint/no-explicit-any */
declare const require: any;
declare const process: any;
declare const module: any;

import { nebPrograms } from '../src/data/nebGrade12Curriculum';
import { compilerClient } from '../src/compiler/compiler-client';

/**
 * Automated NEB programs compilation script.
 *
 * Usage notes:
 * - This script is intended to be run in a browser-like environment
 *   (Vite dev server / app context) where the compiler worker (Web Worker)
 *   and browser WASM toolchain are available.
 * - If run under Node, the script will attempt to write a report to
 *   ./reports/neb-compile-report.json using the Node fs API, but the
 *   compiler worker likely will not function correctly in Node.
 *
 * Recommended: Run this by importing and calling runNebTests() from the
 * browser dev console while the dev server is running, or bundle it into
 * a temporary UI route that invokes the function. Example:
 *
 *   import { runNebTests } from './scripts/test-neb-programs';
 *   runNebTests();
 */

type NebReportEntry = {
  id: string;
  title: string;
  language: string;
  success: boolean;
  output: string;
  error?: string | null;
  durationMs: number;
};

export async function runNebTests(timeoutMs = 30000) {
  const results: NebReportEntry[] = [];

  for (const p of nebPrograms) {
    // Only compile C programs with the C toolchain; HTML is handled by the preview
    if (p.language !== 'c') {
      results.push({
        id: p.id,
        title: p.title,
        language: p.language,
        success: false,
        output: '',
        error: 'skipped-non-c',
        durationMs: 0,
      });
      continue;
    }
    const start = Date.now();

    let timedOut = false;

    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => {
        timedOut = true;
        reject(new Error('timeout'));
      }, timeoutMs)
    );

    try {
      // Reset compiler worker between runs to avoid stale state
      try {
        compilerClient.terminate();
      } catch (e) {}
      // small delay to ensure worker resources are freed
      await new Promise((r) => setTimeout(r, 200));

      const compilePromise = compilerClient.compile(p.content, '');

      const result = (await Promise.race([
        compilePromise,
        timer,
      ]) as any) as { success: boolean; output: string; error?: string | null };

      results.push({
        id: p.id,
        title: p.title,
        language: p.language,
        success: result.success,
        output: result.output ?? '',
        error: result.error ?? null,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      results.push({
        id: p.id,
        title: p.title,
        language: p.language,
        success: false,
        output: '',
        error: timedOut ? 'timeout' : String(err),
        durationMs: Date.now() - start,
      });
    }
  }

  const reportJson = JSON.stringify(results, null, 2);

  // If running in browser, trigger download
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([reportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'neb-compile-report.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return results;
  }

  // If running in Node, attempt to write to ./reports
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const path = require('path');
    const outDir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'neb-compile-report.json'), reportJson, 'utf-8');
    return results;
  } catch (e) {
    // As a fallback, print to console
    // eslint-disable-next-line no-console
    console.log(reportJson);
    return results;
  }
}

// If executed directly with tsx/node, run the tests and exit.
if (typeof module !== 'undefined' && module && module === (module as any).exports) {
  (async () => {
    // eslint-disable-next-line no-console
    console.log('Starting NEB compilation tests...');
    try {
      const r = await runNebTests();
      // eslint-disable-next-line no-console
      console.log('NEB compile report generated with', r.length, 'entries');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error running NEB tests:', err);
      try { process.exit(1); } catch (e) {}
    }
  })();
}
