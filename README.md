# open-okv (Open Knowledge Vault)

Versione self-hosted del **Knowledge Vault** (formato OKF v0.2): archivio di conoscenza con grafo semantico, cattura di risorse e strumenti MCP.
Self-hosted version of **Knowledge Vault** (OKF v0.2): a knowledge base with a semantic graph, resource capture and MCP tooling.

> **Stato: lavori in corso.** Questo repository nasce da [`matrixNeo76/KnowledgeVault`](https://github.com/matrixNeo76/KnowledgeVault) (commit `186beb2`), ripulito da dati personali e configurazione, e **non e' ancora una versione pronta all'uso**. Il codice qui sotto usa ancora Firestore e Gemini; la migrazione e' graduale.

## Obiettivo
| Oggi (derivato dall'originale) | Obiettivo di `open-okv` |
|---|---|
| Firestore (accesso dal browser) | **PostgreSQL 18** come fonte di verita' (`pgvector`, `Apache AGE`), accesso tramite API del server |
| Gemini (Google AI Studio) | **OpenRouter** con ruoli configurabili (modello, parametri, limiti di spesa) da un pannello admin |
| Login Firebase | password admin, collegamento OIDC opzionale |
| App singola | pacchetto replicabile (`docker compose`) con moduli opzionali: OpenViking, Firecrawl, Tika, RustFS |

## Stato della migrazione
- [x] **M1 (parte 1)** schema PostgreSQL, migrazioni e importatore del backup (`server/db`, `server/scripts/importVaultBackup.ts`)
- [ ] M1 (parte 2) livello dati e rotte di lettura
- [ ] M2 client LLM unico (OpenRouter) e registro dei costi
- [ ] M3 frontend senza accesso diretto a Firestore
- [ ] M4 pannello admin e autenticazione
- [ ] M5 ricerca vettoriale e grafo (pgvector, AGE)
- [ ] M6 pacchetto completo e moduli opzionali

## Configurazione e dati
- Nessun dato personale e nessun segreto vanno nel repository. La cartella `data/` e' ignorata da git.
- `firebase-applet-config.json` contiene **solo valori segnaposto**: serve soltanto perche' il codice ancora lo importa e verra' rimosso in M3.
- Variabile d'ambiente per il database: `DATABASE_URL` (mai in chiaro nel repository).

## Sviluppo (provvisorio)
```bash
npm ci
DATABASE_URL=postgres://utente:password@host:5432/knowledge_vault npx tsx server/db/migrate.ts
DATABASE_URL=... npx tsx server/scripts/importVaultBackup.ts percorso/vault-backup.json --dry-run
npm run lint
```
Versioni di riferimento: PostgreSQL 18.6, pgvector 0.8.6, Apache AGE 1.8.0 (la build per PG18 risulta pubblicata come release candidate: il grafo e' sempre ricostruibile dalle tabelle).

La documentazione originale dell'app e' in [`docs/KNOWLEDGEVAULT_README.md`](docs/KNOWLEDGEVAULT_README.md).

## Licenza
[MIT](LICENSE)
