import express from "express";
import { Client, GatewayIntentBits, ActivityType, Events } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const TARGET_GUILD_ID = process.env.GUILD_ID; // optioneel
const PORT = process.env.PORT || 3000;

if (!token) {
  console.error("❌ DISCORD_TOKEN ontbreekt in environment variables.");
  process.exit(1);
}

/* ---------- Discord Bot ---------- */
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

async function setWatchingPresence() {
  try {
    let guild;

    if (TARGET_GUILD_ID) {
      guild = await client.guilds.fetch(TARGET_GUILD_ID);
    } else {
      // probeer cache, anders fetch lijst
      guild = client.guilds.cache.first();
      if (!guild) {
        const all = await client.guilds.fetch();
        guild = all.first();
      }
    }

    const serverName = guild?.name ?? "this server";

    await client.user.setPresence({
      status: "online",
      activities: [{ name: serverName, type: ActivityType.Watching }],
    });

    console.log(`✅ Presence ingesteld: Watching ${serverName}`);
  } catch (err) {
    console.error("⚠️ Kon presence niet instellen:", err);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`🤖 Ingelogd als ${client.user.tag}`);
  await setWatchingPresence();
});

client.on(Events.GuildCreate, setWatchingPresence);
client.on(Events.GuildDelete, setWatchingPresence);

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

client.login(token);

/* ---------- Mini Webserver voor Render ---------- */
const app = express();

// eenvoudige root
app.get("/", (_req, res) => {
  res.status(200).send("Presence Watch Bot is running.");
});

// healthcheck voor uptime monitors & Render
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`🌐 Webserver luistert op port ${PORT} - health: /health`);
});
