import { runCekikjValidationSuite } from '../testRunner';

async function main() {
  console.log('================================================================');
  console.log('CEKIKJ EPISTEMIC SUITE — TEST DI CERTIFICAZIONE ZERO-GUESSING');
  console.log('================================================================\n');

  const report = await runCekikjValidationSuite();

  report.results.forEach((r, idx) => {
    const symbol = r.passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${idx + 1}. ${symbol} ${r.name}`);
    console.log(`   Pilastro: ${r.pillar}`);
    console.log(`   Esito:    ${r.details}`);
    console.log(`   Latenza:  ${r.durationMs}ms\n`);
  });

  console.log('----------------------------------------------------------------');
  console.log(`Risultato Finale: ${report.passedTests}/${report.totalTests} passati`);
  console.log(`Status: ${report.allPassed ? 'CEKIKJ-COMPLIANT (100%)' : 'NON-COMPLIANT'}`);
  console.log('================================================================');

  if (!report.allPassed) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error running Cekikj test suite:', err);
  process.exit(1);
});
