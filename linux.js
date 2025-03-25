// You will need to install yt-dlp_linux from https://github.com/yt-dlp/yt-dlp/releases.
// If it reports 403, try a different IP. YouTube has started ratelimiting IPs, so don't make issues if you get a 403/IP ban.
// Make sure to make a music-bot-installer.sh in the directory ./ (root) with the following code:
// `chmod +x /home/container/yt-dlp_linux`
// This ensures the yt-dlp_linux binary is executable. If you're running this on a VPS, VDS, or similar, this is required.
// If you are on a free/shared host, which uses Pterodactyl (for example), just make the .sh file and upload the yt-dlp_linux onto your File tab.
// If the stdout says `stdout:`, with plain text, it will still work, since it managed to successfully chmod the .sh file!

// Important Values - Fill In
const token = "YOUR_TOKEN_HERE";

// Code
const { Client, GatewayIntentBits } = require("discord.js");
const path = require('path');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} = require("@discordjs/voice");
const { spawn, exec } = require("child_process");

exec("chmod +x ./music-bot-installer.sh", (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }

    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return;
    }

    console.log(`stdout: ${stdout}`);
});

exec("./music-bot-installer.sh", (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }

    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return;
    }

    console.log(`stdout: ${stdout}`);
  });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const queue = new Map(); // Store guild-specific queues

client.on("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("?") || message.author.bot) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const voiceChannel = message.member?.voice.channel;

  if (!voiceChannel) return message.reply("❌ You must be in a voice channel!");

  const guildQueue = queue.get(message.guild.id) || {
    connection: null,
    player: createAudioPlayer(),
    songs: [],
  };

  switch (command) {
    case "play":
      if (!args.length) return message.reply("❌ Provide a YouTube URL!");
      let songUrl = args[0];
      const youtubeUrlRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\/.+$/;

      // Convert YouTube Music URLs to standard YouTube URLs
      if (songUrl.includes("music.youtube.com")) {
        const videoId = songUrl.split("v=")[1].split("&")[0];
        songUrl = `https://www.youtube.com/watch?v=${videoId}`;
      }

      if (!youtubeUrlRegex.test(songUrl)) {
        return message.reply("❌ Please provide a valid YouTube URL!");
      }

      guildQueue.songs.push(songUrl);
      queue.set(message.guild.id, guildQueue);

      if (!guildQueue.connection) {
        guildQueue.connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
        });

        playSong(message.guild.id, message.channel);
      } else {
        message.channel.send(`🎵 Added to queue: ${songUrl}`);
      }
      break;

    case "stop":
      guildQueue.songs = [];
      if (guildQueue.connection) {
        guildQueue.connection.destroy();
        queue.delete(message.guild.id);
      }
      message.reply("⏹️ Stopped the music!");
      break;

    case "pause":
      guildQueue.player.pause();
      message.reply("⏸️ Paused the music!");
      break;

    case "resume":
      guildQueue.player.unpause();
      message.reply("▶️ Resumed the music!");
      break;

    case "skip":
      if (guildQueue.songs.length > 1) {
        guildQueue.songs.shift();
        playSong(message.guild.id, message.channel);
        message.reply("⏭️ Skipped the song!");
      } else {
        message.reply("❌ No more songs in the queue!");
      }
      break;

    default:
      message.reply("❌ Unknown command!");
  }
});

function playSong(guildId, textChannel) {
  textChannel.send("⏳ Loading...");
  const guildQueue = queue.get(guildId);
  if (!guildQueue || !guildQueue.songs.length) return;

  const url = guildQueue.songs[0];
    
  // Define the path to yt-dlp.exe (same directory as bot)
  const ytDlpPath = path.join(__dirname, 'yt-dlp_linux');

  // Spawn yt-dlp with lower priority
  const process = spawn(ytDlpPath, [
    "--no-part", // Prevents slow fragmented downloads
    "--force-ipv4", // Forces IPv4 (bypasses throttling)
    "--http-chunk-size", "10M", // Larger chunks to speed up the download
    "-x", "--audio-format", "best", "-o", "-", url,
  ]);

  const resource = createAudioResource(process.stdout);
  guildQueue.player.play(resource);
  guildQueue.connection.subscribe(guildQueue.player);

  textChannel.send(`🎶 Now playing: ${url}`);

  guildQueue.player.once(AudioPlayerStatus.Idle, () => {
    guildQueue.songs.shift();
    if (guildQueue.songs.length > 0) {
      playSong(guildId, textChannel);
    } else {
      guildQueue.connection.destroy();
      queue.delete(guildId);
    }
  });

  process.stderr.on("data", (data) => console.error(`yt-dlp error: ${data}`));
}
  
client.login(token);
