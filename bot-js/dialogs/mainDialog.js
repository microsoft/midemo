// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { TimexProperty } = require('@microsoft/recognizers-text-data-types-timex-expression');
const { MessageFactory, InputHints } = require('botbuilder');
const { ChoiceFactory } = require('botbuilder-choices');
const { CardFactory } = require('botbuilder-core');
const { LuisRecognizer, QnAMaker } = require('botbuilder-ai');
const { ChoicePrompt, ComponentDialog, DialogSet, DialogTurnStatus, TextPrompt, WaterfallDialog } = require('botbuilder-dialogs');

const InitialCard = require('../resources/initialCard.json');
const MAIN_WATERFALL_DIALOG = 'mainWaterfallDialog';
const TEXT_PROMPT = 'TextPrompt';
const CHOICE_PROMPT = 'ChoicePrompt';

class MainDialog extends ComponentDialog {
    constructor(luisRecognizer, qnaConfig, extraConfig, tableService, dialogs) {
        super('MainDialog');
        if (!qnaConfig) throw new Error('[QnaMakerBot]: Missing parameter. configuration is required');
        if (!luisRecognizer) throw new Error('[MainDialog]: Missing parameter \'luisRecognizer\' is required');
        this.luisRecognizer = luisRecognizer;
        this.qnaMaker = new QnAMaker(qnaConfig, {});
        this.extraConfig = extraConfig;
        this.tableService = tableService;

        // Define the main dialog and its related components.
        this.addDialog(new TextPrompt(TEXT_PROMPT));
        this.addDialog(new ChoicePrompt(CHOICE_PROMPT));
        dialogs.forEach(dialog => {
            this.addDialog(dialog);
        });
        this.addDialog(new WaterfallDialog(MAIN_WATERFALL_DIALOG, [
            this.introStep.bind(this),
            this.actStep.bind(this),
            this.finalStep.bind(this)
        ]));

        this.initialDialogId = MAIN_WATERFALL_DIALOG;
    }

    /**
     * The run method handles the incoming activity (in the form of a TurnContext) and passes it through the dialog system.
     * If no dialog is active, it will start the default dialog.
     * @param {*} turnContext
     * @param {*} accessor
     */
    async run(turnContext, accessor) {
        const dialogSet = new DialogSet(accessor);
        dialogSet.add(this);

        const dialogContext = await dialogSet.createContext(turnContext);
        const results = await dialogContext.continueDialog();
        if (results.status === DialogTurnStatus.empty) {
            await dialogContext.beginDialog(this.id);
        }
    }

    /**
     * First step in the waterfall dialog. Prompts the user for a command.
     * Currently, this expects a booking request, like "book me a flight from Paris to Berlin on march 22"
     * Note that the sample LUIS model will only recognize Paris, Berlin, New York and London as airport cities.
     */
    async introStep(stepContext) {
        if (!this.luisRecognizer.isConfigured) {
            const messageText = 'NOTE: LUIS is not configured. To enable all capabilities, add `LuisAppId`, `LuisAPIKey` and `LuisAPIHostName` to the .env file.';
            await stepContext.context.sendActivity(messageText, null, InputHints.IgnoringInput);
            return await stepContext.next();
        }

        const messageText = stepContext.options.restartMsg ? stepContext.options.restartMsg : '¿Qué puedo hacer para ayudarle el día de hoy?';
        const promptMessage = MessageFactory.text(messageText, messageText, InputHints.ExpectingInput);
        if (stepContext.options.restartMsg) {
            return await stepContext.prompt('TextPrompt', { prompt: promptMessage });
        } else {
            return await stepContext.next();
        }
    }

    /**
     * Second step in the waterfall.  This will use LUIS to attempt to extract the origin, destination and travel dates.
     * Then, it hands off to the bookingDialog child dialog to collect any remaining details.
     */
    async actStep(stepContext) {
        const bookingDetails = {};
        let question = '';
        let emotion = 0.5;
        const luisResult = await this.luisRecognizer.executeLuisQuery(stepContext.context);
        const intent = LuisRecognizer.topIntent(luisResult).toLowerCase();
        if (luisResult) {
            question = luisResult.text;
            if (luisResult.sentiment) { emotion = luisResult.sentiment.score; }
            if (luisResult.alteredText !== undefined) { question = luisResult.alteredText; }
        }
        let getEmotionMessageText = "";
        if (emotion < 0.4) {
            getEmotionMessageText = "Detecto un sentimiento negativo!";
        } else if (emotion > 0.6) {
            getEmotionMessageText = ""; //Detecto un sentimiento positivo!
        }
        if (getEmotionMessageText !== "") {
            await stepContext.context.sendActivity(getEmotionMessageText, getEmotionMessageText, InputHints.IgnoringInput);
        }
        switch (intent) {
            case 'bookflight':
                // Extract the values for the composite entities from the LUIS result.
                const fromEntities = this.luisRecognizer.getFromEntities(luisResult);
                const toEntities = this.luisRecognizer.getToEntities(luisResult);

                // Show a warning for Origin and Destination if we can't resolve them.
                await this.showWarningForUnsupportedCities(stepContext.context, fromEntities, toEntities);

                // Initialize BookingDetails with any entities we may have found in the response.
                bookingDetails.destination = toEntities.airport;
                bookingDetails.origin = fromEntities.airport;
                bookingDetails.travelDate = this.luisRecognizer.getTravelDate(luisResult);

                // Run the BookingDialog passing in whatever details we have from the LUIS call, it will fill out the remainder.
                return await stepContext.beginDialog('bookingDialog', bookingDetails);

            case 'initial':
                // directline, msteams, telegram, facebook, slack
                const activity = stepContext.context.activity;
                const channelId = activity.channelId;
                const fromId = activity.from.id;
                if (channelId === 'directline' && fromId !== 'miDemoBot.co') {
                    const initialCard = CardFactory.adaptiveCard(InitialCard);
                    return await stepContext.context.sendActivity({ attachments: [initialCard] });
                } else {
                    const getInitialMessageText = ChoiceFactory.forChannel(stepContext.context, ['QnA', 'IoT', 'Traducir', 'Imagen', 'Salario', 'TRM', 'Certificado'], '¿Qué puedo hacer para ayudarle el día de hoy?', '¿Qué puedo hacer para ayudarle el día de hoy?');
                    return await stepContext.context.sendActivity(getInitialMessageText, getInitialMessageText, InputHints.IgnoringInput);
                }

            case 'certificate':
                return await stepContext.beginDialog('certificateDialog', this.extraConfig);

            case 'forex':
                return await stepContext.beginDialog('forexDialog', this.extraConfig);

            case 'general':
                const qnaResults = await this.qnaMaker.getAnswers(stepContext.context);
                let getQnAMessageText = 'Lo siento, no entendi su pregunta "' + question + '", puede intentarlo nuevamente?';
                // If an answer was received from QnA Maker, send the answer back to the user.
                if (qnaResults[0]) {
                    getQnAMessageText = qnaResults[0].answer;
                }
                await stepContext.context.sendActivity(getQnAMessageText, getQnAMessageText, InputHints.IgnoringInput);
                break;

            case 'machine':
                return await stepContext.beginDialog('machineDialog', this.extraConfig);

            case 'sensor':
                return await stepContext.beginDialog('sensorDialog', { question, tableService: this.tableService });

            case 'translate':
                return await stepContext.beginDialog('translateDialog', this.extraConfig);

            case 'vision':
                return await stepContext.beginDialog('visionDialog', this.extraConfig);

            case 'none':
                if (stepContext.context.activity.attachments && stepContext.context.activity.attachments.length > 0) {
                    return await stepContext.beginDialog('visionDialog', this.extraConfig);
                }
                if (question !== '') {
                    const getNoneMessageText = 'Lo siento, no entendi su pregunta "' + question + '", puede intentarlo nuevamente?';
                    await stepContext.context.sendActivity(getNoneMessageText, getNoneMessageText, InputHints.IgnoringInput);
                }
                break;

            default:
                // Catch all for unhandled intents
                const didntUnderstandMessageText = 'Lo siento, no entendi su pregunta "' + question + '", puede intentarlo nuevamente? (intent: ' + intent + ')';
                await stepContext.context.sendActivity(didntUnderstandMessageText, didntUnderstandMessageText, InputHints.IgnoringInput);
        }

        return await stepContext.next();
    }

    /**
     * Shows a warning if the requested From or To cities are recognized as entities but they are not in the Airport entity list.
     * In some cases LUIS will recognize the From and To composite entities as a valid cities but the From and To Airport values
     * will be empty if those entity values can't be mapped to a canonical item in the Airport.
     */
    async showWarningForUnsupportedCities(context, fromEntities, toEntities) {
        const unsupportedCities = [];
        if (fromEntities.from && !fromEntities.airport) {
            unsupportedCities.push(fromEntities.from);
        }

        if (toEntities.to && !toEntities.airport) {
            unsupportedCities.push(toEntities.to);
        }

        if (unsupportedCities.length) {
            const messageText = `Sorry but the following airports are not supported: ${ unsupportedCities.join(', ') }`;
            await context.sendActivity(messageText, messageText, InputHints.IgnoringInput);
        }
    }

    async filesAttached(context) {
        const unsupportedCities = [];
        if (fromEntities.from && !fromEntities.airport) {
            unsupportedCities.push(fromEntities.from);
        }

        if (toEntities.to && !toEntities.airport) {
            unsupportedCities.push(toEntities.to);
        }

        if (unsupportedCities.length) {
            const messageText = `Sorry but the following airports are not supported: ${ unsupportedCities.join(', ') }`;
            await context.sendActivity(messageText, messageText, InputHints.IgnoringInput);
        }
    }

    /**
     * This is the final step in the main waterfall dialog.
     * It wraps up the sample "book a flight" interaction with a simple confirmation.
     */
    async finalStep(stepContext) {
        // If the child dialog ("bookingDialog") was cancelled or the user failed to confirm, the Result here will be null.
        if (stepContext.result) {
            const result = stepContext.result;
            // Now we have all the booking details.

            // This is where calls to the booking AOU service or database would go.

            // If the call to the booking service was successful tell the user.
            const timeProperty = new TimexProperty(result.travelDate);
            const travelDateMsg = timeProperty.toNaturalLanguage(new Date(Date.now()));
            const msg = `I have you booked to ${ result.destination } from ${ result.origin } on ${ travelDateMsg }.`;
            await stepContext.context.sendActivity(msg, msg, InputHints.IgnoringInput);
        }

        // Restart the main dialog with a different message the second time around
        // return await stepContext.replaceDialog(this.initialDialogId, { restartMsg: 'What else can I do for you?' });
        return await stepContext.next();
    }
}

module.exports.MainDialog = MainDialog;