# Discord Bridge for DCTS

This amazing plugin enables you to message between DCTS and discord!

---

## Requirements!

### Step 1

In order for this plugin to run you need to execute the following command in the DCTS root folder:

```bash
bun add discord.js@latest			
```

### Step 2

Go to https://discord.com/developers/applications and create a new bot. There are plenty of tutorials out there! Once done copy your bot token as we will need it for the next step.

### Step 3

Now that you made a bot, invite the bot to one of the servers you try to sync. Its important to give it full permissions so it can sync all channels, roles, members and alike. Source code is on github.

### Step 4

Now go to the DCTS Server Settings page and navigate to the plugin settings. There you have an option to enter a bot token. Do that and save. You're done!

### Step 5

Now restart your DCTS server. It will begin starting the integrated discord bot and sync data with discord. It will generate a new group inside DCTS. Once that is done you can chat on DCTS and people will see it on the discord and reverse!