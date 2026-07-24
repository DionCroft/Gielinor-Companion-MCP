import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import process from "node:process";

import {
  backupDatabase,
  getDatabaseSchemaVersion,
  openDatabase,
  SqlitePriceRepository,
} from "../packages/database/dist/index.js";
import {
  JagexGrandExchangeProvider,
  loadProviderConfig,
  ResilientHttpClient,
} from "../packages/providers/dist/index.js";

const databasePath =
  process.env.GIELINOR_DB_PATH ?? join(homedir(), ".gielinor-companion", "gielinor.db");
const extension = extname(databasePath);
const backupPath =
  extension.length === 0
    ? `${databasePath}-before-v0.4.db`
    : `${databasePath.slice(0, -extension.length)}-before-v0.4${extension}`;

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
  const provider = new JagexGrandExchangeProvider({
    httpClient: new ResilientHttpClient({
      userAgent: config.userAgent,
      timeoutMs: config.timeoutMs,
      retries: config.retries,
    }),
    endpoint: config.geUrl,
    graphEndpoint: config.geGraphUrl,
    bulkEndpoint: config.geBulkUrl,
    cachePolicy: config.geCache,
    historyCachePolicy: config.geHistoryCache,
  });
  const repository = new SqlitePriceRepository(database);
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
        profileCount: profilesAfter.length,
        profilesUnchanged: JSON.stringify(profilesBefore) === JSON.stringify(profilesAfter),
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
