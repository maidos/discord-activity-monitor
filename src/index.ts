import * as Cluster from "cluster"
import { Client, forkWorkerClient, loadConfig, Logger } from "disharmony"
import { resolve } from "path";
import commands from "./commands"
import ActivityRegisterer from "./core/activity-registerer";
import Message from "./models/message";

const { config, configPath, isLocalDb } = loadConfig()

if (Cluster.isMaster)
{
    const client = new Client(commands, Message, config!)
    client.initialize(config.token)
        .then(() =>
        {
            new ActivityRegisterer(client).startListening()
            setInterval(runInactivityManager, 24 * 60 * 60 * 1000, client, !isLocalDb);
            runInactivityManager(client, !isLocalDb)
                .catch(err => Logger.debugLogError("Error running inactivity monitor for the first time. It is likely that subsequent executions will also error.", err))
        })
        .catch(async err =>
        {
            await Logger.consoleLogError("Error during initialisation", err)
            process.exit(1)
        })
}

async function runInactivityManager(client: Client<Message>, useForkedProcess: boolean)
{
    const path = "./core/inactivity-manager"
    if (useForkedProcess)
        forkWorkerClient(resolve(__dirname, path), configPath)
    else
    {
        // tslint:disable-next-line: variable-name
        const InactivityManager = (await import(path)).default
        await new InactivityManager(client).manageInactiveUsersInAllGuilds()
        await Logger.debugLog("Finished managing inactives")
    }
}