// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// index.js is used to setup and configure your bot

// Import required packages
const path = require('path');
const restify = require('restify');
const azureStorage = require('azure-storage');

// Import required bot services. See https://aka.ms/bot-services to learn more about the different parts of a bot.
const { BotFrameworkAdapter, ConversationState, InputHints, MemoryStorage, UserState } = require('botbuilder');
const { BotLuisRecognizer } = require('./dialogs/BotLuisRecognizer');

// This bot's main dialog.
const { DialogAndWelcomeBot } = require('./bots/dialogAndWelcomeBot');
const { MainDialog } = require('./dialogs/mainDialog');

// the bot's booking dialog
const { BookingDialog } = require('./dialogs/bookingDialog');
const BOOKING_DIALOG = 'bookingDialog';

// Certificate dialog
const { CertificateDialog } = require('./dialogs/certificateDialog');
const CERTIFICATE_DIALOG = 'certificateDialog';

// Sensor dialog
const { SensorDialog } = require('./dialogs/sensorDialog');
const SENSOR_DIALOG = 'sensorDialog';

// Forex dialog
const { ForexDialog } = require('./dialogs/forexDialog');
const FOREX_DIALOG = 'forexDialog';

// Translation dialog
const { TranslateDialog } = require('./dialogs/translateDialog');
const TRANSLATE_DIALOG = 'translateDialog';

// Machine Learning dialog
const { MachineDialog } = require('./dialogs/machineDialog');
const MACHINE_DIALOG = 'machineDialog';

// Computer Vision dialog
const { VisionDialog } = require('./dialogs/visionDialog');
const VISION_DIALOG = 'visionDialog';

// Note: Ensure you have a .env file and include LuisAppId, LuisAPIKey and LuisAPIHostName.
const ENV_FILE = path.join(__dirname, '.env');
require('dotenv').config({ path: ENV_FILE });

// Create adapter.
// See https://aka.ms/about-bot-adapter to learn more about adapters.
const adapter = new BotFrameworkAdapter({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
});

// Catch-all for errors.
adapter.onTurnError = async(context, error) => {
    // This check writes out errors to console log
    // NOTE: In production environment, you should consider logging this to Azure
    //       application insights.
    console.error(`\n [onTurnError]: ${ error }`);
    // Send a message to the user
    const onTurnErrorMessage = 'Disculpas, parece que algo no ha salido bien!';
    await context.sendActivity(onTurnErrorMessage, onTurnErrorMessage, InputHints.ExpectingInput);
    // Clear out state
    await conversationState.delete(context);
};

// Define a state store for your bot. See https://aka.ms/about-bot-state to learn more about using MemoryStorage.
// A bot requires a state store to persist the dialog and user state between messages.

// For local development, in-memory storage is used.
// CAUTION: The Memory Storage used here is for local bot debugging only. When the bot
// is restarted, anything stored in memory will be gone.
const memoryStorage = new MemoryStorage();
const conversationState = new ConversationState(memoryStorage);
const userState = new UserState(memoryStorage);

// If configured, pass in the BotLuisRecognizer.  (Defining it externally allows it to be mocked for tests)
const {
    BingAPIKey,
    ComputerVisionEndpoint,
    ComputerVisionApiKey,
    CustomVisionEndpoint,
    CustomVisionEndpoint2,
    CustomVisionApiKey,
    FaceEndpoint,
    FaceApiKey,
    FaceGroupId,
    FacePersonId,
    ForexEndpoint,
    ForexKey,
    ForexUrl,
    IoTStorageAccount,
    IoTStorageAccessKey,
    IoTStorageConnectionString,
    LuisAppId,
    LuisAPIKey,
    LuisAPIHostName,
    MLApiKey,
    MLApiUrl,
    QnAKnowledgebaseId,
    QnAAuthKey,
    QnAEndpointHostName,
    TranslateEndpoint,
    TranslateKey
} = process.env;

const luisConfig = { applicationId: LuisAppId, endpointKey: LuisAPIKey, endpoint: LuisAPIHostName };
const luisOption = { bingSpellCheckSubscriptionKey: BingAPIKey, spellCheck: true };
const luisRecognizer = new BotLuisRecognizer(luisConfig, luisOption);

const tableService = azureStorage.createTableService(IoTStorageAccount, IoTStorageAccessKey, IoTStorageConnectionString);

// Map knowledge base endpoint values from .env file into the required format for `QnAMaker`.
const qnaConfig = { knowledgeBaseId: QnAKnowledgebaseId, endpointKey: QnAAuthKey, host: QnAEndpointHostName };
const extraConfig = {
    ComputerVisionEndpoint,
    ComputerVisionApiKey,
    CustomVisionEndpoint,
    CustomVisionEndpoint2,
    CustomVisionApiKey,
    FaceEndpoint,
    FaceApiKey,
    FaceGroupId,
    FacePersonId,
    ForexEndpoint,
    ForexKey,
    ForexUrl,
    MLApiKey,
    MLApiUrl,
    TranslateEndpoint,
    TranslateKey
}

// Create the main dialog.
const bookingDialog = new BookingDialog(BOOKING_DIALOG);
const certificateDialog = new CertificateDialog(CERTIFICATE_DIALOG);
const machineDialog = new MachineDialog(MACHINE_DIALOG);
const sensorDialog = new SensorDialog(SENSOR_DIALOG);
const forexDialog = new ForexDialog(FOREX_DIALOG);
const translateDialog = new TranslateDialog(TRANSLATE_DIALOG);
const visionDialog = new VisionDialog(VISION_DIALOG);
const dialogs = [bookingDialog, certificateDialog, forexDialog, machineDialog, sensorDialog, translateDialog, visionDialog];
const dialog = new MainDialog(luisRecognizer, qnaConfig, extraConfig, tableService, dialogs);
const bot = new DialogAndWelcomeBot(conversationState, userState, dialog);

// Create HTTP server
const server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function() {
    console.log(`\n${ server.name } listening to ${ server.url }`);
});

// Listen for incoming activities and route them to your bot main dialog.
server.post('/api/messages', (req, res) => {
    // Route received a request to adapter for processing
    adapter.processActivity(req, res, async(turnContext) => {
        // route to bot activity handler.
        await bot.run(turnContext);
    });
});