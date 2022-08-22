const fs = require("fs");
const path = require("path");
const { Collection, Routes, PermissionsBitField } = require("discord.js");
const { REST } = require('@discordjs/rest');
const { isAsyncFunction } = require("util/types");
const chalk = require("chalk")

module.exports = class interactionHandler {
    constructor(client, token, options = {}) {
        this.client = client;
        this.token = token;
        this.commands = new Collection();
        this.events = new Collection();
        this.commandsJSON = [];
        this.options = options;
    }
    log(msg) {
        if (this.options.log) {
            this.options.log(msg);
        }
    }
    async putGuildCommands() {
        const clientId = this.client.user.id;
        const guilds = await this.client.guilds.fetch();
        const rest = new REST({ version: "9" }).setToken(this.token);
        guilds.forEach(async guild => {
            await rest.put(
                Routes.applicationGuildCommands(clientId, guild.id),
                { body: this.commandsJSON },
            )
            this.log(chalk.blueBright(`Refreshed (/) commands for "${guild.name}"`))
        })
    }

    async loadCommands(commandDir, eventDir) {
        const commandFiles = this.readAllFiles(commandDir).filter(file => file.endsWith(".js"));
        const eventFiles = this.readAllFiles(eventDir).filter(file => file.endsWith(".js"));
        for (const commandFile of commandFiles) {
            const commandSrc = require(commandFile);
            const command = commandSrc.command;
            if (!command) continue;
            const commandName = command.name;
            if (!commandName) throw new Error("Command does not have a name");
            const execute = commandSrc.execute;
            if (!execute) throw new Error(`Command: ${commandName} does not export an execute function`);
            if (!isAsyncFunction(execute)) throw new Error(`Execute function of ${commandName} command is not async`);
            const load = commandSrc.load;
            if (load) {
                if (!isAsyncFunction(execute)) throw new Error(`Load function of ${commandName} command is not async`);
                load(this.bot);
            }
            const permissions = commandSrc.permissions;
            this.commands.set(commandName, { execute: execute, permissions: permissions | null });
            this.commandsJSON.push(command.toJSON());
            this.log(chalk.green(`Loaded command: ${commandName}`));
        }
        for (const eventFile of eventFiles) {
            const eventSrc = require(eventFile);
            const event = eventSrc.event;
            if (!event) continue;
            const eventId = event.id;
            if (!eventId) throw new Error(`Event doesn't export a id`);
            const execute = event.execute;
            if (!execute) throw new Error(`Event: ${eventId} does not export an execute function`);
            const load = eventSrc.load;
            if (load) {
                if (!isAsyncFunction(execute)) throw new Error(`Load function of ${commandName} command is not async`);
                load(this.bot);
            }
            const permissions = eventSrc.permissions;
            this.events.set(eventId, { execute: execute, permissions: permissions | null });
            this.log(chalk.green(`Loaded event: ${eventId}`));
        }
    }

    async handleInteraction(interaction) {
        if (interaction.isCommand()) {
            const { execute, permissions } = this.commands.get(interaction.commandName);
            if (permissions) {
                if (!interaction.member.permissions.has(permissions)) return;
            }
            if (!execute) return;
            await execute(this.client, interaction);
        } else {
            const { execute, permissions } = this.events.get(interaction.customId);
            if (permissions) {
                if (!interaction.member.permissions.has(permissions)) return;
            }
            if (!execute) return;
            await execute(this.client, interaction);
        }
    }

    readAllFiles(dir) {
        const files = [];
        const getFilesRecursively = (directory) => {
            const filesInDirectory = fs.readdirSync(directory);
            for (const file of filesInDirectory) {
                const absolute = path.join(directory, file);
                if (fs.statSync(absolute).isDirectory()) {
                    getFilesRecursively(absolute);
                } else {
                    files.push(absolute);
                }
            }
        };
        getFilesRecursively(dir);
        return files;
    }
}
