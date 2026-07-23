import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import process from "node:process";

import {
  backupDatabase,
  getDatabaseSchemaVersion,
  openDatabase,
  SqliteQuestRepository,
} from "../packages/database/dist/index.js";
import {
  loadProviderConfig,
  ResilientHttpClient,
  RuneScapeWikiQuestProvider,
} from "../packages/providers/dist/index.js";

const databasePath =
  process.env.GIELINOR_DB_PATH ?? join(homedir(), ".gielinor-companion", "gielinor.db");
const extension = extname(databasePath);
const backupPath =
  extension.length === 0
    ? `${databasePath}-before-v0.2.db`
    : `${databasePath.slice(0, -extension.length)}-before-v0.2${extension}`;

let backupCreated = false;
if (existsSync(databasePath) && !existsSync(backupPath)) {
  await backupDatabase(databasePath, backupPath);
  backupCreated = true;
}

const database = openDatabase(databasePath);
try {
  const profilesBefore = database
    .prepare("SELECT id, profile_json FROM player_profiles ORDER BY id")
    .all();
  const config = loadProviderConfig();
  const provider = new RuneScapeWikiQuestProvider({
    httpClient: new ResilientHttpClient({
      userAgent: config.userAgent,
      timeoutMs: config.timeoutMs,
      retries: config.retries,
    }),
    apiUrl: config.wikiApiUrl,
    pageUrl: config.wikiPageUrl,
  });
  const repository = new SqliteQuestRepository(database);
  const result = await repository.replaceSnapshot(await provider.fetchSnapshot());
  const profilesAfter = database
    .prepare("SELECT id, profile_json FROM player_profiles ORDER BY id")
    .all();

  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: getDatabaseSchemaVersion(database),
        backupCreated,
        backupAvailable: existsSync(backupPath),
        profilesUnchanged: JSON.stringify(profilesBefore) === JSON.stringify(profilesAfter),
        profiles: profilesAfter.map((row) => {
          const profile = JSON.parse(row.profile_json);
          return {
            id: row.id,
            displayName: profile.displayName,
            gameMode: profile.gameMode,
          };
        }),
        sync: result,
        status: await repository.getDataStatus(),
      },
      null,
      2,
    )}\n`,
  );
} finally {
  database.close();
}
