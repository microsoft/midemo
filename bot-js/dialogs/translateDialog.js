// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { InputHints, MessageFactory } = require('botbuilder');
const { TextPrompt, WaterfallDialog } = require('botbuilder-dialogs');
const { CancelAndHelpDialog } = require('./cancelAndHelpDialog');

const request = require('request-promise-native');

const TEXT_PROMPT = 'textPrompt';
const WATERFALL_DIALOG = 'waterfallDialog';

class TranslateDialog extends CancelAndHelpDialog {
    constructor(id) {
        super(id || 'translateDialog');

        this.addDialog(new TextPrompt(TEXT_PROMPT))
            .addDialog(new WaterfallDialog(WATERFALL_DIALOG, [
                this.initialStep.bind(this),
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
        const msg = await this.getTranslation(stepContext);
        await stepContext.context.sendActivity(msg, msg, InputHints.IgnoringInput);
        return await stepContext.endDialog();
    }

    async getTranslation(stepContext) {
        return new Promise((resolve, reject) => {
            const extraConfig = stepContext.options;
            const optsMsg = {
                method: 'POST',
                uri: extraConfig.TranslateEndpoint + "/translate?api-version=3.0&to=es&to=en&to=pt&to=fr&to=it&to=ja",
                headers: {
                    'Ocp-Apim-Subscription-Key': extraConfig.TranslateKey
                },
                body: [{
                    'text': stepContext.result
                }],
                json: true
            };
            request(optsMsg)
                .then(function(data) {
                    data.forEach(result => {
                        let language = '';
                        result.translations.forEach(t => {
                            language += t.to + ' - ' + t.text + '\n\n';
                        });
                        let lang = '';
                        if (result.detectedLanguage.language === 'es') {
                            lang = 'Español';
                        } else if (result.detectedLanguage.language === 'en') {
                            lang = 'Ingles';
                        } else if (result.detectedLanguage.language === 'pt') {
                            lang = 'Portuges';
                        } else if (result.detectedLanguage.language === 'fr') {
                            lang = 'Frances';
                        } else if (result.detectedLanguage.language === 'it') {
                            lang = 'Italiano';
                        } else {
                            lang = result.detectedLanguage.language;
                        }
                        language = 'Traducido del ' + lang + '\n\nTraducciones\n\n' + language;
                        resolve(language);
                    });

                })
                .catch(function(err) {
                    resolve('No fue posible realizar la traducción, por favor intente nuevamente.');
                });
        });
    };
}

module.exports.TranslateDialog = TranslateDialog;