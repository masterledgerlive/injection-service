import dotenv from "dotenv";
import { createApp } from "./app";

dotenv.config();

const port = process.env.PORT || 3001;

async function startServer(): Promise<void> {
  try {
    const { app } = await createApp();

    app.listen(port, () => {
      console.log(
        `[Service] Injection Service running on http://localhost:${port}`
      );
      console.log(`[Service] Health check: http://localhost:${port}/health`);
      console.log(`[Service] API: http://localhost:${port}/api/chains`);
      console.log(`[Service] Default chain: base-sepolia (84532)`);
    });
  } catch (error) {
    console.error("[Service] Failed to start:", error);
    process.exit(1);
  }
}

startServer();
