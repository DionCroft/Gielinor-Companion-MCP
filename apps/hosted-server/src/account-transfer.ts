import { ProfileExportSchema } from "@gielinor/shared-types";
import { z } from "zod";

export const HostedAccountImportSchema = z
  .object({
    schemaVersion: z.literal(1),
    profiles: z.array(ProfileExportSchema).max(20),
  })
  .strict();

export type HostedAccountImport = z.infer<typeof HostedAccountImportSchema>;

export type HostedAccountExport = HostedAccountImport & {
  exportedAt: string;
};
