// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { InputHints, MessageFactory } = require('botbuilder');
const { TextPrompt, WaterfallDialog } = require('botbuilder-dialogs');
const { CancelAndHelpDialog } = require('./cancelAndHelpDialog');

const request = require('request-promise-native');

const TEXT_PROMPT = 'textPrompt';
const WATERFALL_DIALOG = 'waterfallDialog';

class ForexDialog extends CancelAndHelpDialog {
    constructor(id) {
        super(id || 'translateDialog');

        this.addDialog(new TextPrompt(TEXT_PROMPT))
            .addDialog(new WaterfallDialog(WATERFALL_DIALOG, [
                // this.initialStep.bind(this),
                this.finalStep.bind(this)
            ]));

        this.initialDialogId = WATERFALL_DIALOG;
    }


    async initialStep(stepContext) {
        const messageText = '¿Que texto quiere traducir?';
        const msg = MessageFactory.text(messageText, messageText, InputHints.ExpectingInput);
        return await stepContext.prompt(TEXT_PROMPT, { prompt: msg });
    }

    /**
     * Complete the interaction and end the dialog.
     */
    async finalStep(stepContext) {
        const msg = await this.getForex(stepContext);
        await stepContext.context.sendActivity(msg, msg, InputHints.IgnoringInput);
        return await stepContext.endDialog();
    }

    async getForex(stepContext) {
        return new Promise((resolve, reject) => {
            const forex = "USD_COP";
            const extraConfig = stepContext.options;
            const optsMsg = {
                method: 'GET',
                uri: extraConfig.ForexEndpoint + '/api/v7/convert?q=' + forex + '&compact=ultra&apiKey=' + extraConfig.ForexKey,
                json: true
            };
            request(optsMsg)
                .then(function(data) {
                    const rate = Math.round(data[forex] * 100) / 100;
                    resolve('La tasa de cambio del dìa es COP ' + rate.toLocaleString() + ' por USD\n\nObtenido de: ' + extraConfig.ForexUrl);
                    resolve(rate);
                })
                .catch(function(err) {
                    console.log(err);
                    resolve('No fue posible obtener la tasa de cambio, por favor intente nuevamente.');
                });
        });
    }
}

module.exports.ForexDialog = ForexDialog;