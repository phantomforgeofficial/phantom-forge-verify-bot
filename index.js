import express from "express";
import { promises as fs } from "fs";
import path from "node:path";
import {
  Client, GatewayIntentBits, Partials, ActivityType, Events, EmbedBuilder,
} from "discord.js";

const token = process.env.DISCORD_TOKEN;
const TARGET_GUILD_ID = process.env.GUILD_ID;
const STATUS_CHANNEL_ID = process.env.STATUS_CHANNEL_ID || "1429121620194234478";
const UPDATE_INTERVAL_MS = Number(process.env.UPDATE_INTERVAL_MS ?? 1000);
const PORT = process.env.PORT || 3000;

if (!token) throw new Error("DISCORD_TOKEN ontbreekt in env");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel, Partials.Message],
});

let startedAt = Date.now();
let statusMessageId = null;
let isUpdating = false;

// Data-bestand in de werkdirectory van Render-service
const DATA_FILE = path.resolve(process.cwd(), "data.json");

async function readData() {
  try {
    const txt = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(txt);
  } catch {
    return {};
  }
}
async function writeData(obj) {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(obj, null, 2), "utf8");
  } catch (e) {
    console.warn("Kon data.json niet schrijven:", e.message);
  }
}

function fmtUptime(ms) {
  const s = Math.floor(ms/1000);
  const h = String(Math.floor(s/3600)).padStart(2,"0");
  const m = String(Math.floor((s%3600)/60)).padStart(2,"0");
  const sec = String(s%60).padStart(2,"0");
  return `${h}:${m}:${sec}`;
}

async function resolveGuildName() {
  try {
    if (TARGET_GUILD_ID) {
      const g = await client.guilds.fetch(TARGET_GUILD_ID);
      return g?.name ?? "this server";
    }
    let g = client.guilds.cache.first();
    if (!g) g = (await client.guilds.fetch()).first();
    return g?.name ?? "this server";
  } catch { return "this server"; }
}

async function setWatchingPresence() {
  const name = await resolveGuildName();
  await client.user.setPresence({ status: "online", activities: [{ name, type: ActivityType.Watching }] });
}

function buildStatusEmbed() {
  const now = new Date();
  const dateTime = now.toLocaleString("nl-NL", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
  const footerTime = now.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  return new EmbedBuilder()
    .setTitle("🕰️ Phantom Forge Verify Bot Status")
    .setColor(0x6c2bd9)
    .setDescription("**Active:**\n✅ Online")
    .addFields(
      { name: "⏱️ Uptime", value: `\`${fmtUptime(Date.now()-startedAt)}\``, inline: true },
      { name: "📡 Ping", value: `${Math.round(client.ws.ping)} ms`, inline: true },
      { name: "📅 Last update", value: dateTime, inline: false }
    )
    .setFooter({ text: `🕯️ Live updated every second | Phantom Forge • vandaag om ${footerTime}` });
}

async function updateOrCreateStatusMessage() {
  if (isUpdating) return;
  isUpdating = true;
  try {
    const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
    if (!channel?.isTextBased()) { console.error("STATUS_CHANNEL_ID geen tekstkanaal"); return; }

    if (!statusMessageId) {
      const data = await readData();
      statusMessageId = data.statusMessageId || null;
    }

    if (statusMessageId) {
      try {
        const msg = await channel.messages.fetch(statusMessageId);
        await msg.edit({ embeds: [buildStatusEmbed()] });
        return;
      } catch { statusMessageId = null; }
    }

    const sent = await channel.send({ embeds: [buildStatusEmbed()] });
    statusMessageId = sent.id;
    await writeData({ statusMessageId });
    console.log("Nieuw statusbericht geplaatst:", statusMessageId);
  } catch (e) {
    console.error("update/create fout:", e.message);
  } finally {
    isUpdating = false;
  }
}

let interval = null;
client.once(Events.ClientReady, async () => {
  console.log(`Ingelogd als ${client.user.tag}`);
  startedAt = Date.now();
  await setWatchingPresence();
  await updateOrCreateStatusMessage();
  interval = setInterval(updateOrCreateStatusMessage, UPDATE_INTERVAL_MS);
});
client.on(Events.GuildCreate, setWatchingPresence);
client.on(Events.GuildDelete, setWatchingPresence);
process.on("SIGTERM", ()=>{ if (interval) clearInterval(interval); process.exit(0); });
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);
client.login(token);

// Web server (Render)
const app = express();
app.get("/", (_req,res)=>res.status(200).send("Verify Status Bot is running."));
app.get("/health", (_req,res)=>res.status(200).json({ ok:true, uptime:process.uptime(), ping:Math.round(client.ws.ping) }));
app.listen(PORT, ()=>console.log(`Listening on ${PORT} (/health)`));
