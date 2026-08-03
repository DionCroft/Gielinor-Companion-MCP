import { createServer } from "vite";

export default async function globalSetup() {
  const previousPreviewFlag = process.env.VITE_GIELINOR_ENABLE_PREVIEW;
  process.env.VITE_GIELINOR_ENABLE_PREVIEW = "true";

  const server = await createServer({
    root: process.cwd(),
    mode: "automated-test",
    server: {
      host: "127.0.0.1",
      port: 1420,
      strictPort: true,
    },
  });
  await server.listen();

  return async () => {
    await server.close();
    if (previousPreviewFlag === undefined) {
      delete process.env.VITE_GIELINOR_ENABLE_PREVIEW;
    } else {
      process.env.VITE_GIELINOR_ENABLE_PREVIEW = previousPreviewFlag;
    }
  };
}
