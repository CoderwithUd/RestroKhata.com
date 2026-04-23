const { startServer } = require("next/dist/server/lib/start-server");

async function main() {
  const dir = process.cwd();
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const hostname = process.env.HOSTNAME || "0.0.0.0";

  await startServer({
    dir,
    isDev: true,
    port,
    hostname,
    allowRetry: true,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
