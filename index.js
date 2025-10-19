import express from "express";
import { promises as fs } from "fs";
import path from "node:path";
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  Events,
  EmbedBuilder,
} from "discord.js";

const token = process.env.DISCORD_TOKEN;
const STATUS_CHANNEL_ID = process.env.STATUS_CHANNEL_ID || "1429121620194234478";
const BOT_LOGO_URL = process.env.BOT_LOGO_URL || "https://i.postimg.cc/5yNrQYcn/phantom-verify.png";
const UPDATE_INTERVAL_MS = Number(process.env.UPDATE_INTERVAL_MS ?? 1000);
const PORT = process.env.PORT || 3000;

if (!token) throw new Error("❌ DISCORD_TOKEN ontbreekt in .env");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel, Partials.Message],
});

const DATA_FILE = path.resolve(process.cwd(), "data.json");

let startedAt = Date.now();
let statusMessageId = null;
let updating = false;

/* ------------------ Helpers ------------------ */
async function readData() {
  try {
    const txt = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(txt);
  } catch {
    return {};
  }
}
async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

/* ------------------ Embed ------------------ */
function buildStatusEmbed() {
  const now = new Date();
  const dateTime = now.toLocaleString("nl-NL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const footerTime = now.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return new EmbedBuilder()
    .setTitle("🕓 Phantom Forge Verify Bot Status")
    .setColor(0x6c2bd9)
    .setDescription("**Active:**\n✅ Online")
    .addFields(
      { name: "Uptime", value: `\`${fmtUptime(Date.now() - startedAt)}\``, inline: true },
      { name: "Ping", value: `${Math.round(client.ws.ping)} ms`, inline: true },
      { name: "Last update", value: dateTime, inline: false }
    )
    .setThumbnail(BOT_LOGO_URL) // 👈 logo linksonder
    .setFooter({
      text: `Live updated every second | Phantom Forge • vandaag om ${footerTime}`,
    });
}

/* ------------------ Update Logic ------------------ */
async function updateStatus() {
  if (updating) return;
  updating = true;
  try {
    const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
    if (!channel?.isTextBased()) return console.error("❌ Kanaal niet geldig");

    if (!statusMessageId) {
      const data = await readData();
      statusMessageId = data.statusMessageId || null;
    }

    // Probeer bestaand bericht te bewerken
    if (statusMessageId) {
      try {
        const msg = await channel.messages.fetch(statusMessageId);
        await msg.edit({ embeds: [buildStatusEmbed()] });
        updating = false;
        return;
      } catch {
        console.warn("⚠️ Bericht niet gevonden — nieuw bericht aanmaken");
        statusMessageId = null;
      }
    }

    // Nieuw bericht als er nog geen bestaat
    const sent = await channel.send({ embeds: [buildStatusEmbed()] });
    statusMessageId = sent.id;
    await writeData({ statusMessageId });
    console.log(`💾 Nieuw statusbericht gemaakt (ID: ${statusMessageId})`);
  } catch (err) {
    console.error("Fout bij update:", err.message);
  } finally {
    updating = false;
  }
}

/* ------------------ Bot Setup ------------------ */
let interval = null;

client.once(Events.ClientReady, async () => {
  console.log(`🤖 Ingelogd als ${client.user.tag}`);
  startedAt = Date.now();

  // Presence
  const firstGuild = client.guilds.cache.first() || (await client.guilds.fetch()).first();
  const guildName = firstGuild?.name ?? "this server";
  client.user.setPresence({
    status: "online",
    activities: [{ name: guildName, type: ActivityType.Watching }],
  });

  await updateStatus();
  interval = setInterval(updateStatus, UPDATE_INTERVAL_MS);
});

process.on("SIGTERM", () => {
  if (interval) clearInterval(interval);
  process.exit(0);
});
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

client.login(token);

/* ------------------ Render Webserver ------------------ */
const app = express();
app.get("/", (_req, res) => res.status(200).send("Verify Status Bot is running."));
app.get("/health", (_req, res) =>
  res.status(200).json({
    ok: true,
    uptime: process.uptime(),
    ping: Math.round(client.ws.ping),
  })
);
app.listen(PORT, () => console.log(`🌐 Webserver luistert op port ${PORT} → /health`));
