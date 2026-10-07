# Roadmap di open-okv

Ultimo aggiornamento: 2026-10-07. Questo documento dice **cosa è già stato fatto**, **cosa resta da fare** e **quali decisioni sono ancora aperte**. Si aggiorna a ogni tappa conclusa.

Legenda: ✅ fatto e verificato · 🟡 in corso · ⬜ da fare · ❓ decisione aperta

## 1. Punto di partenza

`open-okv` nasce da [KnowledgeVault](https://github.com/matrixNeo76/KnowledgeVault) (commit `186beb2`), applicazione per il formato **OKF v0.2** sviluppata con Google AI Studio. L'originale resta funzionante e **non viene modificato**: qui si lavora su una copia ripulita da dati personali e configurazioni.

Cosa fa già l'applicazione ereditata (stack React 19, Express 4, Firestore, Gemini):

- cattura di risorse (URL, testo, file, articoli scientifici, RSS) con pipeline di ingestione specializzate;
- modello dati OKF v0.2 con metadati tipizzati (circa 142 campi) e relazioni tra risorse;
- grafo di conoscenza, analisi "Vault Intelligence", motore multi-agente, esportazione OKF;
- server MCP per agenti esterni, versionamento bitemporale;
- documentazione tecnica in [`docs/`](docs/).

Limiti che si vogliono superare: dati su Firestore (accesso dal browser), un solo fornitore di modelli (Gemini) senza controllo dei costi, dipendenza da Google per login e ricerca web, nessun modo semplice di installarlo altrove.

## 2. Obiettivi

| Area | Oggi | Obiettivo |
|---|---|---|
| Dati | Firestore | **PostgreSQL 18** come unica fonte di verità, con `pgvector` e `Apache AGE` per vettori e grafo (entrambi derivati e ricostruibili) |
| Modelli | Gemini | **OpenRouter** tramite **ruoli** configurabili (modello, riserve, parametri, limiti di spesa) |
| Controllo costi | nessuno | limiti per richiesta, giorno e mese **applicati dal server** prima di ogni chiamata, consumo registrato |
| Accesso | login Firebase | password admin del Vault; collegamento OIDC opzionale |
| Installazione | solo ambiente AI Studio | pacchetto `docker compose` replicabile, con moduli opzionali |
| Agenti | server MCP | copia derivata e a senso unico verso **OpenViking** (opzionale) |

Principi: il database è l'unica fonte di verità; tutto ciò che è derivato (vettori, grafo, copia in OpenViking) si può ricostruire; ogni valore predefinito è **configurabile** da pannello; nessun segreto nel repository; ogni tappa è verificabile e reversibile.

## 3. Fatto

### 3.1 Analisi e progettazione ✅
- ✅ Inventario di **tutti i 25 punti** in cui l'app chiama un modello, con i 3 contenitori centrali di Gemini da sostituire.
- ✅ Prova comparativa dei modelli economici su processi reali, con giudizio alla cieca. Risultati usati per i valori predefiniti (sezione 5).
- ✅ Disegno di schema dati, livello dati, autenticazione, client LLM e pannello admin (tappe M1–M6).
- ✅ Verifica sulle **documentazioni ufficiali** delle versioni in uso (PostgreSQL 18.6, pgvector 0.8.6, Apache AGE 1.8.0) e scelta delle funzioni da sfruttare (sezione 4).

### 3.2 Repository ✅
- ✅ Storia pulita con un solo commit iniziale, senza dati personali, regole Firestore o configurazione reale (`firebase-applet-config.json` contiene solo segnaposto).
- ✅ Licenza **MIT**, `.gitignore` per dati locali, chiavi e file `.env`, README bilingue.

### 3.3 M1, parte 1: schema e importazione ✅
- ✅ Migrazioni numerate ed eseguite una sola volta ciascuna, in transazione (`server/db/migrate.ts`, opzione `--status`).
- ✅ `001_init.sql`: tabelle `resources`, `raw_files`, `raw_file_chunks`, `resource_relations`, `schema_migrations`; indici su utente/data, tipo, URL, tag (GIN), metadati (GIN `jsonb_path_ops`), titolo (trigram) e ricerca testuale.
- ✅ `002_search_and_ids.sql`: id predefiniti `uuidv7()`; ricerca testuale **italiano + inglese** con pesi (titolo, tag, riassunto) e funzione `vault_tsquery` basata su `websearch_to_tsquery`.
- ✅ Importatore idempotente del backup JSON (`server/scripts/importVaultBackup.ts`, opzioni `--dry-run` e `--user-id`): conserva l'utente originale, costruisce le relazioni da `metadata.relations`, verifica conteggi e id.
- ✅ Verifica: 124 risorse e 74 relazioni importate, secondo passaggio senza modifiche, campi identici all'origine.
- ✅ Controlli: build riuscita, 52 test superati, `tsc` con 2 errori noti già presenti nell'originale (`batchMigrationService.ts`).

## 4. Funzioni dei database da sfruttare

| Componente | Funzione | Stato |
|---|---|---|
| PostgreSQL 18 | `uuidv7()` per gli id nuovi | ✅ |
| PostgreSQL 18 | ricerca testuale bilingue | ✅ |
| PostgreSQL 18 | `RETURNING OLD/NEW` per modifiche con valore prima/dopo (conflitti, registro) | ⬜ M1 parte 2 |
| PostgreSQL 18 | autenticazione `scram-sha-256` al posto di MD5 (deprecato) | ⬜ configurazione del server |
| pgvector 0.8.6 | indice HNSW con scansioni iterative (`hnsw.iterative_scan`) per i filtri | ⬜ M5 |
| pgvector 0.8.6 | `halfvec` se l'embedding supera 2.000 dimensioni (limite indice `vector`) | ❓ dipende dal modello |
| pgvector 0.8.6 | ricerca ibrida testo + vettori con fusione RRF, poi rerank | ⬜ M5 |
| Apache AGE 1.8.0 | grafo di conoscenza **derivato** da `resource_relations` | ⬜ M5 |

Nota su AGE: la build per PostgreSQL 18 risulta pubblicata come *release candidate* (`v1.8.0-rc0`). Per questo il grafo non è mai fonte di verità e deve poter essere ricostruito. L'utente applicativo non può eseguire `LOAD 'age'`; `create_graph`, `MATCH`, `MERGE` funzionano comunque. Le migrazioni usano `SET LOCAL search_path TO public`.

## 5. Ruoli dei modelli (valori predefiniti, tutti modificabili)

Il modello si sceglie **per processo**, non globalmente. Ogni ruolo avrà modello, riserve, parametri e limiti propri. I valori seguenti sono solo il punto di partenza: il catalogo di OpenRouter cambia di continuo e tutto sarà modificabile dal pannello admin.

| Ruolo | Modello di partenza | Note |
|---|---|---|
| Estrazione e riassunto | DeepSeek v4.1 Flash | ragionamento disattivato, altrimenti i token di ragionamento troncano la risposta |
| Contesti lunghi | GLM 5.3 Flash | |
| Lettura di PDF e immagini | GPT 6 Luna | da provare su PDF e immagini reali |
| Decisioni | Jev 1.13 / router Jev | API in anteprima, prezzo solo sull'input |
| Generazione di immagini | Seedream 5.0 Flash | prezzo reale per immagine da misurare |
| Rerank | Voyage Rerank 3 Lite | |
| Embedding | `text-embedding-3-small` (1536 dimensioni) | coerente con OpenViking; scelta definitiva in M5 |
| Trascrizione e voce | da definire | modelli con limiti d'uso bassi |

Vincolo di costo: solo modelli economici. I limiti sono imposti dal server, non dall'interfaccia.

## 6. Da fare

### M1, parte 2: livello dati e rotte di lettura ✅ (scritture ⬜)
- ✅ Collegamento condiviso a PostgreSQL (`server/db/pool.ts`), con `search_path` fissato su `public` e password nascosta negli errori.
- ✅ `VaultRepository` (`server/db/vaultRepository.ts`): unico punto che conosce SQL; elenco con filtri (tipo, tag, preferiti), ricerca testuale e 6 ordinamenti, paginazione, lettura per id con relazioni, file grezzi (senza base64 nell'elenco) e pezzi.
- ✅ Rotte di **sola lettura** `/api/data/status`, `/resources`, `/resources/:id`, `/raw-files`, `/raw-files/:id`, `/raw-files/:id/chunks`, con parametri validati (`server/routes/dataRoutes.ts`).
- ✅ Porta configurabile con `PORT` (predefinita 3000).
- ✅ Test (`npm run test:data`): 41 prove, incluso il confronto con il backup di origine (124 risorse, campi e metadati identici).
- ⬜ Scritture (creazione, modifica, cancellazione, operazioni a blocchi) con `RETURNING OLD/NEW`: prossima tappa.
- ⬜ Correzione dei 2 errori `tsc` noti.
- ❓ Ricerca per prefisso: oggi "postgres" non trova "PostgreSQL" (radici diverse). Da decidere se aggiungere la corrispondenza per prefisso.
- Nota: fino a M4 le rotte `/api/data` non hanno autenticazione.

### M2: client LLM unico e ruoli ⬜
- ⬜ `server/llm/llmClient.ts` con `generate({ role, prompt, schema, files? })`; `generateWithGeminiFallback` resta come involucro compatibile finché i 22 chiamanti non sono migrati.
- ⬜ Adattatori OpenRouter per testo e visione, poi PDF/file, decisione (Jev), audio, rerank, immagini, voce, video.
- ⬜ Conversione dagli schemi Gemini (`Type.OBJECT`) a JSON Schema; parametri per ruolo e per modello.
- ⬜ Tabelle `llm_roles` e `llm_usage`; costo letto da `usage.cost` della risposta.
- ⬜ **Limiti di spesa** per richiesta, giorno, mese, frequenza e interruttore di blocco per ruolo, controllati prima di ogni chiamata.
- ⬜ Sostituto della ricerca web di Gemini (SearXNG, da valutare).

### M3: frontend senza Firestore ⬜
- ⬜ Nuovo `src/lib/vaultApi.ts` al posto di `src/lib/firebase.ts`; sostituzione dei 12 file uno alla volta, dal meno rischioso.
- ⬜ Aggiornamento periodico con controllo di versione al posto dei 2 `onSnapshot`; SSE con LISTEN/NOTIFY solo dopo la messa a punto del proxy.
- ⬜ Rimozione di Firebase, di `firebase-applet-config.json` e di `check-firestore.ts`.

### M4: pannello admin e autenticazione ⬜
- ⬜ Password admin con hash in `app_users`, sessione con cookie httpOnly, protezione di `/api/admin/*`.
- ⬜ Pannello LLM: una pagina per ruolo (modello, riserve, parametri, limiti, consumo reale, pulsante di prova).
- ⬜ Predisposizione OIDC (Pocket ID, Authelia, Keycloak o altro), non attiva di default.

### M5: vettori e grafo ⬜
- ⬜ Tabella degli embedding, indice HNSW, ricerca ibrida con RRF e rerank.
- ⬜ Grafo AGE ricostruibile da `resource_relations`.
- ❓ Scelta dell'embedding (dimensioni e costo).

### M6: pacchetto replicabile e moduli ⬜
- ⬜ `docker-compose.yml` con profilo completo: app, PostgreSQL con pgvector e AGE, OpenViking.
- ⬜ Moduli opzionali: Tika, Firecrawl, SearXNG, RustFS (file grandi), provider di identità e posta di prova.
- ⬜ Invio a senso unico a OpenViking per gli agenti.
- ⬜ Prova di installazione da zero su una macchina separata.

### Passaggio dall'originale ⬜
- ⬜ Nuova esportazione del backup dall'app originale subito prima del passaggio, e reimportazione idempotente (il backup attuale ha 3 risorse in meno).
- ⬜ L'istanza nuova gira su una porta propria con un database proprio; l'originale resta in funzione fino alla verifica.

### Trasversale ⬜
- ⬜ Test di integrazione e pipeline CI (tipi, lint, test, build) a ogni tappa.
- ⬜ Messa in sicurezza del database (`scram-sha-256`, accessi limitati all'host dell'app) e dell'API (oggi senza autenticazione dietro il proxy).
- ❓ Gestione dei file di blocco: il progetto usa `bun.lock`, ma `npm ci` richiede `package-lock.json` (oggi ignorato).
- ⬜ Documentazione di installazione e aggiornamento.

## 7. Decisioni aperte
1. Modello di embedding e relative dimensioni (`vector` o `halfvec`).
2. Prezzo reale e qualità per immagini, audio e video: da misurare con prove a basso costo.
3. Sostituto definitivo della ricerca web.
4. Gestione dei file di blocco delle dipendenze.
5. Politica di rilascio delle versioni (tag e changelog) dopo M6.

## 8. Regole di lavoro
- Ogni modifica passa da una pull request su questo repository.
- Nessun dato personale e nessun segreto nel repository.
- Ogni tappa termina con tipi, lint, test e build verdi.
- I valori predefiniti sono provvisori e devono restare configurabili.
