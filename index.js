import express from "express";
import {
  Client, GatewayIntentBits, Partials,
  ActivityType, Events, EmbedBuilder
} from "discord.js";

const token = process.env.DISCORD_TOKEN;
const TARGET_GUILD_ID = process.env.GUILD_ID;
const STATUS_CHANNEL_ID = process.env.STATUS_CHANNEL_ID;
const STATUS_MESSAGE_ID = process.env.STATUS_MESSAGE_ID;
const EDIT_ONLY = String(process.env.EDIT_ONLY ?? "true").toLowerCase() === "true";
const UPDATE_INTERVAL_MS = Number(process.env.UPDATE_INTERVAL_MS ?? 1000);
const PORT = process.env.PORT || 3000;

if (!token) throw new Error("DISCORD_TOKEN ontbreekt.");
if (!STATUS_CHANNEL_ID) throw new Error("STATUS_CHANNEL_ID ontbreekt.");
if (!STATUS_MESSAGE_ID) throw new Error("STATUS_MESSAGE_ID ontbreekt.");
if (!EDIT_ONLY) console.warn("⚠️ EDIT_ONLY=false — zet op true om spam te voorkomen.");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel, Partials.Message],
});

let startedAt = Date.now();
let intervalHandle = null;
let updating = false; // lock om overlap te voorkomen

const fmtUptime = (ms)=>{
  const s = Math.floor(ms/1000);
  const h = String(Math.floor(s/3600)).padStart(2,"0");
  const m = String(Math.floor((s%3600)/60)).padStart(2,"0");
  const sec = String(s%60).padStart(2,"0");
  return `${h}:${m}:${sec}`;
};

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
  await client.user.setPresence({
    status: "online",
    activities: [{ name, type: ActivityType.Watching }],
  });
}

function buildStatusEmbed() {
  const now = new Date();
  const dateTime = now.toLocaleString("nl-NL", {
    hour12:false, year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", second:"2-digit"
  });
  const footerTime = now.toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit"});

  return new EmbedBuilder()
    .setTitle("🕰️ Phantom Forge Verify Bot Status")
    .setColor(0x6c2bd9)
    .setDescription("**Active:**\n✅ Online")
    .addFields(
      { name: "Uptime", value: `\`${fmtUptime(Date.now()-startedAt)}\``, inline: true },
      { name: "Ping", value: `${Math.round(client.ws.ping)} ms`, inline: true },
      { name: "Last update", value: dateTime, inline: false }
    )
    .setFooter({ text: `🕯️ Live updated every second | Phantom Forge • vandaag om ${footerTime}` });
}

async function editOnlyUpdate() {
  if (updating) return;           // voorkom overlap
  updating = true;
  try {
    const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
    const msg = await channel.messages.fetch(STATUS_MESSAGE_ID);

    // **Strikte edit-only**: als edit faalt → NIETS posten
    await msg.edit({ embeds: [buildStatusEmbed()] });
  } catch (e) {
    console.error("Edit mislukte:", e.message);
    // absoluut niets sturen bij fout (geen fallback!)
  } finally {
    updating = false;
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`🤖 Ingelogd als ${client.user.tag}`);
  startedAt = Date.now();
  await setWatchingPresence();

  await editOnlyUpdate(); // eerste update

  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(editOnlyUpdate, UPDATE_INTERVAL_MS);
});

// Presence opnieuw zetten bij guild-wijzigingen, zonder te posten
client.on(Events.GuildCreate, setWatchingPresence);
client.on(Events.GuildDelete, setWatchingPresence);

process.on("SIGTERM", ()=> { if (intervalHandle) clearInterval(intervalHandle); process.exit(0); });
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

client.login(token);

/* ---- Webserver voor Render ---- */
const app = express();
app.get("/", (_req,res)=>res.status(200).send("Verify Status Bot is running."));
app.get("/health", (_req,res)=>res.status(200).json({ ok:true, uptime:process.uptime(), ping:Math.round(client.ws.ping) }));
app.listen(PORT, ()=>console.log(`🌐 Listening on ${PORT} (/health)`));
